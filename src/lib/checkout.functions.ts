// Public checkout: create Stripe Checkout Session for a plan, with optional promo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(100).optional(),
  planId: z.string().uuid(),
  promoCode: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9]+$/)
    .optional(),
  origin: z.string().url().max(500),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe is not configured");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .eq("is_active", true)
      .maybeSingle();
    if (!plan) throw new Error("Plan not found");
    if (!plan.stripe_price_id) throw new Error("Plan has not been synced to Stripe yet");

    let affiliateId: string | null = null;
    let stripePromoId: string | null = null;
    if (data.promoCode) {
      const { data: promo } = await supabaseAdmin
        .from("promo_codes")
        .select("*")
        .ilike("code", data.promoCode)
        .maybeSingle();
      if (
        promo &&
        promo.status === "active" &&
        (!promo.usage_limit || promo.usage_count < promo.usage_limit)
      ) {
        affiliateId = promo.affiliate_id;
        stripePromoId = promo.stripe_promo_id;
      }
    }

    let { data: customer } = await supabaseAdmin
      .from("customers")
      .select("*")
      .eq("email", data.email)
      .maybeSingle();
    if (!customer) {
      const { data: created } = await supabaseAdmin
        .from("customers")
        .insert({
          email: data.email,
          full_name: data.fullName ?? null,
          affiliate_id: affiliateId,
        })
        .select("*")
        .single();
      customer = created;
    }
    if (!customer) throw new Error("Failed to create customer");

    // Check for existing active or trialing subscription to prevent duplicate subscriptions
    const { data: existingActiveSubs } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customer.id)
      .in("status", ["active", "trialing"])
      .limit(1);

    if (existingActiveSubs && existingActiveSubs.length > 0) {
      throw new Error("You already have an active subscription.");
    }



    const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });

    let stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      const sc = await stripe.customers.create({
        email: data.email,
        name: data.fullName,
        metadata: { customer_id: customer.id, affiliate_id: affiliateId ?? "" },
      });
      stripeCustomerId = sc.id;
      await supabaseAdmin
        .from("customers")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", customer.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      discounts: stripePromoId ? [{ promotion_code: stripePromoId }] : undefined,
      subscription_data: plan.trial_days > 0 ? { trial_period_days: plan.trial_days } : undefined,
      success_url: `${data.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.origin}/checkout/cancel`,
      metadata: { plan_id: plan.id, customer_id: customer.id, affiliate_id: affiliateId ?? "" },
    });

    return { url: session.url };
  });
