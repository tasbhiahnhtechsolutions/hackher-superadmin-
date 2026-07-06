// POST /api/customer/subscription/cancel — { subscription_id, immediate? } => { canceled, cancel_at_period_end }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

const Schema = z.object({
  subscription_id: z.string().min(1).max(255),
  immediate: z.boolean().optional(),
});

export const Route = createFileRoute("/api/customer/subscription/cancel")({
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

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("id,stripe_subscription_id")
          .or(
            `id.eq.${parsed.data.subscription_id},stripe_subscription_id.eq.${parsed.data.subscription_id}`,
          )
          .maybeSingle();
        if (!sub?.stripe_subscription_id) return jsonError(404, "subscription_not_found");

        const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
        if (parsed.data.immediate) {
          console.log(`[Stripe Cancel] Canceling subscription immediately: ${sub.stripe_subscription_id}`);
          const stripeRes = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
          console.log("[Stripe Cancel] Stripe immediate cancellation response:", JSON.stringify(stripeRes, null, 2));

          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "canceled" } as never)
            .eq("id", sub.id);
          return jsonOk({ canceled: true, cancel_at_period_end: false });
        } else {
          console.log(`[Stripe Cancel] Setting cancel_at_period_end = true for: ${sub.stripe_subscription_id}`);
          const stripeRes = await stripe.subscriptions.update(sub.stripe_subscription_id, {
            cancel_at_period_end: true,
          });
          console.log("[Stripe Cancel] Stripe update cancellation response:", JSON.stringify(stripeRes, null, 2));

          return jsonOk({ canceled: false, cancel_at_period_end: true });
        }
      },
    },
  },
});
