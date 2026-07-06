// Server functions for hierarchy management (creating subordinate users).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAppEmail } from "@/lib/email/send.server";

// Default commission rates across the chain (must total 15% to leave 15% headroom for the discount = 30% cap)
const COMMISSION_AFFILIATE = 0.1;
const COMMISSION_MANAGER = 0.04;
const COMMISSION_SAM = 0.01;

const CreateSubordinateSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(100),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["sam", "manager", "affiliate"]),
  // Only super_admin can override the default commission rate.
  commissionRate: z.number().min(0).max(0.3).optional(),
  // New mockup fields:
  phoneNumber: z.string().max(50).optional(),
  socialHandles: z.array(z.string()).optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  paymentMethod: z.string().optional(),
  parentUserId: z.string().uuid().optional(),
});

export const createSubordinate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => CreateSubordinateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: callerRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const callerRole = callerRoleRow?.role;

    const allowedByCaller: Record<string, string[]> = {
      super_admin: ["sam", "manager", "affiliate"],
      sam: ["manager", "affiliate"],
      manager: ["affiliate"],
    };
    const allowed = allowedByCaller[callerRole ?? ""] ?? [];
    if (!allowed.includes(data.role)) {
      throw new Error(`You don't have permission to create a ${data.role}`);
    }

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("default_affiliate_rate, default_manager_rate, default_sam_rate")
      .eq("id", 1)
      .maybeSingle();
    const defaultRate =
      data.role === "affiliate"
        ? Number(settings?.default_affiliate_rate ?? COMMISSION_AFFILIATE)
        : data.role === "manager"
          ? Number(settings?.default_manager_rate ?? COMMISSION_MANAGER)
          : data.role === "sam"
            ? Number(settings?.default_sam_rate ?? COMMISSION_SAM)
            : 0;
    const commissionRate =
      callerRole === "super_admin" && data.commissionRate !== undefined
        ? data.commissionRate
        : defaultRate;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password || "TempPass123!",
      email_confirm: true,
      user_metadata: { full_name: data.fullName, role: data.role },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    const newId = created.user.id;

    // Convert new mockup fields into JSON for profile metadata
    const metadataParts = {
      phone_number: data.phoneNumber,
      social_handles: data.socialHandles,
      contract_start: data.contractStart,
      contract_end: data.contractEnd,
      payment_method: data.paymentMethod
    };

    await supabaseAdmin
      .from("profiles")
      .update({
        parent_user_id: data.parentUserId || userId,
        commission_rate: commissionRate,
        metadata: metadataParts,
      })
      .eq("id", newId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });

    // Note: affiliates create their own promo codes from the affiliate dashboard.

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "create_subordinate",
      entity_type: "profile",
      entity_id: newId,
      new_values: { email: data.email, role: data.role },
    });

    const appUrl =
      process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "https://app.hackher.ai";
    sendAppEmail({
      to: data.email,
      template: "welcome",
      userId: newId,
      category: "subscription",
      data: { name: data.fullName, appUrl },
    }).catch((e) => console.error("[welcome email]", e));

    return { id: newId, email: data.email, role: data.role, promoCode: null };
  });

const UpdateCommissionSchema = z.object({
  userId: z.string().uuid(),
  commissionRate: z.number().min(0).max(0.15),
});

// Update a subordinate's commission rate.
// Rules:
// - super_admin: can update anyone except themselves
// - sam / manager: can update direct or indirect descendants only, never themselves
// - affiliate / customer: forbidden
export const updateSubordinateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => UpdateCommissionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.userId === userId) {
      throw new Error("You cannot edit your own commission rate");
    }

    const { data: callerRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const callerRole = callerRoleRow?.role as string | undefined;
    if (!callerRole || callerRole === "affiliate" || callerRole === "customer") {
      throw new Error("You don't have permission to update commission rates");
    }

    if (callerRole !== "super_admin") {
      const { data: isAnc } = await supabaseAdmin.rpc("is_ancestor_of", {
        _ancestor: userId,
        _descendant: data.userId,
      });
      if (!isAnc) throw new Error("That user is not in your hierarchy");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        commission_rate: data.commissionRate,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "update_commission_rate",
      entity_type: "profile",
      entity_id: data.userId,
      new_values: { commission_rate: data.commissionRate },
    });

    return { ok: true };
  });

const UpdateSubordinateSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  fullName: z.string().min(1).max(100).optional(),
  commissionRate: z.number().min(0).max(0.3).optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
  parentUserId: z.string().uuid().optional(),
  phoneNumber: z.string().max(50).optional(),
  socialHandles: z.array(z.string()).optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  paymentMethod: z.string().optional(),
  password: z.string().min(8).max(128).optional(),
});

export const updateSubordinate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => UpdateSubordinateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: callerRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const callerRole = callerRoleRow?.role;
    if (!callerRole || callerRole === "affiliate" || callerRole === "customer") {
      throw new Error("You don't have permission to update users");
    }

    if (callerRole !== "super_admin") {
      const { data: isAnc } = await supabaseAdmin.rpc("is_ancestor_of", {
        _ancestor: userId,
        _descendant: data.userId,
      });
      if (!isAnc) throw new Error("That user is not in your hierarchy");
    }

    // Update basic Auth properties if necessary
    if (data.email || data.fullName || data.password) {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ...(data.email && { email: data.email }),
        ...(data.password && { password: data.password }),
        user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
      });
    }

    // fetch current metadata
    const { data: currentProfile } = await supabaseAdmin.from("profiles").select("metadata").eq("id", data.userId).single();
    const currentMeta = ((currentProfile as any)?.metadata as Record<string, any>) || {};

    const metadataParts = {
      ...currentMeta,
    };
    if (data.phoneNumber !== undefined) metadataParts.phone_number = data.phoneNumber;
    if (data.socialHandles !== undefined) metadataParts.social_handles = data.socialHandles;
    if (data.contractStart !== undefined) metadataParts.contract_start = data.contractStart;
    if (data.contractEnd !== undefined) metadataParts.contract_end = data.contractEnd;
    if (data.paymentMethod !== undefined) metadataParts.payment_method = data.paymentMethod;

    const updates: any = {
      metadata: metadataParts
    };
    if (data.status !== undefined) updates.status = data.status;
    if (data.commissionRate !== undefined) updates.commission_rate = data.commissionRate;
    if (data.parentUserId !== undefined) updates.parent_user_id = data.parentUserId;

    if (data.fullName !== undefined) updates.full_name = data.fullName;
    if (data.email !== undefined) updates.email = data.email;

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", data.userId);

    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "update_subordinate",
      entity_type: "profile",
      entity_id: data.userId,
      new_values: updates,
    });

    return { ok: true };
  });

const DeleteSubordinateSchema = z.object({
  userId: z.string().uuid()
});

export const deleteSubordinate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => DeleteSubordinateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: callerRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const callerRole = callerRoleRow?.role;
    // For delete, usually only super admin or sam is allowed. Make it hierarchical too.
    if (!callerRole || callerRole === "affiliate" || callerRole === "customer") {
      throw new Error("You don't have permission to delete users");
    }

    if (callerRole !== "super_admin") {
      const { data: isAnc } = await supabaseAdmin.rpc("is_ancestor_of", {
        _ancestor: userId,
        _descendant: data.userId,
      });
      if (!isAnc) throw new Error("That user is not in your hierarchy");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
