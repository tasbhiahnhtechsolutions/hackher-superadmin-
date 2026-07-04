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

    const { data: plan, error } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .single();
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
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description ?? undefined,
      });
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
      try {
        await stripe.prices.update(plan.stripe_price_id, { active: false });
      } catch {}
    }

    await supabaseAdmin
      .from("plans")
      .update({
        stripe_product_id: productId,
        stripe_price_id: price.id,
      })
      .eq("id", plan.id);

    return { synced: true, productId, priceId: price.id };
  });

export const syncPromoToStripe = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ promoId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const stripe = getStripe();
    if (!stripe) return { synced: false, reason: "STRIPE_SECRET_KEY not configured" };

    const { data: promo, error } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .eq("id", data.promoId)
      .single();
    if (error || !promo) throw new Error("Promo not found");

    let couponId = promo.stripe_coupon_id;
    if (!couponId) {
      const coupon = await stripe.coupons.create({
        percent_off: Number(promo.discount_percent),
        duration: "once",
        name: promo.code,
        metadata: { promo_id: promo.id, affiliate_id: promo.affiliate_id ?? "" },
      });
      couponId = coupon.id;
    }

    let promoId = promo.stripe_promo_id;
    if (!promoId) {
      const sp = await stripe.promotionCodes.create({
        promotion: { coupon: couponId, type: "coupon" },
        code: promo.code,
        max_redemptions: promo.usage_limit ?? undefined,
        expires_at: promo.ends_at
          ? Math.floor(new Date(promo.ends_at).getTime() / 1000)
          : undefined,
        metadata: { promo_id: promo.id },
      } as never);
      promoId = sp.id;
    } else {
      await stripe.promotionCodes.update(promoId, { active: promo.status === "active" });
    }

    await supabaseAdmin
      .from("promo_codes")
      .update({
        stripe_coupon_id: couponId,
        stripe_promo_id: promoId,
      })
      .eq("id", promo.id);

    return { synced: true, couponId, promoId };
  });

export const syncPlanActionToDjango = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        action: z.enum(["create", "update", "delete"]),
        planData: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable().optional(),
          price_cents: z.number(),
          currency: z.string(),
          interval: z.string(),
          trial_days: z.number(),
          features: z.any(),
          is_active: z.boolean(),
          stripe_product_id: z.string().nullable().optional(),
          stripe_price_id: z.string().nullable().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const djangoApiUrl = process.env.DJANGO_API_URL;
    const s2sSecret = process.env.SUPABASE_S2S_API_KEY || process.env.DJANGO_S2S_SECRET;
    const syncUrl =
      process.env.DJANGO_SYNC_PACKAGE_URL ||
      (djangoApiUrl ? `${djangoApiUrl.replace(/\/$/, "")}/internal/v1/sync-package/` : null);

    if (!syncUrl) {
      console.error("syncPlanActionToDjango: Django API URL not configured");
      return { success: false, reason: "Django API URL not configured" };
    }

    const featuresObj =
      typeof data.planData.features === "object" && data.planData.features !== null
        ? (data.planData.features as any)
        : { features_list: Array.isArray(data.planData.features) ? data.planData.features : [] };

    const payload = {
      action: data.action,
      package_name:
        featuresObj.package_name || data.planData.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      stripe_product_id: data.planData.stripe_product_id || null,
      stripe_default_price_id: data.planData.stripe_price_id || null,
      price: Number((data.planData.price_cents / 100).toFixed(2)),
      actual_price: Number(
        Number(featuresObj.actual_price || data.planData.price_cents / 100).toFixed(2),
      ),
      discount_percent: Number(featuresObj.discount_percent ?? 0),
      guest_limit: Number(featuresObj.guest_limit ?? 1),
      host_limit: Number(featuresObj.host_limit ?? 1),
      extra_host_price: Number(Number(featuresObj.extra_host_price ?? 0).toFixed(2)),
      free_trial_days: Number(featuresObj.free_trial_days ?? data.planData.trial_days ?? 0),
      order: Number(featuresObj.order ?? 0),
      badge_text: featuresObj.badge_text || null,
      is_featured: !!featuresObj.is_featured,
      description: data.planData.description || "",
      billing_interval: data.planData.interval,
      billing_subtext: featuresObj.billing_subtext || null,
      features: featuresObj.features_list || [],
      is_active: data.planData.is_active,
    };

    try {
      console.log(`Sending S2S sync-package to Django: ${syncUrl}`, payload);
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(s2sSecret
            ? {
                Authorization: `Bearer ${s2sSecret}`,
                "X-API-Key": s2sSecret,
              }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Django sync-package failed: ${res.status} ${res.statusText} - ${text}`);
        return { success: false, reason: `Django returned status ${res.status}: ${text}` };
      }

      console.log(`Django sync-package succeeded: ${res.status}`);
      return { success: true };
    } catch (err) {
      console.error("Django sync-package error:", err);
      return { success: false, reason: (err as Error).message };
    }
  });

export const deletePlanServerFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    // 1. Fetch the plan first to have its data
    const { data: plan, error: fetchErr } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .single();

    if (fetchErr || !plan) {
      throw new Error("Plan not found");
    }

    // 2. Delete from Supabase
    const { error: delErr } = await supabaseAdmin.from("plans").delete().eq("id", data.planId);

    if (delErr) {
      throw delErr;
    }

    // 3. Archive in Stripe
    const stripe = getStripe();
    if (stripe) {
      if (plan.stripe_price_id) {
        try {
          await stripe.prices.update(plan.stripe_price_id, { active: false });
        } catch (e) {
          console.error("Failed to archive stripe price:", e);
        }
      }
      if (plan.stripe_product_id) {
        try {
          await stripe.products.update(plan.stripe_product_id, { active: false });
        } catch (e) {
          console.error("Failed to archive stripe product:", e);
        }
      }
    }

    // 4. Sync Delete to Django
    const djangoApiUrl = process.env.DJANGO_API_URL;
    const s2sSecret = process.env.SUPABASE_S2S_API_KEY || process.env.DJANGO_S2S_SECRET;
    const syncUrl =
      process.env.DJANGO_SYNC_PACKAGE_URL ||
      (djangoApiUrl ? `${djangoApiUrl.replace(/\/$/, "")}/internal/v1/sync-package/` : null);

    if (syncUrl) {
      const featuresObj = plan.features as any;
      const payload = {
        id: plan.id,
        package_id: plan.id,
        action: "delete",
        package_name:
          (featuresObj && featuresObj.package_name) ||
          plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        stripe_product_id: plan.stripe_product_id || null,
        stripe_default_price_id: plan.stripe_price_id || null,
      };

      try {
        await fetch(syncUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(s2sSecret
              ? {
                  Authorization: `Bearer ${s2sSecret}`,
                  "X-API-Key": s2sSecret,
                }
              : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error("Failed to sync delete to Django:", e);
      }
    }

    return { deleted: true };
  });
