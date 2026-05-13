// POST /api/customer/subscription/reactivate — { subscription_id } => { reactivated: true }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

const Schema = z.object({ subscription_id: z.string().min(1).max(255) });

export const Route = createFileRoute("/api/customer/subscription/reactivate")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) return jsonError(503, "stripe_not_configured");
        let body: unknown;
        try { body = await request.json(); } catch { return jsonError(400, "invalid_json"); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonError(400, "invalid_input", parsed.error.message);

        const { data: sub } = await supabaseAdmin
          .from("subscriptions").select("id,stripe_subscription_id,status")
          .or(`id.eq.${parsed.data.subscription_id},stripe_subscription_id.eq.${parsed.data.subscription_id}`)
          .maybeSingle();
        if (!sub?.stripe_subscription_id) return jsonError(404, "subscription_not_found");

        const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
        const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: false });
        return jsonOk({ reactivated: true, status: updated.status });
      },
    },
  },
});
