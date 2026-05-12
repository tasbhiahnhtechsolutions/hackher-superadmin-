// POST /api/public/webhooks/stripe — verifies signature with STRIPE_WEBHOOK_SECRET
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const apiKey = process.env.STRIPE_SECRET_KEY;
        if (!sig || !secret || !apiKey) return new Response("not_configured", { status: 503 });

        const stripe = new Stripe(apiKey, { apiVersion: "2025-03-31.basil" as never });
        const raw = await request.text();
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
        } catch (e) {
          console.error("Stripe webhook signature failed", e);
          return new Response("invalid_signature", { status: 400 });
        }

        // Idempotency
        const { data: existing } = await supabaseAdmin
          .from("webhook_logs").select("id").eq("event_id", event.id).maybeSingle();
        if (existing) return new Response("ok");

        await supabaseAdmin.from("webhook_logs").insert({
          source: "stripe", event_id: event.id, event_type: event.type, payload: event as never, processed: false,
        });

        try {
          switch (event.type) {
            case "checkout.session.completed":
            case "customer.subscription.created":
            case "customer.subscription.updated": {
              const sub = (event.data.object as Stripe.Subscription | Stripe.Checkout.Session) as Record<string, unknown>;
              const stripeSubId = (sub.subscription as string | undefined) ?? (sub.id as string | undefined);
              const customerStripeId = sub.customer as string | undefined;
              if (!stripeSubId || !customerStripeId) break;

              const { data: customer } = await supabaseAdmin.from("customers").select("*").eq("stripe_customer_id", customerStripeId).maybeSingle();
              if (!customer) break;

              // Resolve plan via metadata or by fetching the subscription
              const fullSub = await stripe.subscriptions.retrieve(stripeSubId);
              const priceId = fullSub.items.data[0]?.price.id;
              const { data: plan } = await supabaseAdmin.from("plans").select("id,price_cents").eq("stripe_price_id", priceId ?? "").maybeSingle();
              if (!plan) break;

              await supabaseAdmin.from("subscriptions").upsert({
                customer_id: customer.id,
                plan_id: plan.id,
                stripe_subscription_id: stripeSubId,
                status: fullSub.status as never,
                current_period_end: (fullSub as unknown as { current_period_end?: number }).current_period_end
                  ? new Date(((fullSub as unknown as { current_period_end: number }).current_period_end) * 1000).toISOString()
                  : null,
                amount_paid_cents: plan.price_cents,
              }, { onConflict: "stripe_subscription_id" } as never);
              break;
            }
            case "invoice.paid": {
              const inv = event.data.object as Stripe.Invoice;
              await supabaseAdmin.from("transactions").insert({
                stripe_event_id: event.id,
                type: "invoice_paid",
                amount_cents: inv.amount_paid,
                currency: inv.currency,
                raw: inv as never,
              });
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              await supabaseAdmin.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", sub.id);
              break;
            }
          }

          await supabaseAdmin.from("webhook_logs").update({ processed: true }).eq("event_id", event.id);
        } catch (err) {
          console.error("Webhook handler error", err);
          await supabaseAdmin.from("webhook_logs").update({ error: (err as Error).message }).eq("event_id", event.id);
          return new Response("handler_error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
