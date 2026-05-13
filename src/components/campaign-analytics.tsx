import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";

type PerfRow = {
  campaign: string; promo_codes: number; subscriptions: number;
  gross_revenue_cents: number; commissions_cents: number; avg_discount: number;
  total_uses: number; conversion_rate: number; top_promo_code: string | null;
};
type SeriesRow = { bucket: string; campaign: string; subscriptions: number; gross_revenue_cents: number };
type TopCode = { code: string; campaign: string; affiliate_name: string | null; uses: number; subscriptions: number; gross_revenue_cents: number };
type PlanRow = { campaign: string; plan_name: string; subscriptions: number; gross_revenue_cents: number };

const RANGES = [
  { label: "30 days", days: 30 }, { label: "90 days", days: 90 }, { label: "12 months", days: 365 },
];
const PALETTE = ["hsl(var(--primary))","hsl(var(--accent))","hsl(var(--success))","hsl(var(--warning))","hsl(var(--destructive))"];
const fmt$ = (c: number) => `$${(Number(c) / 100).toFixed(2)}`;

export function CampaignAnalytics({ title = "Campaign performance", subtitle }: { title?: string; subtitle?: string }) {
  const { user } = useAuth();
  const [days, setDays] = useState(90);
  const range = useMemo(() => {
    const end = new Date(); const start = new Date(end.getTime() - days * 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [days]);

  const perf = useQuery({
    queryKey: ["camp-perf", user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_campaign_performance" as never, {
        _scope_user: user!.id, _start: range.start, _end: range.end,
      } as never);
      if (error) throw error;
      return (data ?? []) as PerfRow[];
    },
  });

  const series = useQuery({
    queryKey: ["camp-series", user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_campaign_timeseries" as never, {
        _scope_user: user!.id, _start: range.start, _end: range.end, _bucket: "day",
      } as never);
      if (error) throw error;
      return (data ?? []) as SeriesRow[];
    },
  });

  const top = useQuery({
    queryKey: ["camp-top", user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_top_promo_codes" as never, {
        _scope_user: user!.id, _start: range.start, _end: range.end, _limit: 10,
      } as never);
      if (error) throw error;
      return (data ?? []) as TopCode[];
    },
  });

  const planMix = useQuery({
    queryKey: ["camp-plan", user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_plan_conversion_by_campaign" as never, {
        _scope_user: user!.id, _start: range.start, _end: range.end,
      } as never);
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });

  // Pivot timeseries: { date, [campaign]: revenue }
  const campaigns = useMemo(() => Array.from(new Set((series.data ?? []).map((r) => r.campaign))).slice(0, 5), [series.data]);
  const trendChart = useMemo(() => {
    const byBucket = new Map<string, Record<string, number | string>>();
    for (const r of series.data ?? []) {
      const k = new Date(r.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const cur = byBucket.get(k) ?? { date: k };
      cur[r.campaign] = (Number(cur[r.campaign] ?? 0) as number) + Number(r.gross_revenue_cents) / 100;
      byBucket.set(k, cur);
    }
    return Array.from(byBucket.values());
  }, [series.data]);

  const planChart = useMemo(() => {
    const byPlan = new Map<string, Record<string, number | string>>();
    for (const r of planMix.data ?? []) {
      const cur = byPlan.get(r.plan_name) ?? { plan: r.plan_name };
      cur[r.campaign] = (Number(cur[r.campaign] ?? 0) as number) + Number(r.subscriptions);
      byPlan.set(r.plan_name, cur);
    }
    return Array.from(byPlan.values());
  }, [planMix.data]);

  const totals = useMemo(() => {
    const rows = perf.data ?? [];
    return {
      campaigns: rows.length,
      revenue: rows.reduce((a, r) => a + Number(r.gross_revenue_cents), 0),
      subs: rows.reduce((a, r) => a + Number(r.subscriptions), 0),
      commissions: rows.reduce((a, r) => a + Number(r.commissions_cents), 0),
    };
  }, [perf.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Campaigns" value={String(totals.campaigns)} />
        <KPI label="Subscriptions" value={String(totals.subs)} />
        <KPI label="Revenue" value={fmt$(totals.revenue)} />
        <KPI label="Commissions" value={fmt$(totals.commissions)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Revenue by campaign · over time</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              {campaigns.map((c, i) => (
                <Area key={c} type="monotone" dataKey={c} stackId="1"
                  stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.35} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Plan mix by campaign</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="plan" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                {campaigns.map((c, i) => (
                  <Bar key={c} dataKey={c} stackId="p" fill={PALETTE[i % PALETTE.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Top promo codes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Campaign</TableHead>
                <TableHead className="text-right">Subs</TableHead><TableHead className="text-right">Revenue</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(top.data ?? []).map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell><Badge variant="secondary">{r.campaign}</Badge></TableCell>
                    <TableCell className="text-right">{r.subscriptions}</TableCell>
                    <TableCell className="text-right font-medium">{fmt$(r.gross_revenue_cents)}</TableCell>
                  </TableRow>
                ))}
                {!top.isLoading && (top.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground text-sm">No data in selected range.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Campaign leaderboard</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Campaign</TableHead><TableHead className="text-right">Codes</TableHead>
              <TableHead className="text-right">Uses</TableHead><TableHead className="text-right">Subs</TableHead>
              <TableHead className="text-right">Conv. rate</TableHead><TableHead className="text-right">Avg disc.</TableHead>
              <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Commissions</TableHead>
              <TableHead>Top code</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(perf.data ?? []).map((r) => (
                <TableRow key={r.campaign}>
                  <TableCell className="font-medium">{r.campaign}</TableCell>
                  <TableCell className="text-right">{r.promo_codes}</TableCell>
                  <TableCell className="text-right">{r.total_uses}</TableCell>
                  <TableCell className="text-right">{r.subscriptions}</TableCell>
                  <TableCell className="text-right">{(Number(r.conversion_rate) * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{Number(r.avg_discount).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-medium">{fmt$(r.gross_revenue_cents)}</TableCell>
                  <TableCell className="text-right">{fmt$(r.commissions_cents)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.top_promo_code ?? "—"}</TableCell>
                </TableRow>
              ))}
              {!perf.isLoading && (perf.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground text-sm">No campaigns in range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
    </CardContent></Card>
  );
}
