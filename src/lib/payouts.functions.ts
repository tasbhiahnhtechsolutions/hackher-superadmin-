// Admin-only payout management server fns.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

const GenerateSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const generatePayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => GenerateSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.userId);

    const { data: comms, error } = await supabaseAdmin
      .from("commissions")
      .select("id,beneficiary_id,amount_cents")
      .eq("status", "cleared")
      .is("payout_id", null)
      .gte("cleared_at", `${data.periodStart}T00:00:00Z`)
      .lte("cleared_at", `${data.periodEnd}T23:59:59Z`);
    if (error) throw new Error(error.message);
    if (!comms?.length) return { created: 0, totalCents: 0 };

    const byBeneficiary = new Map<string, { ids: string[]; total: number }>();
    for (const c of comms) {
      const e = byBeneficiary.get(c.beneficiary_id) ?? { ids: [], total: 0 };
      e.ids.push(c.id);
      e.total += c.amount_cents;
      byBeneficiary.set(c.beneficiary_id, e);
    }

    let created = 0, totalCents = 0;
    for (const [beneficiary_id, { ids, total }] of byBeneficiary.entries()) {
      const { data: payout, error: pErr } = await supabaseAdmin.from("payouts").insert({
        beneficiary_id, amount_cents: total,
        period_start: data.periodStart, period_end: data.periodEnd,
        status: "pending",
      }).select("id").single();
      if (pErr || !payout) continue;
      await supabaseAdmin.from("commissions").update({ payout_id: payout.id, status: "paid", paid_at: new Date().toISOString() }).in("id", ids);
      created++;
      totalCents += total;
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "generate_payouts",
      entity_type: "payout",
      new_values: { period_start: data.periodStart, period_end: data.periodEnd, created, total_cents: totalCents } as never,
    });

    return { created, totalCents };
  });

const MarkPaidSchema = z.object({
  payoutId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export const markPayoutPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => MarkPaidSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.userId);
    const { error } = await supabaseAdmin.from("payouts").update({
      status: "paid", paid_at: new Date().toISOString(), notes: data.notes ?? null,
    }).eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId, action: "mark_payout_paid", entity_type: "payout", entity_id: data.payoutId,
    });
    return { ok: true };
  });
