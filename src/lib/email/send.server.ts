// Server-only Resend dispatcher. Used by server routes/functions.
// Logs every send to email_send_log with status pending → sent/failed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES, type TemplateName } from "./templates";

const FROM = process.env.EMAIL_FROM || "HackHer.ai <onboarding@resend.dev>";

export interface SendArgs<T extends TemplateName = TemplateName> {
  to: string;
  template: T;
  data: Parameters<(typeof TEMPLATES)[T]>[0];
  category?: string; // for preference filtering
  userId?: string; // recipient user id (for prefs lookup)
  idempotencyKey?: string;
}

const PREF_FIELD: Record<string, keyof typeof PREF_DEFAULTS> = {
  payouts: "email_payouts",
  commissions: "email_commissions",
  subscription: "email_subscription",
  security: "email_security",
  admin_alerts: "email_admin_alerts",
  marketing: "email_marketing",
};
const PREF_DEFAULTS = {
  email_payouts: true,
  email_commissions: true,
  email_subscription: true,
  email_security: true,
  email_admin_alerts: true,
  email_marketing: false,
};

async function isAllowed(
  userId: string | undefined,
  category: string | undefined,
): Promise<boolean> {
  if (!userId || !category) return true;
  const field = PREF_FIELD[category];
  if (!field) return true;
  const { data } = await supabaseAdmin
    .from("notification_preferences")
    .select(field)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return PREF_DEFAULTS[field];
  return Boolean((data as Record<string, unknown>)[field]);
}

async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("suppressed_emails")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data;
}

export async function sendAppEmail<T extends TemplateName>(
  args: SendArgs<T>,
): Promise<{ ok: boolean; id?: string; skipped?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY missing" };

  const recipient = args.to.toLowerCase().trim();
  if (await isSuppressed(recipient)) {
    await supabaseAdmin.from("email_send_log").insert({
      template_name: args.template,
      recipient_email: recipient,
      status: "suppressed",
      message_id: args.idempotencyKey,
      subject: null,
    });
    return { ok: false, skipped: "suppressed" };
  }
  if (!(await isAllowed(args.userId, args.category))) {
    return { ok: false, skipped: "user_pref" };
  }

  const tpl = TEMPLATES[args.template] as (d: unknown) => {
    subject: string;
    html: string;
    text: string;
  };
  const { subject, html, text } = tpl(args.data);

  // Insert pending row
  const { data: pending } = await supabaseAdmin
    .from("email_send_log")
    .insert({
      template_name: args.template,
      recipient_email: recipient,
      status: "pending",
      message_id: args.idempotencyKey,
      subject,
      metadata: { category: args.category ?? null },
    })
    .select("id")
    .maybeSingle();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: FROM, to: [recipient], subject, html, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = body?.message || body?.error || `HTTP ${res.status}`;
      const backoffMin = 5; // first retry in 5 min
      await supabaseAdmin.from("email_send_log").insert({
        template_name: args.template,
        recipient_email: recipient,
        status: "failed",
        error_message: String(errMsg),
        message_id: args.idempotencyKey,
        subject,
        retry_count: 0,
        next_retry_at: new Date(Date.now() + backoffMin * 60 * 1000).toISOString(),
        metadata: { category: args.category ?? null, payload: args.data },
      });
      return { ok: false, error: String(errMsg) };
    }
    await supabaseAdmin.from("email_send_log").insert({
      template_name: args.template,
      recipient_email: recipient,
      status: "sent",
      message_id: args.idempotencyKey ?? body?.id,
      subject,
      metadata: { category: args.category ?? null, resend_id: body?.id },
    });
    return { ok: true, id: body?.id };
  } catch (e) {
    const msg = (e as Error).message;
    await supabaseAdmin.from("email_send_log").insert({
      template_name: args.template,
      recipient_email: recipient,
      status: "failed",
      error_message: msg,
      message_id: args.idempotencyKey,
      subject,
      retry_count: 0,
      next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      metadata: { category: args.category ?? null, payload: args.data },
    });
    return { ok: false, error: msg };
  }
  void pending;
}

// Retry worker — called by cron. Exponential backoff: 5, 15, 45, 120, 360 min.
export async function retryFailedEmails(): Promise<{ retried: number }> {
  const { data: rows } = await supabaseAdmin
    .from("email_send_log")
    .select("id,template_name,recipient_email,subject,retry_count,metadata,message_id")
    .eq("status", "failed")
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", new Date().toISOString())
    .lt("retry_count", 5)
    .order("next_retry_at", { ascending: true })
    .limit(25);

  if (!rows?.length) return { retried: 0 };

  let count = 0;
  for (const row of rows) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const payload = (meta.payload as Record<string, unknown>) ?? {};
    const category = (meta.category as string | undefined) ?? undefined;
    // Mark this row as resolved by inserting a new attempt; old row gets next_retry_at cleared.
    await supabaseAdmin.from("email_send_log").update({ next_retry_at: null }).eq("id", row.id);
    const result = await sendAppEmail({
      to: row.recipient_email,
      template: row.template_name as TemplateName,
      data: payload as never,
      category,
      idempotencyKey: row.message_id ?? undefined,
    });
    if (!result.ok && !result.skipped) {
      const nextCount = (row.retry_count ?? 0) + 1;
      const minutes = [5, 15, 45, 120, 360][Math.min(nextCount, 4)];
      await supabaseAdmin.from("email_send_log").insert({
        template_name: row.template_name,
        recipient_email: row.recipient_email,
        status: "failed",
        error_message: result.error,
        message_id: row.message_id,
        subject: row.subject,
        retry_count: nextCount,
        next_retry_at: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
        metadata: meta as never,
      });
    }
    count++;
  }
  return { retried: count };
}
