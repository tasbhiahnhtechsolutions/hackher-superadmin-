// POST /api/v1/subscriptions/create
// Body: { email, full_name?, plan_id, promo_code? } -> { checkout_url, customer_id }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, jsonOk, jsonError, corsPreflight } from "@/lib/api-auth.server";

const Schema = z.object({
  email: z.string().email().max(255),
  full_name: z.string().max(100).optional(),
  plan_id: z.string().uuid(),
  promo_code: z.string().min(3).max(30).regex(/^[A-Za-z0-9]+$/).optional(),
  success_url: z.string().url().max(500),
  cancel_url: z.string().url().max(500),
});

export const Route = createFileRoute("/api/v1/subscriptions/create")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if (!auth.ok) return auth.response;

        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) return jsonError(503, "stripe_not_configured");

        let body: unknown;
        try { body = await request.json(); } catch { return jsonError(400, "invalid_json"); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonError(400, "invalid_input", parsed.error.message);
        const input = parsed.data;

        // Plan
        const { data: plan } = await supabaseAdmin.from("plans").select("*").eq("id", input.plan_id).eq("is_active", true).maybeSingle();
        if (!plan) return jsonError(404, "plan_not_found");
        if (!plan.stripe_price_id) return jsonError(409, "plan_not_synced", "Plan has not been synced to Stripe yet");

        // Promo
        let affiliateId: string | null = null;
        let stripePromoId: string | null = null;
        if (input.promo_code) {
          const { data: promo } = await supabaseAdmin.from("promo_codes").select("*").ilike("code", input.promo_code).maybeSingle();
          if (promo && promo.status === "active" && (!promo.usage_limit || promo.usage_count < promo.usage_limit)) {
            affiliateId = promo.affiliate_id;
            stripePromoId = promo.stripe_promo_id;
          }
        }

        // Upsert customer
        let { data: customer } = await supabaseAdmin.from("customers").select("*").eq("email", input.email).maybeSingle();
        if (!customer) {
          const { data: created } = await supabaseAdmin.from("customers").insert({
            email: input.email,
            full_name: input.full_name ?? null,
            affiliate_id: affiliateId,
          }).select("*").single();
          customer = created;
        }
        if (!customer) return jsonError(500, "customer_create_failed");

        const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });

        // Stripe customer
        let stripeCustomerId = customer.stripe_customer_id;
        if (!stripeCustomerId) {
          const sc = await stripe.customers.create({ email: input.email, name: input.full_name, metadata: { customer_id: customer.id, affiliate_id: affiliateId ?? "" } });
          stripeCustomerId = sc.id;
          await supabaseAdmin.from("customers").update({ stripe_customer_id: stripeCustomerId }).eq("id", customer.id);
        }

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: stripeCustomerId,
          line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
          discounts: stripePromoId ? [{ promotion_code: stripePromoId }] : undefined,
          subscription_data: plan.trial_days > 0 ? { trial_period_days: plan.trial_days } : undefined,
          success_url: input.success_url,
          cancel_url: input.cancel_url,
          metadata: { plan_id: plan.id, customer_id: customer.id, affiliate_id: affiliateId ?? "" },
        });

        return jsonOk({ checkout_url: session.url, customer_id: customer.id, session_id: session.id });
      },
    },
  },
});
