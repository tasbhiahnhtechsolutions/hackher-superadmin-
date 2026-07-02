import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/manager/")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["manager-kpis", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [aff, comm] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("parent_user_id", user!.id),
        supabase.from("commissions").select("amount_cents,status").eq("beneficiary_id", user!.id),
      ]);
      const pending =
        comm.data?.filter((c) => c.status === "pending").reduce((a, c) => a + c.amount_cents, 0) ??
        0;
      const cleared =
        comm.data
          ?.filter((c) => c.status === "cleared" || c.status === "paid")
          .reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      return { affiliates: aff.count ?? 0, pending, cleared };
    },
  });
  return (
    <RoleDashboard
      title="Manager"
      subtitle="Your affiliates and their performance"
      kpis={[
        { label: "Affiliates", value: String(data?.affiliates ?? 0) },
        { label: "Active Subscribers", value: "0", tone: "primary" },
        {
          label: "Pending Commissions",
          value: `$${((data?.pending ?? 0) / 100).toFixed(2)}`,
          tone: "warning",
        },
        {
          label: "Cleared Earnings",
          value: `$${((data?.cleared ?? 0) / 100).toFixed(2)}`,
          tone: "success",
        },
      ]}
    />
  );
}
