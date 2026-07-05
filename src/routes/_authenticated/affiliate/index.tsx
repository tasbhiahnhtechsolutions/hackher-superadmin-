import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/affiliate/")({
  component: AffiliateDashboard,
});

function AffiliateDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["affiliate-dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;

      // 1. KPI View
      const { data: aff } = await supabase
        .from("affiliate_analytics_view" as any)
        .select("*")
        .eq("id", user.id)
        .single();

      // 2. Promo Codes
      const { data: promos } = await supabase
        .from("promo_codes")
        .select("id,code,discount_percent,usage_count,campaign_label,status,ends_at")
        .eq("affiliate_id", user.id)
        .order("created_at", { ascending: false });

      const promoIds = promos?.map(p => p.id) || [];

      // 3. Subscriptions attached to promos
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id,created_at,plan_id,status,promo_code_id")
        .in("promo_code_id", promoIds);

      // 4. Plans for breakdown
      const { data: plans } = await supabase
        .from("plans")
        .select("id,name,price_cents");

      // 5. Commissions for table
      const { data: comms } = await supabase
        .from("commissions")
        .select("amount_cents,subscription_id,status")
        .eq("beneficiary_id", user.id);

      return {
        aff: (aff as any) || {},
        promos: promos || [],
        subs: subs || [],
        plans: plans || [],
        comms: comms || [],
      };
    },
  });

  const subsList = data?.subs || [];
  const promosList = data?.promos || [];
  const plansList = data?.plans || [];
  const commsList = data?.comms || [];

  // +X this week logic
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const newSubsThisWeek = subsList.filter(s => new Date(s.created_at) > oneWeekAgo && s.status === "active").length;

  // Subscriber breakdown by plan
  const activeSubs = subsList.filter(s => s.status === "active");
  const subBreakdown = plansList.map(plan => {
    const count = activeSubs.filter(s => s.plan_id === plan.id).length;
    return { name: plan.name, price: plan.price_cents, count };
  }).filter(p => p.count > 0).sort((a, b) => b.count - a.count);

  // Next payout date (1st of next month)
  const nextPayoutDate = new Date();
  nextPayoutDate.setMonth(nextPayoutDate.getMonth() + 1);
  nextPayoutDate.setDate(1);

  return (
    <div className="space-y-6">
      <RoleDashboard
        title="Affiliate"
        subtitle="Track your subscriber acquisitions, active campaigns, and commission earnings."
        kpis={[
          {
            label: "Total Subscribers",
            value: String(data?.aff?.active_subscribers ?? 0),
            sub: newSubsThisWeek > 0 ? `+${newSubsThisWeek} this week` : "Active converted subscribers"
          },
          {
            label: "My Commission",
            value: `$${((data?.aff?.total_earned_cents ?? 0) / 100).toFixed(2)}`,
            sub: "All-time cumulative",
            tone: "success",
          },
          {
            label: "Active Promo Codes",
            value: String(data?.aff?.active_promo_codes ?? 0),
            sub: "Currently active codes"
          },
          {
            label: "Pending Payout",
            value: `$${((data?.aff?.pending_commission_cents ?? 0) / 100).toFixed(2)}`,
            sub: `Next payout: ${nextPayoutDate.toLocaleDateString()}`,
            tone: "warning",
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Subscriber Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {subBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">No active subscribers yet.</div>
            ) : (
              <div className="space-y-4">
                {subBreakdown.map(b => (
                  <div key={b.name} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{b.name} <span className="text-muted-foreground font-normal ml-1">${(b.price / 100).toFixed(0)}</span></p>
                    </div>
                    <div className="font-semibold">{b.count}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle>Promo Code Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {promosList.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No promo codes assigned yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Promo Code</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Subscribers</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promosList.map((promo) => {
                      const promoSubs = activeSubs.filter(s => s.promo_code_id === promo.id);
                      const subIds = promoSubs.map(s => s.id);
                      const promoCommCents = commsList.filter(c => subIds.includes(c.subscription_id)).reduce((a, b) => a + b.amount_cents, 0);

                      return (
                        <TableRow key={promo.id}>
                          <TableCell className="font-mono font-bold">{promo.code}</TableCell>
                          <TableCell>
                            {promo.campaign_label ? (
                              <Badge variant="secondary">{promo.campaign_label}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{promoSubs.length}</TableCell>
                          <TableCell>${(promoCommCents / 100).toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {promo.ends_at ? new Date(promo.ends_at).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={promo.status === "active" ? "default" : "secondary"}>
                              {promo.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
