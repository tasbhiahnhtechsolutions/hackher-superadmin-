// Server-only fraud detection helpers used by webhooks and signup flows.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FraudSeverity = "low" | "medium" | "high" | "critical";

export async function flagFraud(opts: {
  type: string;
  severity?: FraudSeverity;
  riskScore?: number;
  subjectUserId?: string | null;
  relatedUserId?: string | null;
  subscriptionId?: string | null;
  promoCodeId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("fraud_flags").insert({
    flag_type: opts.type,
    severity: opts.severity ?? "medium",
    risk_score: opts.riskScore ?? 50,
    subject_user_id: opts.subjectUserId ?? null,
    related_user_id: opts.relatedUserId ?? null,
    subscription_id: opts.subscriptionId ?? null,
    promo_code_id: opts.promoCodeId ?? null,
    ip_address: opts.ipAddress ?? null,
    details: (opts.details ?? {}) as never,
  } as never);
}

// Detect: customer email matches affiliate email (self-referral)
export async function detectSelfReferral(customerId: string, affiliateId: string | null) {
  if (!affiliateId) return;
  const [{ data: cust }, { data: aff }] = await Promise.all([
    supabaseAdmin.from("customers").select("email").eq("id", customerId).maybeSingle(),
    supabaseAdmin.from("profiles").select("email").eq("id", affiliateId).maybeSingle(),
  ]);
  if (cust?.email && aff?.email && cust.email.toLowerCase() === aff.email.toLowerCase()) {
    await flagFraud({
      type: "self_referral",
      severity: "high",
      riskScore: 85,
      subjectUserId: affiliateId,
      details: { customer_id: customerId, email: cust.email },
    });
  }
}

// Detect: rapid refund (refund within 48h of payment)
export async function detectRapidRefund(subscriptionStripeId: string, refundCents: number) {
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id,created_at,customer_id")
    .eq("stripe_subscription_id", subscriptionStripeId)
    .maybeSingle();
  if (!sub) return;
  const ageMs = Date.now() - new Date(sub.created_at).getTime();
  if (ageMs < 48 * 60 * 60 * 1000) {
    const { data: cust } = await supabaseAdmin.from("customers").select("affiliate_id,email").eq("id", sub.customer_id).maybeSingle();
    await flagFraud({
      type: "rapid_refund",
      severity: "high",
      riskScore: 75,
      subjectUserId: cust?.affiliate_id ?? null,
      subscriptionId: sub.id,
      details: { refund_cents: refundCents, age_hours: Math.round(ageMs / 3600000), customer_email: cust?.email },
    });
  }
}

// Detect: promo code usage abuse (more than 5 uses in 1h by different customers but suspicious pattern)
export async function detectPromoAbuse(promoCodeId: string) {
  const { data: pc } = await supabaseAdmin
    .from("promo_codes")
    .select("id,code,affiliate_id,usage_count")
    .eq("id", promoCodeId)
    .maybeSingle();
  if (!pc) return;
  // Crude heuristic: usage_count exceeds 100 with no usage_limit
  if ((pc.usage_count ?? 0) > 100) {
    await flagFraud({
      type: "promo_abuse",
      severity: "medium",
      riskScore: 60,
      subjectUserId: pc.affiliate_id,
      promoCodeId: pc.id,
      details: { code: pc.code, usage_count: pc.usage_count },
    });
  }
}
