import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async () => {
      const [subs, plans, payouts, comm] = await Promise.all([
        supabase.from("subscriptions").select("amount_paid_cents,status", { count: "exact" }),
        supabase.from("plans").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("payouts").select("amount_cents").eq("status", "pending"),
        supabase.from("commissions").select("amount_cents,status"),
      ]);
      const activeSubs = subs.data?.filter((s) => s.status === "active").length ?? 0;
      const mrr =
        subs.data
          ?.filter((s) => s.status === "active")
          .reduce((a, s) => a + s.amount_paid_cents, 0) ?? 0;
      const pendingPayouts = payouts.data?.reduce((a, p) => a + p.amount_cents, 0) ?? 0;
      const cleared =
        comm.data
          ?.filter((c) => c.status === "cleared" || c.status === "paid")
          .reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      return { mrr, activeSubs, pendingPayouts, cleared, plansCount: plans.count ?? 0 };
    },
  });

  const fmt = (c: number) =>
    `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <RoleDashboard
      title="Super Admin"
      subtitle="Platform-wide revenue, affiliates, and subscriptions"
      kpis={[
        { label: "MRR", value: fmt(data?.mrr ?? 0), tone: "primary" },
        { label: "Active Subscriptions", value: String(data?.activeSubs ?? 0) },
        { label: "Pending Payouts", value: fmt(data?.pendingPayouts ?? 0), tone: "warning" },
        { label: "Cleared Commissions", value: fmt(data?.cleared ?? 0), tone: "success" },
      ]}
    />
  );
}
