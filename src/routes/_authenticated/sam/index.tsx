import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/sam/")({
  component: SamDashboard,
});

function SamDashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["sam-kpis", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [m, a, comm] = await Promise.all([
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "manager"),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "affiliate"),
        supabase.from("commissions").select("amount_cents").eq("beneficiary_id", user!.id),
      ]);
      const earnings = comm.data?.reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      return { managers: m.count ?? 0, affiliates: a.count ?? 0, earnings };
    },
  });
  return (
    <RoleDashboard
      title="Super Admin Manager"
      subtitle="Your hierarchy of managers and affiliates"
      kpis={[
        { label: "Managers", value: String(data?.managers ?? 0) },
        { label: "Affiliates", value: String(data?.affiliates ?? 0) },
        { label: "Subscribers", value: "0", tone: "primary" },
        { label: "Your Earnings", value: `$${((data?.earnings ?? 0) / 100).toFixed(2)}`, tone: "success" },
      ]}
    />
  );
}
