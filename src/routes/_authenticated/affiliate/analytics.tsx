import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/affiliate/analytics")({ component: Page });

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
];

function Page() {
  const { user } = useAuth();
  const [toggle, setToggle] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [disabledSeries, setDisabledSeries] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["affiliate-performance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: promos } = await supabase
        .from("promo_codes")
        .select("id,code")
        .eq("affiliate_id", user!.id);

      if (!promos || !promos.length) return { promos: [], subs: [] };

      const promoIds = promos.map(p => p.id);
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id,created_at,promo_code_id")
        .in("promo_code_id", promoIds);

      return {
        promos,
        subs: subs || [],
      };
    },
  });

  const chartData = useMemo(() => {
    if (!data) return { series: [], codes: [] };

    const end = new Date();
    let start = new Date();
    let bucketDivisor = 1;
    let formatOptions: Intl.DateTimeFormatOptions = {};

    if (toggle === "daily") {
      start.setDate(end.getDate() - 30);
      bucketDivisor = 86400000;
      formatOptions = { month: "short", day: "numeric" };
    } else if (toggle === "weekly") {
      start.setDate(end.getDate() - 12 * 7);
      bucketDivisor = 86400000 * 7;
      formatOptions = { month: "short", day: "numeric" };
    } else {
      start.setMonth(end.getMonth() - 6);
      bucketDivisor = 86400000 * 30.4;
      formatOptions = { month: "short", year: "numeric" };
    }

    const filteredSubs = data.subs.filter(s => new Date(s.created_at) >= start && new Date(s.created_at) <= end);
    const promoMap = new Map(data.promos.map(p => [p.id, p.code]));

    const byBucket = new Map<number, Record<string, number | string>>();

    filteredSubs.forEach(s => {
      const ms = new Date(s.created_at).getTime();
      const bucket = Math.floor(ms / bucketDivisor) * bucketDivisor;
      const cur = byBucket.get(bucket) ?? { ms_bucket: bucket, date: new Date(bucket).toLocaleDateString(undefined, formatOptions) };
      const codeName = promoMap.get(s.promo_code_id!) || "Unknown";
      cur[codeName] = ((cur[codeName] as number) || 0) + 1;
      byBucket.set(bucket, cur);
    });

    const series = Array.from(byBucket.values()).sort((a, b) => (a.ms_bucket as number) - (b.ms_bucket as number));
    const codes = data.promos.map(p => p.code);

    return { series, codes };
  }, [data, toggle]);

  const handleLegendClick = (e: any) => {
    setDisabledSeries(prev => ({
      ...prev,
      [e.dataKey]: !prev[e.dataKey]
    }));
  };

  return (
    <>
      <PageHeader title="Performance Graph" subtitle="See how your promo codes are performing over time — click any label in the legend to toggle that code." />
      <PageBody>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[15px] font-semibold">Subscribers by Promo Code ({toggle === 'daily' ? 'Daily' : toggle === 'weekly' ? 'Weekly' : 'Monthly'})</CardTitle>
            <div className="flex gap-1" id="aff-chart-tabs">
              <button
                onClick={() => setToggle("daily")}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md border transition-colors ${toggle === 'daily' ? 'bg-[#E86E3C] text-white border-[#E86E3C]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Daily
              </button>
              <button
                onClick={() => setToggle("weekly")}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md border transition-colors ${toggle === 'weekly' ? 'bg-[#E86E3C] text-white border-[#E86E3C]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Weekly
              </button>
              <button
                onClick={() => setToggle("monthly")}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md border transition-colors ${toggle === 'monthly' ? 'bg-[#E86E3C] text-white border-[#E86E3C]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Monthly
              </button>
            </div>
          </CardHeader>
          <CardContent className="h-96">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
            ) : chartData.series.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">No subscribers in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend onClick={handleLegendClick} wrapperStyle={{ cursor: "pointer" }} />
                  {chartData.codes.map((code, i) => (
                    <Line
                      key={code}
                      type="monotone"
                      dataKey={code}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={2}
                      dot={false}
                      hide={disabledSeries[code]}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
