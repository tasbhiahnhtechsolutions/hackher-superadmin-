// Server functions for hierarchy management (creating subordinate users).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateSubordinateSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(["sam", "manager", "affiliate"]),
  commissionRate: z.number().min(0).max(0.3).optional(),
});

export const createSubordinate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSubordinateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify caller has authority to create this role
    const { data: callerRoleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
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

    // Create auth user (auto-confirm so they can sign in immediately)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, role: data.role },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    const newId = created.user.id;

    // Set parent + commission rate
    await supabaseAdmin.from("profiles").update({
      parent_user_id: userId,
      commission_rate: data.commissionRate ?? null,
    }).eq("id", newId);

    // The trigger inserts default 'affiliate' role from metadata; ensure correct role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "create_subordinate",
      entity_type: "profile",
      entity_id: newId,
      new_values: { email: data.email, role: data.role },
    });

    return { id: newId, email: data.email, role: data.role };
  });
