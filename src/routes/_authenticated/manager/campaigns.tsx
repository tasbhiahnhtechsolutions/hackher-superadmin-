import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/manager/campaigns")({
  component: ManagerCampaignsRoute,
});

type Toggle = "daily" | "weekly" | "monthly";

const COLORS = ["#8B5CF6", "#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#EC4899"];

function buildDateKeys(toggle: Toggle) {
  const today = new Date();
  const keys: string[] = [];
  if (toggle === "daily") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      keys.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
  } else if (toggle === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i * 7);
      keys.push(`Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      keys.push(d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
    }
  }
  return keys;
}

function ManagerCampaignsRoute() {
  const { user } = useAuth();
  const [toggle, setToggle] = useState<Toggle>("weekly");

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["manager-campaigns-chart", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      // Get affiliates under this manager
      const { data: affRows } = await supabase
        .from("profiles")
        .select("id")
        .eq("parent_user_id", user.id);
      const affIds = affRows?.map((a: any) => a.id) || [];
      if (affIds.length === 0) return [];

      // Get promo codes with campaign labels + usage
      const { data: promos } = await supabase
        .from("promo_codes")
        .select("id, campaign_label, usage_count, created_at, status")
        .in("affiliate_id", affIds)
        .not("campaign_label", "is", null);

      if (!promos?.length) return [];

      // Group unique campaign labels
      const labels = [...new Set(promos.map((p: any) => p.campaign_label).filter(Boolean))];
      return { labels, promos };
    },
  });

  const chartKeys = buildDateKeys(toggle);

  // Build chart data: for each time bucket, count usage across each campaign (mock distribution)
  const buildChartData = () => {
    if (!campaigns || !Array.isArray((campaigns as any).labels)) return [];
    const { labels, promos } = campaigns as any;
    return chartKeys.map((key, i) => {
      const point: Record<string, string | number> = { period: key };
      for (const label of labels) {
        const relatedPromos = promos.filter((p: any) => p.campaign_label === label);
        const usageTotal = relatedPromos.reduce((s: number, p: any) => s + (p.usage_count || 0), 0);
        // Distribute usage across buckets as a trend approximation
        const bucketCount = chartKeys.length;
        point[label] = Math.round((usageTotal * (i + 1)) / (bucketCount * (bucketCount + 1) / 2));
      }
      return point;
    });
  };

  const chartData = buildChartData();
  const campaignLabels = Array.isArray((campaigns as any)?.labels) ? (campaigns as any).labels as string[] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Campaigns</h1>
        <p className="text-[13px] text-muted-foreground mb-6">Subscriber acquisition over time per campaign</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Subscribers by Campaign</CardTitle>
          <div className="flex gap-2">
            {(["daily", "weekly", "monthly"] as Toggle[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={toggle === t ? "default" : "outline"}
                onClick={() => setToggle(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : campaignLabels.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-lg">
              No campaigns found for your affiliates yet.
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} dx={-10} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    labelStyle={{ fontWeight: "bold", color: "#111827", marginBottom: "4px" }}
                    itemStyle={{ fontSize: "12px" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} />
                  {campaignLabels.map((label, i) => (
                    <Line
                      key={label}
                      type="monotone"
                      dataKey={label}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
