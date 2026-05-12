// Server functions for hierarchy management (creating subordinate users).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAppEmail } from "@/lib/email/send.server";

// Default commission rates across the chain (must total 15% to leave 15% headroom for the discount = 30% cap)
const COMMISSION_AFFILIATE = 0.10;
const COMMISSION_MANAGER = 0.04;
const COMMISSION_SAM = 0.01;
const MAX_COMBINED = 0.30;

const CreateSubordinateSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(["sam", "manager", "affiliate"]),
  commissionRate: z.number().min(0).max(0.3).optional(),
  // Optional override for affiliate auto-generated discount; otherwise computed to satisfy 30% rule
  discountPercent: z.number().min(1).max(30).optional(),
});

function slugify(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "AFF";
}

async function generateUniquePromoCode(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 10; i++) {
    const suffix = Math.floor(100 + Math.random() * 900);
    const code = `${base}${suffix}`.slice(0, 30);
    const { data } = await supabaseAdmin.from("promo_codes").select("id").ilike("code", code).maybeSingle();
    if (!data) return code;
  }
  return `${base}${Date.now().toString().slice(-6)}`.slice(0, 30);
}

async function syncPromoToStripeInline(promoId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { synced: false };
  const { data: promo } = await supabaseAdmin.from("promo_codes").select("*").eq("id", promoId).maybeSingle();
  if (!promo) return { synced: false };
  const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
  try {
    const coupon = await stripe.coupons.create({
      percent_off: Number(promo.discount_percent),
      duration: "forever",
      name: promo.code,
      metadata: { promo_id: promo.id, affiliate_id: promo.affiliate_id ?? "" },
    });
    const sp = await stripe.promotionCodes.create({
      promotion: { coupon: coupon.id, type: "coupon" },
      code: promo.code,
      metadata: { promo_id: promo.id },
    } as never);
    await supabaseAdmin.from("promo_codes").update({
      stripe_coupon_id: coupon.id,
      stripe_promo_id: sp.id,
    }).eq("id", promoId);
    return { synced: true };
  } catch (e) {
    console.error("[promo sync] failed", e);
    return { synced: false };
  }
}

export const createSubordinate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSubordinateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: callerRoleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const callerRole = callerRoleRow?.role;

    const allowedByCaller: Record<string, string[]> = {
      super_admin: ["sam", "manager", "affiliate"],
      sam: ["manager"],
      manager: ["affiliate"],
    };
    const allowed = allowedByCaller[callerRole ?? ""] ?? [];
    if (!allowed.includes(data.role)) {
      throw new Error(`You don't have permission to create a ${data.role}`);
    }

    // Default commission per role if not provided
    const defaultRate =
      data.role === "affiliate" ? COMMISSION_AFFILIATE :
      data.role === "manager" ? COMMISSION_MANAGER :
      data.role === "sam" ? COMMISSION_SAM : 0;
    const commissionRate = data.commissionRate ?? defaultRate;

    // Determine discount for affiliate auto-promo (enforce 30% rule)
    const headroom = Math.max(0, MAX_COMBINED - (COMMISSION_AFFILIATE + COMMISSION_MANAGER + COMMISSION_SAM));
    const headroomPct = Math.floor(headroom * 100); // 15
    const discountPercent = data.role === "affiliate"
      ? Math.min(data.discountPercent ?? headroomPct, headroomPct)
      : 0;

    // Create auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, role: data.role },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    const newId = created.user.id;

    await supabaseAdmin.from("profiles").update({
      parent_user_id: userId,
      commission_rate: commissionRate,
    }).eq("id", newId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });

    // Auto-create promo code for affiliates
    let promoCode: string | null = null;
    if (data.role === "affiliate") {
      promoCode = await generateUniquePromoCode(data.fullName || data.email.split("@")[0]);
      const { data: promoRow } = await supabaseAdmin.from("promo_codes").insert({
        code: promoCode,
        discount_percent: discountPercent,
        affiliate_id: newId,
        status: "active",
      }).select("id").single();
      if (promoRow) {
        await syncPromoToStripeInline(promoRow.id);
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "create_subordinate",
      entity_type: "profile",
      entity_id: newId,
      new_values: { email: data.email, role: data.role, promo_code: promoCode },
    });

    // Send welcome email
    const appUrl = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "https://app.hackher.ai";
    if (data.role === "affiliate" && promoCode) {
      sendAppEmail({
        to: data.email,
        template: "affiliate_welcome",
        userId: newId,
        category: "subscription",
        data: {
          name: data.fullName,
          email: data.email,
          tempPassword: data.password,
          promoCode,
          discountPercent,
          commissionPercent: Math.round(commissionRate * 100),
          dashboardUrl: `${appUrl}/affiliate`,
        },
      }).catch((e) => console.error("[affiliate welcome email]", e));
    } else {
      sendAppEmail({
        to: data.email,
        template: "welcome",
        userId: newId,
        category: "subscription",
        data: { name: data.fullName, appUrl },
      }).catch((e) => console.error("[welcome email]", e));
    }

    return { id: newId, email: data.email, role: data.role, promoCode };
  });
