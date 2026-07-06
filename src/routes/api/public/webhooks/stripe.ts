// POST /api/public/webhooks/stripe — verifies signature with STRIPE_WEBHOOK_SECRET
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAppEmail } from "@/lib/email/send.server";
import { detectSelfReferral, detectRapidRefund } from "@/lib/fraud.server";

const APP_URL = process.env.APP_URL || "https://hackher.ai";

async function notifyAdmins(
  category: "admin_alerts",
  title: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning",
) {
  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, profiles!inner(email,full_name)")
    .eq("role", "super_admin");
  if (!admins?.length) return;
  for (const a of admins as unknown as Array<{
    user_id: string;
    profiles: { email: string; full_name: string | null };
  }>) {
    await supabaseAdmin.rpc(
      "notify_user_with_pref" as never,
      {
        _user_id: a.user_id,
        _category: category,
        _type: "admin_alert",
        _title: title,
        _body: message,
        _link: "/admin",
      } as never,
    );
    await sendAppEmail({
      to: a.profiles.email,
      template: "admin_alert",
      data: { title, message, severity },
      category,
      userId: a.user_id,
    });
  }
}

async function notifyAffiliateChainOfCommission(
  beneficiaryId: string,
  amountCents: number,
  currency: string,
) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("email,full_name")
    .eq("id", beneficiaryId)
    .maybeSingle();
  if (!prof?.email) return;
  await supabaseAdmin.rpc(
    "notify_user_with_pref" as never,
    {
      _user_id: beneficiaryId,
      _category: "commissions",
      _type: "commission_earned",
      _title: "New commission earned",
      _body: `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()} pending`,
      _link: "/affiliate/earnings",
    } as never,
  );
}

type AppRole = "super_admin" | "sam" | "manager" | "affiliate" | "customer";

async function attributeCommissions(opts: {
  stripe: Stripe;
  subscriptionId: string;
  invoiceId: string;
  amountCents: number;
  affiliateId: string | null;
  promoCodeId: string | null;
}) {
  if (!opts.promoCodeId) {
    console.log("No active promo code for this invoice payment. Skipping commission.");
    return;
  }
  if (!opts.affiliateId || opts.amountCents <= 0) return;

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("commission_hold_days")
    .maybeSingle();
  const holdDays = settings?.commission_hold_days ?? 30;
  const holdUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();

  // Walk ancestor chain
  type Row = { user_id: string; role: AppRole | null; commission_rate: number | null };
  const { data: chain } = (await supabaseAdmin.rpc(
    "get_ancestor_chain" as never,
    { _user_id: opts.affiliateId } as never,
  )) as { data: Row[] | null };

  if (!chain?.length) return;

  // Resolve subscription row id
  const { data: subRow } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", opts.subscriptionId)
    .maybeSingle();
  if (!subRow) return;

  // Pull defaults if a profile doesn't have an explicit rate
  const { data: defaults } = await supabaseAdmin
    .from("app_settings")
    .select("default_affiliate_rate,default_manager_rate,default_sam_rate")
    .maybeSingle();

  const rateFor = (role: AppRole | null, explicit: number | null): number => {
    if (explicit !== null && explicit !== undefined) return Number(explicit);
    if (role === "affiliate") return Number(defaults?.default_affiliate_rate ?? 0);
    if (role === "manager") return Number(defaults?.default_manager_rate ?? 0);
    if (role === "sam") return Number(defaults?.default_sam_rate ?? 0);
    return 0;
  };

  const inserts: Array<{
    subscription_id: string;
    beneficiary_id: string;
    beneficiary_role: AppRole;
    amount_cents: number;
    rate: number;
    status: "pending";
    hold_until: string;
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
    for (const ins of inserts) {
      void notifyAffiliateChainOfCommission(ins.beneficiary_id, ins.amount_cents, "usd");
    }
  }
}

async function syncSubscriptionToDjango(opts: {
  djangoUserId: string;
  email: string;
  role: string;
  packageId: string | null;
  packageName: string;
  stripeSubscriptionId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  cancelAtPeriodEnd: boolean;
  stripeRaw?: any;
}) {
  const djangoApiUrl = process.env.DJANGO_API_URL;
  const s2sSecret = process.env.SUPABASE_S2S_API_KEY || process.env.DJANGO_S2S_SECRET;

  if (!djangoApiUrl) {
    console.error("syncSubscriptionToDjango: DJANGO_API_URL is not configured in .env");
    return;
  }

  const payload = {
    user_id: opts.djangoUserId,
    email: opts.email,
    role: opts.role,
    package_id: opts.packageId,
    package_name: opts.packageName,
    stripe_subscription_id: opts.stripeSubscriptionId,
    status: opts.status,
    start_date: opts.startDate || new Date().toISOString(),
    end_date: opts.endDate,
    cancel_at_period_end: opts.cancelAtPeriodEnd,
    stripe_raw: opts.stripeRaw || null,
  };

  try {
    const url = `${djangoApiUrl.replace(/\/$/, "")}/internal/v1/sync-subscription/`;
    console.log("==================================================");
    console.log("🚀 [Django S2S Sync] STARTING SYNC TO DJANGO");
    console.log(`🔗 Target URL: ${url}`);
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
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

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ [Django S2S Sync] FAILED ❌");
      console.error(`Status: ${response.status} ${response.statusText}`);
      console.error(`Response details: ${text}`);
    } else {
      const text = await response.text();
      console.log("✅ [Django S2S Sync] SUCCESS ✅");
      console.log(`Status: ${response.status}`);
      console.log(`Response details: ${text}`);
    }
    console.log("==================================================");
  } catch (error) {
    console.error("❌ [Django S2S Sync] ERROR OCCURRED ❌");
    console.error("Error details:", error);
    console.log("==================================================");
  }
}

function extractSubscriptionIdFromInvoice(inv: Stripe.Invoice): string | null {
  let subId = typeof (inv as any).subscription === "string" ? (inv as any).subscription : (inv as any).subscription?.id;
  if (!subId && inv.lines?.data?.[0]) {
    const line = inv.lines.data[0] as any;
    subId = line.subscription || line.parent?.subscription_item_details?.subscription;
  }
  return subId || null;
}

function getSubscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  if ((sub as any).current_period_end) {
    return (sub as any).current_period_end;
  }
  if (sub.items?.data?.[0]?.current_period_end) {
    return sub.items.data[0].current_period_end;
  }
  return sub.billing_cycle_anchor || sub.trial_end || null;
}

function getSubscriptionPeriodStart(sub: Stripe.Subscription): number | null {
  if ((sub as any).current_period_start) {
    return (sub as any).current_period_start;
  }
  if (sub.items?.data?.[0]?.current_period_start) {
    return sub.items.data[0].current_period_start;
  }
  return sub.start_date || null;
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
          .from("webhook_logs")
          .select("id")
          .eq("event_id", event.id)
          .maybeSingle();
        if (existing) return new Response("ok");

        await supabaseAdmin.from("webhook_logs").insert({
          source: "stripe",
          event_id: event.id,
          event_type: event.type,
          payload: event as never,
          processed: false,
        });

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const s = event.data.object as Stripe.Checkout.Session;
              const customerStripeId = typeof s.customer === "string" ? s.customer : s.customer?.id;
              const subscriptionId =
                typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
              const meta = s.metadata ?? {};
              let affiliateId = meta.affiliate_id || null;

              // Find or map Supabase Customer ID
              let customerId = meta.customer_id;
              if (!customerId && (meta.user_id || meta.email)) {
                const { data: cust } = await supabaseAdmin
                  .from("customers")
                  .select("id")
                  .or(`django_user_id.eq.${meta.user_id},email.eq.${meta.email}`)
                  .maybeSingle();
                if (cust) customerId = cust.id;
              }

              // Retrieve subscription to check for discount / promo codes
              let planId = meta.plan_id;
              let fullSub: Stripe.Subscription | null = null;
              let stripePromoId: string | null = null;
              let promoCodeDbId: string | null = null;

              if (subscriptionId) {
                fullSub = await stripe.subscriptions.retrieve(subscriptionId);
                if (fullSub && (fullSub as any).discount) {
                  const pVal = (fullSub as any).discount.promotion_code;
                  if (typeof pVal === "string") {
                    stripePromoId = pVal;
                  } else if (pVal && typeof pVal === "object") {
                    stripePromoId = pVal.id;
                  }
                }
              }

              // Fallback to checkout session object's discounts if not found on subscription
              if (!stripePromoId) {
                const discounts = (s as any).total_details?.breakdown?.discounts;
                const pVal = discounts?.[0]?.discount?.promotion_code;
                if (typeof pVal === "string") {
                  stripePromoId = pVal;
                } else if (pVal && typeof pVal === "object") {
                  stripePromoId = pVal.id;
                }
              }

              // If a promotion code was used, resolve affiliate and promo code ID
              if (stripePromoId) {
                const { data: promo } = await supabaseAdmin
                  .from("promo_codes")
                  .select("id, affiliate_id")
                  .eq("stripe_promo_id", stripePromoId)
                  .maybeSingle();
                if (promo) {
                  promoCodeDbId = promo.id;
                  if (!affiliateId) {
                    affiliateId = promo.affiliate_id;
                  }
                }
              }

              if (customerStripeId && customerId) {
                await supabaseAdmin
                  .from("customers")
                  .update({
                    stripe_customer_id: customerStripeId,
                    ...(affiliateId ? { affiliate_id: affiliateId } : {}),
                  } as never)
                  .eq("id", customerId);
                if (affiliateId) await detectSelfReferral(customerId, affiliateId);
              }

              // Find or auto-create local Plan stub to satisfy FK constraint
              if (subscriptionId && fullSub) {
                if (!planId) {
                  const priceId = fullSub.items.data[0]?.price?.id;
                  if (priceId) {
                    const { data: existingPlan } = await supabaseAdmin
                      .from("plans")
                      .select("id")
                      .eq("stripe_price_id", priceId)
                      .maybeSingle();
                    if (existingPlan) {
                      planId = existingPlan.id;
                    } else {
                      const { data: newPlan } = await supabaseAdmin
                        .from("plans")
                        .insert({
                          name: meta.package_name || "Django Plan",
                          stripe_price_id: priceId,
                          price_cents: s.amount_total || 0,
                          currency: s.currency || "usd",
                          interval: "month",
                          features: [],
                          is_active: true,
                        } as never)
                        .select("id")
                        .single();
                      if (newPlan) planId = newPlan.id;
                    }
                  }
                }
              }

              if (subscriptionId && customerId && planId) {
                const rawPeriodEnd = fullSub ? getSubscriptionPeriodEnd(fullSub) : null;
                const trialEndsAt = (fullSub && fullSub.trial_end) ? new Date(fullSub.trial_end * 1000).toISOString() : null;
                await supabaseAdmin.from("subscriptions").upsert(
                  {
                    customer_id: customerId,
                    plan_id: planId,
                    stripe_subscription_id: subscriptionId,
                    status: (fullSub ? fullSub.status : "active") as never,
                    current_period_end: rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null,
                    trial_ends_at: trialEndsAt,
                    amount_paid_cents: s.amount_total ?? 0,
                    django_package_id: meta.package_id || null,
                    django_package_name: meta.package_name || null,
                    promo_code_id: promoCodeDbId,
                  } as never,
                  { onConflict: "stripe_subscription_id" } as never,
                );

                // Email customer + notify
                const { data: cust } = await supabaseAdmin
                  .from("customers")
                  .select("email,full_name")
                  .eq("id", customerId)
                  .maybeSingle();
                if (cust?.email) {
                  await sendAppEmail({
                    to: cust.email,
                    template: "subscription_created",
                    data: {
                      planName: meta.package_name || "Subscription",
                      amountCents: s.amount_total ?? 0,
                      currency: s.currency || "usd",
                      appUrl: APP_URL,
                    },
                    category: "subscription",
                    idempotencyKey: `subcreated-${subscriptionId}`,
                  });
                }
              }

              // If used a promo, increment usage
              const discounts = (
                s as unknown as {
                  total_details?: {
                    breakdown?: { discounts?: Array<{ discount: { promotion_code?: string } }> };
                  };
                }
              ).total_details?.breakdown?.discounts;
              const promoCodeId = discounts?.[0]?.discount?.promotion_code;
              if (promoCodeId && subscriptionId) {
                const { data: pc } = await supabaseAdmin
                  .from("promo_codes")
                  .select("id,usage_count")
                  .eq("stripe_promo_id", promoCodeId)
                  .maybeSingle();
                if (pc) {
                  // Prevent double counting if invoice.paid already processed it
                  const { data: dupSub } = await supabaseAdmin
                    .from("subscriptions")
                    .select("id")
                    .eq("stripe_subscription_id", subscriptionId)
                    .eq("promo_code_id", pc.id)
                    .maybeSingle();

                  if (!dupSub) {
                    await supabaseAdmin
                      .from("promo_codes")
                      .update({ usage_count: (pc.usage_count ?? 0) + 1 })
                      .eq("id", pc.id);
                  }
                }
              }

              // Trigger S2S sync to Django immediately
              if (meta.user_id && subscriptionId) {
                const rawPeriodEnd = fullSub ? getSubscriptionPeriodEnd(fullSub) : null;
                const rawPeriodStart = fullSub ? getSubscriptionPeriodStart(fullSub) : null;
                const periodEnd = rawPeriodEnd
                  ? new Date(rawPeriodEnd * 1000).toISOString()
                  : null;
                const startDate = rawPeriodStart
                  ? new Date(rawPeriodStart * 1000).toISOString()
                  : null;
                const cancelAtPeriodEnd = fullSub?.cancel_at_period_end || false;
                await syncSubscriptionToDjango({
                  djangoUserId: meta.user_id,
                  email: meta.email,
                  role: meta.role,
                  packageId: meta.package_id || null,
                  packageName: meta.package_name,
                  stripeSubscriptionId: subscriptionId,
                  status: fullSub ? fullSub.status : "active",
                  startDate,
                  endDate: periodEnd || new Date().toISOString(), // Fallback to satisfy Django field constraint
                  cancelAtPeriodEnd,
                  stripeRaw: fullSub,
                });
              }
              break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.created": {
              const sub = event.data.object as Stripe.Subscription;
              const rawPeriodEnd = getSubscriptionPeriodEnd(sub);
              const rawPeriodStart = getSubscriptionPeriodStart(sub);
              const periodEnd = rawPeriodEnd
                ? new Date(rawPeriodEnd * 1000).toISOString()
                : null;
              const meta = sub.metadata ?? {};

              const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  status: sub.status as never,
                  current_period_end: periodEnd,
                  trial_ends_at: trialEndsAt,
                } as never)
                .eq("stripe_subscription_id", sub.id);

              // Trigger S2S sync to Django on status / period updates (skip if status is canceled)
              if (meta.user_id && sub.status !== "canceled") {
                const startDate = rawPeriodStart
                  ? new Date(rawPeriodStart * 1000).toISOString()
                  : null;
                const cancelAtPeriodEnd = sub.cancel_at_period_end || false;
                await syncSubscriptionToDjango({
                  djangoUserId: meta.user_id,
                  email: meta.email,
                  role: meta.role,
                  packageId: meta.package_id || null,
                  packageName: meta.package_name,
                  stripeSubscriptionId: sub.id,
                  status: sub.status,
                  startDate,
                  endDate: periodEnd || new Date().toISOString(), // Fallback to satisfy Django field constraint
                  cancelAtPeriodEnd,
                  stripeRaw: sub,
                });
              }
              break;
            }
            case "invoice.paid": {
              const inv = event.data.object as Stripe.Invoice;
              const subId = extractSubscriptionIdFromInvoice(inv);
              let subRowId: string | null = null;
              if (subId) {
                const fullSub = await stripe.subscriptions.retrieve(subId);
                const meta = fullSub.metadata ?? {};
                const customerStripeId =
                  typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
                const customerEmail = meta.email || inv.customer_email || null;
                let affiliateId = meta.affiliate_id || null;

                let stripePromoId: string | null = null;
                let promoCodeDbId: string | null = null;

                // 1. Retrieve invoice with expanded discounts to find promotion code
                if (inv.discounts && inv.discounts.length > 0) {
                  try {
                    const expandedInv = await stripe.invoices.retrieve(inv.id, {
                      expand: ["discounts"],
                    });
                    if (expandedInv.discounts && expandedInv.discounts.length > 0) {
                      for (const discount of expandedInv.discounts) {
                        if (typeof discount === "object" && discount.promotion_code) {
                          stripePromoId = typeof discount.promotion_code === "string"
                            ? discount.promotion_code
                            : discount.promotion_code.id;
                          break;
                        }
                      }
                    }
                  } catch (err) {
                    console.error("Failed to retrieve expanded invoice discounts:", err);
                  }
                }

                // 2. Fallback to fullSub.discount if not found on invoice
                if (!stripePromoId && fullSub && (fullSub as any).discount) {
                  const pVal = (fullSub as any).discount.promotion_code;
                  if (typeof pVal === "string") {
                    stripePromoId = pVal;
                  } else if (pVal && typeof pVal === "object") {
                    stripePromoId = pVal.id;
                  }
                }

                if (stripePromoId) {
                  const { data: promo } = await supabaseAdmin
                    .from("promo_codes")
                    .select("id, affiliate_id, usage_count")
                    .eq("stripe_promo_id", stripePromoId)
                    .maybeSingle();
                  if (promo) {
                    promoCodeDbId = promo.id;
                    if (!affiliateId) {
                      affiliateId = promo.affiliate_id;
                    }

                    // Increment usage count only for initial subscription creation, and ensure no double counting
                    if (inv.billing_reason === "subscription_create") {
                      const { data: dupSub } = await supabaseAdmin
                        .from("subscriptions")
                        .select("id")
                        .eq("stripe_subscription_id", subId)
                        .eq("promo_code_id", promo.id)
                        .maybeSingle();

                      if (!dupSub) {
                        const { error: promoUpdErr } = await supabaseAdmin
                          .from("promo_codes")
                          .update({ usage_count: (promo.usage_count ?? 0) + 1 })
                          .eq("id", promo.id);
                        if (promoUpdErr) {
                          console.error("Failed to increment promo code usage count:", promoUpdErr);
                        } else {
                          console.log(`Incremented usage count for promo code ${promo.id}`);
                        }
                      }
                    }
                  }
                }

                let { data: subRow } = await supabaseAdmin
                  .from("subscriptions")
                  .select("id,customer_id,plan_id")
                  .eq("stripe_subscription_id", subId)
                  .maybeSingle();

                if (subRow) {
                  subRowId = subRow.id;
                }

                // If subscription doesn't exist yet in our DB, let's auto-create it using Stripe data
                if (!subRow) {
                  console.log(
                    `Subscription ${subId} not found locally during invoice.paid, creating it now...`,
                  );
                  // Find local customer
                  let customerId = meta.customer_id;
                  if (!customerId && (meta.user_id || customerEmail)) {
                    const { data: cust, error: custErr } = await supabaseAdmin
                      .from("customers")
                      .select("id")
                      .or(`django_user_id.eq.${meta.user_id},email.eq.${customerEmail}`)
                      .maybeSingle();
                    if (custErr) throw custErr;
                    if (cust) {
                      customerId = cust.id;
                    } else {
                      console.log(
                        `Customer not found for email ${customerEmail} / user_id ${meta.user_id}. Auto-creating customer...`,
                      );
                      const { data: newCust, error: newCustErr } = await supabaseAdmin
                        .from("customers")
                        .insert({
                          email: customerEmail || meta.email || "dummy@example.com",
                          django_user_id: meta.user_id || null,
                          stripe_customer_id: customerStripeId || null,
                          affiliate_id: affiliateId || null,
                        } as never)
                        .select("id")
                        .single();
                      if (newCustErr) throw newCustErr;
                      if (newCust) customerId = newCust.id;
                    }
                  }

                  if (customerId && customerStripeId) {
                    const { error: updErr } = await supabaseAdmin
                      .from("customers")
                      .update({
                        stripe_customer_id: customerStripeId,
                        ...(affiliateId ? { affiliate_id: affiliateId } : {}),
                      } as never)
                      .eq("id", customerId);
                    if (updErr) throw updErr;
                    if (affiliateId) await detectSelfReferral(customerId, affiliateId);
                  }

                  // Find or auto-create local Plan stub
                  let planId = meta.plan_id;
                  const priceId = fullSub.items.data[0]?.price?.id;

                  // 1. Try finding by metadata plan_id first
                  if (planId) {
                    const { data: existingPlan } = await supabaseAdmin
                      .from("plans")
                      .select("id")
                      .eq("id", planId)
                      .maybeSingle();
                    if (!existingPlan) {
                      planId = undefined as any; // invalid or deleted plan_id in metadata
                    }
                  }

                  // 2. Try finding by stripe_price_id if meta check failed
                  if (!planId && priceId) {
                    const { data: existingPlan, error: pErr } = await supabaseAdmin
                      .from("plans")
                      .select("id")
                      .eq("stripe_price_id", priceId)
                      .maybeSingle();
                    if (pErr) throw pErr;
                    if (existingPlan) {
                      planId = existingPlan.id;
                    }
                  }

                  // 3. Fallback auto-create only if still not found
                  if (!planId && priceId) {
                    console.log(`Plan not found for price_id ${priceId}. Auto-creating plan stub...`);
                    const { data: newPlan, error: newPErr } = await supabaseAdmin
                      .from("plans")
                      .insert({
                        name: meta.package_name || "Django Plan",
                        stripe_price_id: priceId,
                        price_cents: inv.amount_paid || 0,
                        currency: inv.currency || "usd",
                        interval: "month",
                        features: [],
                        is_active: true,
                      } as never)
                      .select("id")
                      .single();
                    if (newPErr) throw newPErr;
                    if (newPlan) planId = newPlan.id;
                  }

                  if (customerId && planId) {
                    const rawPeriodEnd = getSubscriptionPeriodEnd(fullSub);
                    const rawPeriodStart = getSubscriptionPeriodStart(fullSub);
                    const periodEnd = rawPeriodEnd
                      ? new Date(rawPeriodEnd * 1000).toISOString()
                      : null;
                    const trialEndsAt = (fullSub && fullSub.trial_end) ? new Date(fullSub.trial_end * 1000).toISOString() : null;
                    const { data: newSub, error: subErr } = await supabaseAdmin
                      .from("subscriptions")
                      .upsert(
                        {
                          customer_id: customerId,
                          plan_id: planId,
                          stripe_subscription_id: subId,
                          status: fullSub.status as never,
                          current_period_end: periodEnd,
                          trial_ends_at: trialEndsAt,
                          amount_paid_cents: inv.amount_paid ?? 0,
                          django_package_id: meta.package_id || null,
                          django_package_name: meta.package_name || null,
                          promo_code_id: promoCodeDbId,
                        } as never,
                        { onConflict: "stripe_subscription_id" } as never,
                      )
                      .select("id,customer_id,plan_id")
                      .maybeSingle();

                    if (subErr) throw subErr;
                    if (newSub) {
                      subRow = newSub;
                      subRowId = newSub.id;
                    }

                    // Trigger S2S sync to Django immediately
                    if (meta.user_id) {
                      const startDate = rawPeriodStart
                        ? new Date(rawPeriodStart * 1000).toISOString()
                        : null;
                      const cancelAtPeriodEnd = fullSub.cancel_at_period_end || false;
                      await syncSubscriptionToDjango({
                        djangoUserId: meta.user_id,
                        email: (meta.email || customerEmail) as string,
                        role: meta.role || "guest",
                        packageId: meta.package_id || null,
                        packageName: meta.package_name || "Subscription Plan",
                        stripeSubscriptionId: subId,
                        status: fullSub.status,
                        startDate,
                        endDate: periodEnd || new Date().toISOString(), // Fallback to satisfy Django field constraint
                        cancelAtPeriodEnd,
                        stripeRaw: { subscription: fullSub, invoice: inv },
                      });
                    }
                  }
                }

                if (subRow) {
                  const { data: cust } = await supabaseAdmin
                    .from("customers")
                    .select("email,full_name,affiliate_id")
                    .eq("id", subRow.customer_id)
                    .maybeSingle();
                  const { data: plan } = subRow.plan_id
                    ? await supabaseAdmin
                      .from("plans")
                      .select("name")
                      .eq("id", subRow.plan_id)
                      .maybeSingle()
                    : { data: null };
                  if (cust?.email) {
                    await sendAppEmail({
                      to: cust.email,
                      template: "payment_success",
                      data: {
                        amountCents: inv.amount_paid,
                        currency: inv.currency,
                        planName: plan?.name || "Subscription",
                      },
                      category: "subscription",
                      idempotencyKey: `paid-${inv.id}`,
                    });
                  }
                  await attributeCommissions({
                    stripe,
                    subscriptionId: subId,
                    invoiceId: inv.id ?? "",
                    amountCents: inv.amount_paid,
                    affiliateId: cust?.affiliate_id ?? null,
                    promoCodeId: promoCodeDbId,
                  });
                }
              }

              // Log the transaction
              await supabaseAdmin.from("transactions").insert({
                stripe_event_id: event.id,
                type: "invoice_paid",
                amount_cents: inv.amount_paid,
                currency: inv.currency,
                raw: inv as never,
                subscription_id: subRowId,
              });

              break;
            }
            case "invoice.payment_failed": {
              const inv = event.data.object as Stripe.Invoice;
              const subId = extractSubscriptionIdFromInvoice(inv);
              if (subId) {
                const { data: subRow } = await supabaseAdmin
                  .from("subscriptions")
                  .select("customer_id")
                  .eq("stripe_subscription_id", subId)
                  .maybeSingle();
                if (subRow) {
                  const { data: cust } = await supabaseAdmin
                    .from("customers")
                    .select("email")
                    .eq("id", subRow.customer_id)
                    .maybeSingle();
                  if (cust?.email) {
                    await sendAppEmail({
                      to: cust.email,
                      template: "payment_failed",
                      data: {
                        amountCents: inv.amount_due,
                        currency: inv.currency,
                        updateUrl: `${APP_URL}/account/billing`,
                      },
                      category: "subscription",
                      idempotencyKey: `failed-${inv.id}`,
                    });
                  }
                }
              }
              await notifyAdmins(
                "admin_alerts",
                "Payment failed",
                `Invoice payment failed (${inv.id}) for ${(inv.amount_due / 100).toFixed(2)} ${inv.currency.toUpperCase()}`,
                "warning",
              );
              break;
            }
            case "charge.refunded": {
              const charge = event.data.object as Stripe.Charge;
              let subId = (charge as any).subscription;
              if (!subId && (charge as any).invoice && typeof (charge as any).invoice === "string") {
                try {
                  const inv = await stripe.invoices.retrieve((charge as any).invoice);
                  subId = extractSubscriptionIdFromInvoice(inv);
                } catch (e) {
                  console.error("Failed to retrieve invoice in charge.refunded:", e);
                }
              }
              let subRowId: string | null = null;
              if (subId) {
                const { data: subRow } = await supabaseAdmin
                  .from("subscriptions")
                  .select("id")
                  .eq("stripe_subscription_id", subId)
                  .maybeSingle();
                if (subRow) {
                  subRowId = subRow.id;
                  // Void any pending commissions tied to this subscription so refunded sales don't pay out.
                  await supabaseAdmin
                    .from("commissions")
                    .update({ status: "voided" } as never)
                    .eq("subscription_id", subRow.id)
                    .eq("status", "pending");
                }
                await detectRapidRefund(subId, charge.amount_refunded ?? 0);
              }

              await supabaseAdmin.from("transactions").insert({
                stripe_event_id: event.id,
                type: "refund",
                amount_cents: -(charge.amount_refunded ?? 0),
                currency: charge.currency,
                raw: charge as never,
                subscription_id: subRowId,
              });

              await notifyAdmins(
                "admin_alerts",
                "Refund issued",
                `Refund of ${((charge.amount_refunded ?? 0) / 100).toFixed(2)} ${charge.currency.toUpperCase()} on charge ${charge.id}`,
                "warning",
              );
              break;
            }
            case "charge.dispute.created": {
              const dispute = event.data.object as Stripe.Dispute;
              await notifyAdmins(
                "admin_alerts",
                "Chargeback received",
                `Dispute of ${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()} on charge ${dispute.charge}`,
                "critical",
              );
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const meta = sub.metadata ?? {};

              console.log("[Stripe Webhook] Received customer.subscription.deleted event:");
              console.log(JSON.stringify(sub, null, 2));

              await supabaseAdmin
                .from("subscriptions")
                .update({ status: "canceled" } as never)
                .eq("stripe_subscription_id", sub.id);
              const { data: subRow } = await supabaseAdmin
                .from("subscriptions")
                .select("customer_id,plan_id")
                .eq("stripe_subscription_id", sub.id)
                .maybeSingle();
              if (subRow) {
                const { data: cust } = await supabaseAdmin
                  .from("customers")
                  .select("email")
                  .eq("id", subRow.customer_id)
                  .maybeSingle();
                const { data: plan } = subRow.plan_id
                  ? await supabaseAdmin
                    .from("plans")
                    .select("name")
                    .eq("id", subRow.plan_id)
                    .maybeSingle()
                  : { data: null };
                if (cust?.email) {
                  await sendAppEmail({
                    to: cust.email,
                    template: "subscription_canceled",
                    data: { planName: plan?.name || "Subscription" },
                    category: "subscription",
                    idempotencyKey: `canceled-${sub.id}`,
                  });
                }
              }

              // Trigger S2S sync to Django immediately on cancellation is disabled to prevent circular loop
              // because cancel/reactivate is managed from Django directly.
              break;
            }
          }

          await supabaseAdmin
            .from("webhook_logs")
            .update({ processed: true })
            .eq("event_id", event.id);
        } catch (err) {
          console.error("Webhook handler error", err);
          await supabaseAdmin
            .from("webhook_logs")
            .update({ error: (err as Error).message })
            .eq("event_id", event.id);
          return new Response("handler_error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
