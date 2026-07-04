// Server functions for client → email sending (admin retry, test send).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAppEmail, retryFailedEmails } from "./send.server";
import type { TemplateName } from "./templates";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}

export const adminRetryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ logId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("email_send_log")
      .select("*")
      .eq("id", data.logId)
      .maybeSingle();
    if (!row) throw new Error("not_found");
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const payload = (meta.payload as Record<string, unknown>) ?? {};
    const category = (meta.category as string | undefined) ?? undefined;
    const result = await sendAppEmail({
      to: row.recipient_email,
      template: row.template_name as TemplateName,
      data: payload as never,
      category,
    });
    return result;
  });

export const adminRunRetryWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return retryFailedEmails();
  });

export const adminSendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ to: z.string().email() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return sendAppEmail({
      to: data.to,
      template: "admin_alert",
      data: {
        title: "Test email",
        message: "This is a test from your admin dashboard.",
        severity: "info",
      },
      category: "admin_alerts",
    });
  });
