import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/affiliate/")({
  component: AffiliateDashboard,
});

function AffiliateDashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["affiliate-kpis", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [codes, customers, comm] = await Promise.all([
        supabase.from("promo_codes").select("id", { count: "exact", head: true }).eq("affiliate_id", user!.id).eq("status", "active"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("affiliate_id", user!.id),
        supabase.from("commissions").select("amount_cents,status").eq("beneficiary_id", user!.id),
      ]);
      const pending = comm.data?.filter((c) => c.status === "pending").reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      const total = comm.data?.reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      return { codes: codes.count ?? 0, customers: customers.count ?? 0, pending, total };
    },
  });
  return (
    <RoleDashboard
      title="Affiliate"
      subtitle="Your promo codes, conversions, and earnings"
      kpis={[
        { label: "Active Promo Codes", value: String(data?.codes ?? 0) },
        { label: "Subscribers", value: String(data?.customers ?? 0), tone: "primary" },
        { label: "Pending Commissions", value: `$${((data?.pending ?? 0) / 100).toFixed(2)}`, tone: "warning" },
        { label: "Total Earnings", value: `$${((data?.total ?? 0) / 100).toFixed(2)}`, tone: "success" },
      ]}
    />
  );
}
