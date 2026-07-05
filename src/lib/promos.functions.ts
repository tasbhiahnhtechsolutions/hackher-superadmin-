// Promo code CRUD with Stripe sync. Authorization:
// - super_admin: any affiliate (or unassigned)
// - sam: only affiliates whose ancestor chain includes the SAM
// - affiliate: only themselves
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_TOTAL = 0.3;
const MAX_DISCOUNT_PCT = 30;

const CreateSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{3,30}$/, "3-30 alphanumeric chars"),
  discountPercent: z.number().min(1).max(MAX_DISCOUNT_PCT),
  affiliateId: z.string().uuid().optional(),
  campaignLabel: z.string().min(1).max(60).optional(),
  planId: z.string().uuid().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  usageLimit: z.number().int().positive().optional(),
  limitPerCustomer: z.number().int().positive().nullable().optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .regex(/^[A-Za-z0-9]{3,30}$/)
    .optional(),
  discountPercent: z.number().min(1).max(MAX_DISCOUNT_PCT).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  campaignLabel: z.string().min(1).max(60).nullable().optional(),
  planId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  usageCount: z.number().int().min(0).optional(),
  limitPerCustomer: z.number().int().positive().nullable().optional(),
});

async function callerRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role as "super_admin" | "sam" | "manager" | "affiliate" | "customer" | undefined;
}

async function isAncestorOf(ancestorId: string, descendantId: string) {
  const { data } = await supabaseAdmin.rpc("is_ancestor_of", {
    _ancestor: ancestorId,
    _descendant: descendantId,
  });
  return !!data;
}

async function syncToStripe(promoId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .eq("id", promoId)
    .maybeSingle();
  if (!promo) return;
  const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
  try {
    let stripePromoId = promo.stripe_promo_id;

    // If stripePromoId already exists, we deactivate it first to recreate with updated fields (Stripe restricts updating max_redemptions, expires_at, etc.)
    if (stripePromoId) {
      try {
        await stripe.promotionCodes.update(stripePromoId, { active: false });
      } catch (err) {
        console.error("[promo stripe deactivate error]", err);
      }
    }

    // Create a new Coupon since discount/redemptions are immutable on Stripe Coupons
    const coupon = await stripe.coupons.create({
      percent_off: Number(promo.discount_percent),
      duration: "once",
      name: promo.code,
      max_redemptions: promo.usage_limit ?? undefined,
      redeem_by: promo.ends_at
        ? Math.floor(new Date(promo.ends_at).getTime() / 1000)
        : undefined,
      metadata: { promo_id: promo.id, affiliate_id: promo.affiliate_id ?? "" },
    });
    const couponId = coupon.id;

    // Create new Promotion Code
    const restrictions: Stripe.PromotionCodeCreateParams.Restrictions = {};
    if (promo.limit_per_customer === 1) {
      restrictions.first_time_transaction = true;
    }
    const sp = await stripe.promotionCodes.create({
      coupon: couponId,
      code: promo.code,
      max_redemptions: promo.usage_limit ?? undefined,
      expires_at: promo.ends_at
        ? Math.floor(new Date(promo.ends_at).getTime() / 1000)
        : undefined,
      restrictions,
      active: promo.status === "active",
      metadata: { promo_id: promo.id },
    } as any);
    stripePromoId = sp.id;

    await supabaseAdmin
      .from("promo_codes")
      .update({
        stripe_coupon_id: couponId,
        stripe_promo_id: stripePromoId,
      })
      .eq("id", promoId);
  } catch (e) {
    console.error("[promo stripe sync]", e);
  }
}

export const createPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const role = await callerRole(userId);
    if (!role || role === "customer") {
      throw new Error("You don't have permission to create promo codes");
    }

    let affiliateId = data.affiliateId ?? null;
    if (role === "affiliate") {
      affiliateId = userId; // force to themselves
    } else {
      if (!affiliateId) throw new Error("Promo codes must be assigned to an affiliate");
      if (role === "sam" || role === "manager") {
        const ok = await isAncestorOf(userId, affiliateId);
        if (!ok) throw new Error("That affiliate is not in your hierarchy");
      }
    }
    // super_admin: any affiliate

    const upperCode = data.code.toUpperCase();
    const { data: existing } = await supabaseAdmin
      .from("promo_codes")
      .select("id")
      .ilike("code", upperCode)
      .maybeSingle();
    if (existing) throw new Error("That code is already taken");

    const { data: created, error } = await supabaseAdmin
      .from("promo_codes")
      .insert({
        code: upperCode,
        discount_percent: data.discountPercent,
        affiliate_id: affiliateId,
        campaign_label: data.campaignLabel ?? null,
        plan_id: data.planId ?? null,
        starts_at: data.startsAt ?? null,
        ends_at: data.endsAt ?? null,
        usage_limit: data.usageLimit ?? null,
        limit_per_customer: data.limitPerCustomer ?? null,
        status: "active",
      } as never)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Failed to create");

    await syncToStripe(created.id);
    return { id: created.id, code: upperCode };
  });

export const updatePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const role = await callerRole(userId);
    if (!role) throw new Error("Unauthorized");

    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!promo) throw new Error("Not found");

    if (role === "customer") throw new Error("Forbidden");
    if (role === "affiliate") {
      if (promo.affiliate_id !== userId) throw new Error("Forbidden");
    } else if (role === "sam" || role === "manager") {
      if (!promo.affiliate_id || !(await isAncestorOf(userId, promo.affiliate_id)))
        throw new Error("Forbidden");
    }

    const patch: {
      code?: string;
      discount_percent?: number;
      status?: "active" | "inactive";
      campaign_label?: string | null;
      plan_id?: string | null;
      starts_at?: string | null;
      ends_at?: string | null;
      usage_limit?: number | null;
      usage_count?: number;
      limit_per_customer?: number | null;
    } = {};
    if (data.discountPercent !== undefined) patch.discount_percent = data.discountPercent;
    if (data.status !== undefined) patch.status = data.status;
    if (data.campaignLabel !== undefined) patch.campaign_label = data.campaignLabel;
    if (data.planId !== undefined) patch.plan_id = data.planId;
    if (data.startsAt !== undefined) patch.starts_at = data.startsAt;
    if (data.endsAt !== undefined) patch.ends_at = data.endsAt;
    if (data.usageLimit !== undefined) patch.usage_limit = data.usageLimit;
    if (data.limitPerCustomer !== undefined) patch.limit_per_customer = data.limitPerCustomer;
    // Only super_admin can rewrite the code or override usage_count
    if (role === "super_admin") {
      if (data.code !== undefined) patch.code = data.code.toUpperCase();
      if (data.usageCount !== undefined) patch.usage_count = data.usageCount;
    }

    const { error } = await supabaseAdmin
      .from("promo_codes")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await syncToStripe(data.id);
    return { ok: true };
  });
