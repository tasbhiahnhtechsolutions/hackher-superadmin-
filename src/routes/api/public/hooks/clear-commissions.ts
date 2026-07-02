// POST /api/public/hooks/clear-commissions
// Called daily by pg_cron. Clears due commissions, then notifies+emails beneficiaries.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAppEmail } from "@/lib/email/send.server";

const APP_URL = process.env.APP_URL || "https://hackher.ai";

export const Route = createFileRoute("/api/public/hooks/clear-commissions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer /, "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apiKey || !expected || apiKey !== expected)
          return new Response("unauthorized", { status: 401 });

        // Capture which commissions are about to clear so we can notify
        const { data: due } = await supabaseAdmin
          .from("commissions")
          .select("id,beneficiary_id,amount_cents")
          .eq("status", "pending")
          .not("hold_until", "is", null)
          .lte("hold_until", new Date().toISOString())
          .limit(500);

        const { data, error } = await supabaseAdmin.rpc("clear_due_commissions" as never);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        // Aggregate by beneficiary and notify/email
        if (due?.length) {
          const totals = new Map<string, number>();
          for (const c of due)
            totals.set(c.beneficiary_id, (totals.get(c.beneficiary_id) ?? 0) + c.amount_cents);
          for (const [beneficiaryId, amount] of totals) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("email")
              .eq("id", beneficiaryId)
              .maybeSingle();
            await supabaseAdmin.rpc(
              "notify_user_with_pref" as never,
              {
                _user_id: beneficiaryId,
                _category: "commissions",
                _type: "commission_cleared",
                _title: "Commission cleared",
                _body: `${(amount / 100).toFixed(2)} USD now eligible for payout`,
                _link: "/affiliate/earnings",
              } as never,
            );
            if (prof?.email) {
              await sendAppEmail({
                to: prof.email,
                template: "commission_cleared",
                data: {
                  amountCents: amount,
                  currency: "usd",
                  dashboardUrl: `${APP_URL}/affiliate/earnings`,
                },
                category: "commissions",
                userId: beneficiaryId,
                idempotencyKey: `cleared-${beneficiaryId}-${new Date().toISOString().slice(0, 10)}`,
              });
            }
          }
        }

        return new Response(JSON.stringify({ cleared: data ?? 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
