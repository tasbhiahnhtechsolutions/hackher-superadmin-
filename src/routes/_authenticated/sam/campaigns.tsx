import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sam/campaigns")({
    component: SamCampaignsRoute,
});

const mockChartData = [
    { day: "Aug 1", "TikTok Launch": 0, "IG Moms": 2, "Podcast Q4": 0 },
    { day: "Aug 2", "TikTok Launch": 4, "IG Moms": 3, "Podcast Q4": 0 },
    { day: "Aug 3", "TikTok Launch": 12, "IG Moms": 5, "Podcast Q4": 2 },
    { day: "Aug 4", "TikTok Launch": 18, "IG Moms": 8, "Podcast Q4": 4 },
    { day: "Aug 5", "TikTok Launch": 24, "IG Moms": 11, "Podcast Q4": 8 },
    { day: "Aug 6", "TikTok Launch": 35, "IG Moms": 17, "Podcast Q4": 15 },
    { day: "Aug 7", "TikTok Launch": 48, "IG Moms": 35, "Podcast Q4": 28 },
];

function SamCampaignsRoute() {
    const { user } = useAuth();

    const { data: campaignStats, isLoading } = useQuery({
        queryKey: ["sam-campaigns-grouped", user?.id],
        enabled: !!user,
        queryFn: async () => {
            const { data: mgrs } = await supabase.from("profiles").select("id").eq("parent_user_id", user!.id);
            const mgrIds = mgrs?.map((m: any) => m.id) || [];

            let affIds: string[] = [];
            if (mgrIds.length > 0) {
                const { data: affs } = await supabase.from("profiles").select("id").in("parent_user_id", mgrIds);
                affIds = affs?.map((a: any) => a.id) || [];
            }
            if (affIds.length === 0) return [];

            const { data } = await supabase
                .from("promo_codes")
                .select("campaign_label, usage_count")
                .in("affiliate_id", affIds);

            if (!data) return [];

            const grouped = data.reduce((acc: any, curr: any) => {
                const label = curr.campaign_label || "No Campaign";
                if (!acc[label]) acc[label] = 0;
                acc[label] += curr.usage_count || 0;
                return acc;
            }, {});

            const sorted = Object.entries(grouped)
                .map(([label, count]) => ({ label, count: count as number }))
                .sort((a, b) => b.count - a.count);

            return sorted;
        },
    });

    return (
        <div className="space-y-6 max-w-[1100px] mx-auto p-2">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Campaigns</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Track performance across platforms for your affiliates</p>
            </div>

            {isLoading ? (
                <div className="text-center text-muted-foreground py-10">Loading campaigns...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {campaignStats?.map((c, i) => (
                            <Card key={i}>
                                <CardContent className="p-5">
                                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                                        {c.label}
                                    </div>
                                    <div className="text-2xl font-bold mt-1">{c.count}</div>
                                    <div className="text-xs mt-1 text-emerald-600 font-medium">subscribers</div>
                                </CardContent>
                            </Card>
                        ))}
                        {campaignStats?.length === 0 && (
                            <div className="col-span-4 text-center py-10 text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
                                No campaigns found yet in your network. Check back once managers distribute promotional campaigns.
                            </div>
                        )}
                    </div>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Campaign Performance Over Time</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={mockChartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} dx={-10} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                            labelStyle={{ fontWeight: "bold", color: "#111827", marginBottom: "4px" }}
                                            itemStyle={{ fontSize: "12px", paddingTop: "2px", paddingBottom: "2px" }}
                                        />
                                        <Line type="monotone" dataKey="TikTok Launch" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                        <Line type="monotone" dataKey="IG Moms" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} />
                                        <Line type="monotone" dataKey="Podcast Q4" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
