// POST /api/customer/billing/update-payment-method — { customer_id, return_url } => { portal_url }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

const Schema = z.object({
  customer_id: z.string().min(1).max(255),
  return_url: z.string().url().max(500),
});

export const Route = createFileRoute("/api/customer/billing/update-payment-method")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) return jsonError(503, "stripe_not_configured");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "invalid_json");
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonError(400, "invalid_input", parsed.error.message);

        const { data: cust } = await supabaseAdmin
          .from("customers")
          .select("id,stripe_customer_id,email")
          .or(`id.eq.${parsed.data.customer_id},email.eq.${parsed.data.customer_id}`)
          .maybeSingle();
        if (!cust?.stripe_customer_id) return jsonError(404, "customer_not_found");

        const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
        const session = await stripe.billingPortal.sessions.create({
          customer: cust.stripe_customer_id,
          return_url: parsed.data.return_url,
        });
        return jsonOk({ portal_url: session.url });
      },
    },
  },
});
