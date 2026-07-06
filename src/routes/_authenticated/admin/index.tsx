import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RoleDashboard } from "@/components/role-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async () => {
      const [subs, plans, payouts, comm, affiliates] = await Promise.all([
        supabase.from("subscriptions").select("amount_paid_cents,status,customer_id", { count: "exact" }),
        supabase.from("plans").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("payouts").select("amount_cents").eq("status", "pending"),
        supabase.from("commissions").select("amount_cents,status"),
        supabase.from("profiles").select("id,full_name,email,created_at").order("created_at", { ascending: false }).limit(5)
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
      const totalAffiliates = affiliates.data?.length ?? 0;
      const trialUsers = subs.data?.filter(s => s.status === 'trialing').length ?? 0;
      const subsViaAffiliates = subs.data?.filter(s => s.status === 'active' && s.customer_id).length ?? 0; // Simulate for now

      return {
        mrr,
        activeSubs,
        pendingPayouts,
        cleared,
        totalAffiliates,
        trialUsers,
        subsViaAffiliates,
        recentAffiliates: affiliates.data ?? []
      };
    },
  });

  const fmt = (c: number) =>
    `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <>
      <RoleDashboard
        title="Super Admin Dashboard"
        subtitle="Platform-wide revenue, affiliates, and subscriptions"
        kpis={[
          { label: "Total Revenue", value: fmt(data?.mrr ?? 0), tone: "primary" },
          { label: "Active Affiliates", value: String(data?.totalAffiliates ?? 0) },
          { label: "Subscribers via Affiliates", value: String(data?.subsViaAffiliates ?? 0) },
          { label: "Total Commissions Owed", value: fmt(data?.pendingPayouts ?? 0), tone: "warning" },
          { label: "Trial Users (Pending)", value: String(data?.trialUsers ?? 0) },
          { label: "Net Revenue", value: fmt((data?.mrr ?? 0) - (data?.pendingPayouts ?? 0)), tone: "success" },
          { label: "Total Subscribers", value: String(data?.activeSubs ?? 0) },
        ]}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Affiliates</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Affiliate Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentAffiliates ?? []).map((aff) => (
                  <TableRow key={aff.id}>
                    <TableCell className="font-medium">{aff.full_name || "Unknown"}</TableCell>
                    <TableCell>{aff.email}</TableCell>
                    <TableCell>{new Date(aff.created_at).toLocaleDateString()}</TableCell>
                    <TableCell><Badge variant="default">Active</Badge></TableCell>
                  </TableRow>
                ))}
                {(data?.recentAffiliates?.length === 0) && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No affiliates found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
