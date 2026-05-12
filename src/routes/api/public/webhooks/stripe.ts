// POST /api/public/webhooks/stripe — verifies signature with STRIPE_WEBHOOK_SECRET
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "super_admin" | "sam" | "manager" | "affiliate" | "customer";

async function attributeCommissions(opts: {
  stripe: Stripe;
  subscriptionId: string;
  invoiceId: string;
  amountCents: number;
  affiliateId: string | null;
}) {
  if (!opts.affiliateId || opts.amountCents <= 0) return;

  // Idempotency: if commissions already exist for this subscription + invoice, skip.
  // We tag by subscription_id + matching cleared_at-day; simplest is to check if any commission
  // already references this subscription with matching created_at minute. Simpler still: rely on
  // webhook idempotency table (already done above).

  const { data: settings } = await supabaseAdmin.from("app_settings").select("commission_hold_days").maybeSingle();
  const holdDays = settings?.commission_hold_days ?? 30;
  const holdUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();

  // Walk ancestor chain
  type Row = { user_id: string; role: AppRole | null; commission_rate: number | null };
  const { data: chain } = await supabaseAdmin.rpc("get_ancestor_chain" as never, { _user_id: opts.affiliateId } as never) as { data: Row[] | null };

  if (!chain?.length) return;

  // Resolve subscription row id
  const { data: subRow } = await supabaseAdmin.from("subscriptions").select("id").eq("stripe_subscription_id", opts.subscriptionId).maybeSingle();
  if (!subRow) return;

  // Pull defaults if a profile doesn't have an explicit rate
  const { data: defaults } = await supabaseAdmin.from("app_settings").select("default_affiliate_rate,default_manager_rate,default_sam_rate").maybeSingle();

  const rateFor = (role: AppRole | null, explicit: number | null): number => {
    if (explicit !== null && explicit !== undefined) return Number(explicit);
    if (role === "affiliate") return Number(defaults?.default_affiliate_rate ?? 0);
    if (role === "manager") return Number(defaults?.default_manager_rate ?? 0);
    if (role === "sam") return Number(defaults?.default_sam_rate ?? 0);
    return 0;
  };

  const inserts: Array<{
    subscription_id: string; beneficiary_id: string; beneficiary_role: AppRole;
    amount_cents: number; rate: number; status: "pending"; hold_until: string;
  }> = [];

  for (const node of chain) {
    if (!node.role || node.role === "super_admin" || node.role === "customer") continue;
    const rate = rateFor(node.role, node.commission_rate);
    if (rate <= 0) continue;
    const cents = Math.floor(opts.amountCents * rate);
    if (cents <= 0) continue;
    inserts.push({
      subscription_id: subRow.id,
      beneficiary_id: node.user_id,
      beneficiary_role: node.role,
      amount_cents: cents,
      rate,
      status: "pending",
      hold_until: holdUntil,
    });
  }

  if (inserts.length) {
    await supabaseAdmin.from("commissions").insert(inserts as never);
  }
}

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
            case "checkout.session.completed": {
              const s = event.data.object as Stripe.Checkout.Session;
              const customerStripeId = typeof s.customer === "string" ? s.customer : s.customer?.id;
              const subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
              const meta = s.metadata ?? {};
              const customerId = meta.customer_id;
              const planId = meta.plan_id;
              const affiliateId = meta.affiliate_id || null;

              if (customerStripeId && customerId) {
                await supabaseAdmin.from("customers").update({ stripe_customer_id: customerStripeId, ...(affiliateId ? { affiliate_id: affiliateId } : {}) }).eq("id", customerId);
              }
              if (subscriptionId && customerId && planId) {
                const fullSub = await stripe.subscriptions.retrieve(subscriptionId);
                const periodEnd = (fullSub as unknown as { current_period_end?: number }).current_period_end;
                const { data: plan } = await supabaseAdmin.from("plans").select("price_cents").eq("id", planId).maybeSingle();
                await supabaseAdmin.from("subscriptions").upsert({
                  customer_id: customerId,
                  plan_id: planId,
                  stripe_subscription_id: subscriptionId,
                  status: fullSub.status as never,
                  current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
                  amount_paid_cents: plan?.price_cents ?? 0,
                }, { onConflict: "stripe_subscription_id" } as never);
              }

              // If used a promo, increment usage
              const discounts = (s as unknown as { total_details?: { breakdown?: { discounts?: Array<{ discount: { promotion_code?: string } }> } } }).total_details?.breakdown?.discounts;
              const promoCodeId = discounts?.[0]?.discount?.promotion_code;
              if (promoCodeId) {
                const { data: pc } = await supabaseAdmin.from("promo_codes").select("id,usage_count").eq("stripe_promo_id", promoCodeId).maybeSingle();
                if (pc) await supabaseAdmin.from("promo_codes").update({ usage_count: (pc.usage_count ?? 0) + 1 }).eq("id", pc.id);
              }
              break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.created": {
              const sub = event.data.object as Stripe.Subscription;
              const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
              await supabaseAdmin.from("subscriptions").update({
                status: sub.status as never,
                current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
              }).eq("stripe_subscription_id", sub.id);
              break;
            }
            case "invoice.paid": {
              const inv = event.data.object as Stripe.Invoice;
              const subId = (inv as unknown as { subscription?: string | null }).subscription;
              await supabaseAdmin.from("transactions").insert({
                stripe_event_id: event.id,
                type: "invoice_paid",
                amount_cents: inv.amount_paid,
                currency: inv.currency,
                raw: inv as never,
              });
              if (subId) {
                // Find local subscription + customer + affiliate
                const { data: subRow } = await supabaseAdmin.from("subscriptions").select("id,customer_id").eq("stripe_subscription_id", subId).maybeSingle();
                if (subRow) {
                  const { data: cust } = await supabaseAdmin.from("customers").select("affiliate_id").eq("id", subRow.customer_id).maybeSingle();
                  await attributeCommissions({
                    stripe, subscriptionId: subId, invoiceId: inv.id ?? "",
                    amountCents: inv.amount_paid, affiliateId: cust?.affiliate_id ?? null,
                  });
                }
              }
              break;
            }
            case "charge.refunded": {
              const charge = event.data.object as Stripe.Charge;
              await supabaseAdmin.from("transactions").insert({
                stripe_event_id: event.id, type: "refund",
                amount_cents: -(charge.amount_refunded ?? 0), currency: charge.currency, raw: charge as never,
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
