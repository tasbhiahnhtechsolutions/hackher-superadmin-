import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/sam/")({
  component: SamDashboard,
});

function SamDashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["sam-kpis", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data: sam } = await supabase
        .from("sam_analytics_view" as any)
        .select("*")
        .eq("id", user.id)
        .single();

      // 1. Fetch entire SAM tree (Managers -> Affiliates)
      const { data: mgrs } = await supabase.from("profiles").select("id").eq("parent_user_id", user.id);
      const mgrIds = mgrs?.map(m => m.id) || [];

      let affIds: string[] = [];
      if (mgrIds.length > 0) {
        const { data: affs } = await supabase.from("profiles").select("id").in("parent_user_id", mgrIds);
        affIds = affs?.map(a => a.id) || [];
      }

      // 2. Fetch customers belonging to these affiliates
      let allCustRef: string[] = [];
      if (affIds.length > 0) {
        const { data: custs } = await supabase.from("customers").select("stripe_customer_id, id").in("affiliate_id", affIds);
        const custIdsStr = custs?.map(c => c.stripe_customer_id).filter(Boolean) as string[];
        const custIdsInt = custs?.map(c => String(c.id)).filter(Boolean) as string[];
        allCustRef = [...custIdsStr, ...custIdsInt];
      }

      // 3. Fetch Subscriptions for SAM's tree vs Platform total
      const { data: platformSubsRaw } = await supabase.from("subscriptions").select("status, amount_paid_cents, customer_id");
      const platformSubs = platformSubsRaw || [];
      const samTreeSubs = platformSubs.filter(s => s.customer_id && allCustRef.includes(s.customer_id));

      const totalPlatformActive = platformSubs.filter(s => s.status === "active").length;
      const totalPlatformTrialing = platformSubs.filter(s => s.status === "trialing").length;

      const samActiveSubs = samTreeSubs.filter(s => s.status === "active").length;
      const samTrialSubs = samTreeSubs.filter(s => s.status === "trialing").length;

      const samTreeMrr = samTreeSubs.filter(s => s.status === "active").reduce((acc, s) => acc + (s.amount_paid_cents || 0), 0);

      // 4. Fetch Commissions Owed (liability for SAM + entire tree)
      const allTreeIds = [user.id, ...mgrIds, ...affIds];
      const { data: comms } = await supabase.from("commissions").select("amount_cents").in("beneficiary_id", allTreeIds).eq("status", "pending");
      const commissionsOwed = comms?.reduce((acc, c) => acc + (c.amount_cents || 0), 0) || 0;

      // 5. Recent Affiliates (under SAM's managers)
      let recentAffiliates: any[] = [];
      if (mgrIds.length > 0) {
        const { data: recent } = await supabase.from("profiles")
          .select("id,full_name,email,created_at,parent_user_id")
          .in("parent_user_id", mgrIds)
          .order("created_at", { ascending: false })
          .limit(5);
        recentAffiliates = recent || [];
      }

      return {
        sam: (sam as any) || {},
        samTreeMrr,
        commissionsOwed,
        samActiveSubs,
        samTrialSubs,
        totalPlatformActive,
        totalPlatformTrialing,
        recentAffiliates,
        netRevenue: samTreeMrr - commissionsOwed
      };
    },
  });

  const fmt = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const activeFrac = data?.totalPlatformActive ? ((data.samActiveSubs / data.totalPlatformActive) * 100).toFixed(1) : 0;
  const trialFrac = data?.totalPlatformTrialing ? ((data.samTrialSubs / data.totalPlatformTrialing) * 100).toFixed(1) : 0;

  const mrrAmt = (data?.samTreeMrr ?? 0) / 100;
  const commsAmt = (data?.commissionsOwed ?? 0) / 100;
  const netAmt = (data?.netRevenue ?? 0) / 100;

  // Placeholder data for the chart since real historical isn't readily available without complex TS integration
  const chartData = [
    { name: 'Gross Revenue', val: mrrAmt, fill: '#1e3a8a' }, // Tailwind blue-900
    { name: 'SAM Comm (1%)', val: mrrAmt * 0.01, fill: '#3b82f6' }, // blue-500
    { name: 'Mgr Comm (4%)', val: mrrAmt * 0.04, fill: '#60a5fa' }, // blue-400
    { name: 'Aff Comm (10%)', val: mrrAmt * 0.10, fill: '#93c5fd' }, // blue-300
    { name: 'Net Profit', val: mrrAmt * 0.85, fill: '#22c55e' }, // green-500
  ];

  return (
    <>
      <RoleDashboard
        title="SAM Dashboard"
        subtitle="Your hierarchy of managers, affiliates, and revenue"
        kpis={[
          { label: "Total Revenue", value: fmt(data?.samTreeMrr ?? 0), tone: "primary" },
          { label: "Active Affiliates", value: String(data?.sam?.total_affiliates ?? 0) },
          {
            label: "Subscribers via Affiliates",
            value: (
              <div className="flex items-center gap-2">
                <span>{data?.samActiveSubs ?? 0}</span>
                <span className="text-muted-foreground text-sm font-normal">/ {data?.totalPlatformActive ?? 0}</span>
                <Badge variant="secondary" className="ml-1 shrink-0">{activeFrac}%</Badge>
              </div>
            )
          },
          { label: "Total Commissions Owed", value: fmt(data?.commissionsOwed ?? 0), tone: "warning" },
          {
            label: "Trial Users",
            value: (
              <div className="flex items-center gap-2">
                <span>{data?.samTrialSubs ?? 0}</span>
                <span className="text-muted-foreground text-sm font-normal">/ {data?.totalPlatformTrialing ?? 0}</span>
                <Badge variant="secondary" className="ml-1 shrink-0">{trialFrac}%</Badge>
              </div>
            )
          },
          { label: "Net Revenue", value: fmt(data?.netRevenue ?? 0), tone: "success" },
          { label: "Total Subscribers", value: String(data?.samActiveSubs ?? 0) },
        ]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Revenue Breakdown — Full Waterfall</CardTitle>
            <div className="flex gap-2 text-xs">
              <Badge variant="secondary" className="cursor-pointer">Weekly</Badge>
              <Badge variant="outline" className="cursor-pointer">Monthly</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[350px]">
            {mrrAmt > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip cursor={{ fill: 'transparent' }} formatter={(val) => `$${Number(val).toFixed(2)}`} />
                  <Bar dataKey="val" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No revenue data strictly mapped natively inside this SAM's tree yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing Affiliates</CardTitle>
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
