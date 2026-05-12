// Stripe sync server functions for plans and promo codes (BYOK).
// Requires STRIPE_SECRET_KEY env var. If absent, sync calls return {synced:false}.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
}

export const syncPlanToStripe = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const stripe = getStripe();
    if (!stripe) return { synced: false, reason: "STRIPE_SECRET_KEY not configured" };

    const { data: plan, error } = await supabaseAdmin.from("plans").select("*").eq("id", data.planId).single();
    if (error || !plan) throw new Error("Plan not found");

    let productId = plan.stripe_product_id;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { plan_id: plan.id },
      });
      productId = product.id;
    } else {
      await stripe.products.update(productId, { name: plan.name, description: plan.description ?? undefined });
    }

    // Create new price (Stripe prices are immutable). Archive old one.
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.price_cents,
      currency: plan.currency,
      recurring: { interval: plan.interval as Stripe.PriceCreateParams.Recurring.Interval },
      metadata: { plan_id: plan.id },
    });

    if (plan.stripe_price_id && plan.stripe_price_id !== price.id) {
      try { await stripe.prices.update(plan.stripe_price_id, { active: false }); } catch {}
    }

    await supabaseAdmin.from("plans").update({
      stripe_product_id: productId,
      stripe_price_id: price.id,
    }).eq("id", plan.id);

    return { synced: true, productId, priceId: price.id };
  });

export const syncPromoToStripe = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ promoId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const stripe = getStripe();
    if (!stripe) return { synced: false, reason: "STRIPE_SECRET_KEY not configured" };

    const { data: promo, error } = await supabaseAdmin.from("promo_codes").select("*").eq("id", data.promoId).single();
    if (error || !promo) throw new Error("Promo not found");

    let couponId = promo.stripe_coupon_id;
    if (!couponId) {
      const coupon = await stripe.coupons.create({
        percent_off: Number(promo.discount_percent),
        duration: "forever",
        name: promo.code,
        metadata: { promo_id: promo.id, affiliate_id: promo.affiliate_id ?? "" },
      });
      couponId = coupon.id;
    }

    let promoId = promo.stripe_promo_id;
    if (!promoId) {
      const sp = await stripe.promotionCodes.create({
        coupon: couponId,
        code: promo.code,
        max_redemptions: promo.usage_limit ?? undefined,
        expires_at: promo.ends_at ? Math.floor(new Date(promo.ends_at).getTime() / 1000) : undefined,
        metadata: { promo_id: promo.id },
      });
      promoId = sp.id;
    } else {
      await stripe.promotionCodes.update(promoId, { active: promo.status === "active" });
    }

    await supabaseAdmin.from("promo_codes").update({
      stripe_coupon_id: couponId,
      stripe_promo_id: promoId,
    }).eq("id", promo.id);

    return { synced: true, couponId, promoId };
  });
