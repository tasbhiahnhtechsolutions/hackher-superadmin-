import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getCohortRetention, getLtv, getChurn, getRevenueTimeseries } from "@/lib/analytics.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { CampaignAnalytics } from "@/components/campaign-analytics";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const fetchCohort = useServerFn(getCohortRetention);
  const fetchLtv = useServerFn(getLtv);
  const fetchChurn = useServerFn(getChurn);
  const fetchRev = useServerFn(getRevenueTimeseries);

  const [cohort, setCohort] = useState<Array<{ cohort: string; period_offset: number; customers: number; retained: number }>>([]);
  const [ltv, setLtv] = useState<{ avg_ltv_cents: number; total_customers: number; total_revenue_cents: number } | null>(null);
  const [churn, setChurn] = useState<{ churn_rate: number; churned: number; active_start: number } | null>(null);
  const [rev, setRev] = useState<Array<{ bucket: string; gross_cents: number; refunds_cents: number; net_cents: number }>>([]);

  useEffect(() => {
    Promise.all([fetchCohort(), fetchLtv(), fetchChurn(), fetchRev()])
      .then(([c, l, ch, r]) => {
        setCohort(c); setLtv(l); setChurn(ch); setRev(r);
      })
      .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line
  }, []);

  // Pivot cohort to retention curve: aggregate by period_offset
  const retentionCurve = useMemo(() => {
    const byOffset = new Map<number, { customers: number; retained: number }>();
    for (const r of cohort) {
      const cur = byOffset.get(r.period_offset) ?? { customers: 0, retained: 0 };
      cur.customers += Number(r.customers);
      cur.retained += Number(r.retained);
      byOffset.set(r.period_offset, cur);
    }
    return Array.from(byOffset.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([offset, v]) => ({
        month: `M${offset}`,
        retention: v.customers ? Math.round((v.retained / v.customers) * 100) : 0,
      }));
  }, [cohort]);

  const revChart = rev.map((r) => ({
    date: new Date(r.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    gross: Number(r.gross_cents) / 100,
    refunds: Math.abs(Number(r.refunds_cents)) / 100,
    net: Number(r.net_cents) / 100,
  }));

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Avg LTV</div>
          <div className="mt-2 text-2xl font-semibold">${ltv ? (Number(ltv.avg_ltv_cents) / 100).toFixed(2) : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">{ltv?.total_customers ?? 0} customers</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total revenue</div>
          <div className="mt-2 text-2xl font-semibold">${ltv ? (Number(ltv.total_revenue_cents) / 100).toFixed(2) : "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">30-day churn</div>
          <div className="mt-2 text-2xl font-semibold">{churn ? `${(Number(churn.churn_rate) * 100).toFixed(1)}%` : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">{churn?.churned ?? 0} of {churn?.active_start ?? 0}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Revenue · 90 days</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revChart}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cohort retention curve</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={retentionCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="%" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Bar dataKey="retention" fill="hsl(var(--primary))" name="Retention %" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
