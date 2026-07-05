import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";
import {
    Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { DollarSign, Clock, ShieldAlert, CalendarClock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/manager/payouts")({
    component: ManagerPayoutsRoute,
});

function fmt(cents: number) {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ManagerPayoutsRoute() {
    const { user } = useAuth();
    const qc = useQueryClient();

    /* ── KPI data ── */
    const { data: kpiData } = useQuery({
        queryKey: ["manager-payouts-kpi", user?.id],
        enabled: !!user,
        queryFn: async () => {
            if (!user) return null;

            // Get all affiliates under this manager
            const { data: affRows } = await supabase
                .from("profiles")
                .select("id")
                .eq("parent_user_id", user.id);
            const affIds = affRows?.map((a: any) => a.id) || [];

            if (affIds.length === 0) return { pending: 0, paidThisMonth: 0, hold: 0, holdSubs: 0, nextPayout: "" };

            // Pending affiliate commissions (beneficiary = each affiliate)
            const { data: pendingRows } = await supabase
                .from("commissions")
                .select("amount_cents")
                .in("beneficiary_id", affIds)
                .eq("status", "pending");
            const pending = (pendingRows ?? []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);

            // Paid this month
            const startOfMonth = new Date();
            startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
            const { data: paidRows } = await supabase
                .from("commissions")
                .select("amount_cents")
                .in("beneficiary_id", affIds)
                .eq("status", "paid")
                .gte("created_at", startOfMonth.toISOString());
            const paidThisMonth = (paidRows ?? []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);

            // 30-day hold
            const since30 = new Date(); since30.setDate(since30.getDate() - 30);
            const { data: holdRows } = await supabase
                .from("commissions")
                .select("amount_cents, subscriber_id")
                .in("beneficiary_id", affIds)
                .eq("status", "pending")
                .gte("created_at", since30.toISOString());
            const hold = (holdRows ?? []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);
            const holdSubs = new Set((holdRows ?? []).map((r: any) => r.subscriber_id).filter(Boolean)).size;

            // Next payout: last day of following month (Net 60 concept → end of next month)
            const now = new Date();
            const nextPayoutDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);
            const nextPayout = nextPayoutDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

            return { pending, paidThisMonth, hold, holdSubs, nextPayout };
        },
    });

    /* ── Payout Queue ── */
    const { data: payoutQueue, isLoading } = useQuery({
        queryKey: ["manager-payout-queue", user?.id],
        enabled: !!user,
        queryFn: async () => {
            if (!user) return [];

            const { data: affRows } = await supabase
                .from("profiles")
                .select("id, full_name, email")
                .eq("parent_user_id", user.id);
            const affIds = affRows?.map((a: any) => a.id) || [];
            if (affIds.length === 0) return [];

            const { data } = await supabase
                .from("commissions")
                .select("id, amount_cents, status, created_at, beneficiary_id")
                .in("beneficiary_id", affIds)
                .in("status", ["pending", "paid"])
                .order("created_at", { ascending: false });

            if (!data) return [];

            // Group by affiliate + month
            const map: Record<string, { affiliateId: string; affiliateName: string; period: string; total: number; statuses: string[]; ids: string[] }> = {};
            for (const row of data) {
                const aff = affRows?.find((a: any) => a.id === row.beneficiary_id);
                const d = new Date(row.created_at);
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                const key = `${row.beneficiary_id}-${monthKey}`;
                if (!map[key]) {
                    map[key] = {
                        affiliateId: row.beneficiary_id,
                        affiliateName: aff?.full_name || aff?.email || "Unknown",
                        period: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
                        total: 0, statuses: [], ids: [],
                    };
                }
                map[key].total += row.amount_cents || 0;
                map[key].statuses.push(row.status);
                map[key].ids.push(row.id);
            }

            return Object.values(map)
                .sort((a, b) => b.period.localeCompare(a.period))
                .map(v => ({
                    ...v,
                    status: v.statuses.every(s => s === "paid") ? "paid" : "pending",
                }));
        },
    });

    const handleMarkPaid = async (row: any) => {
        try {
            await supabase
                .from("commissions")
                .update({ status: "paid" })
                .in("id", row.ids);
            toast.success(`Marked ${row.affiliateName} (${row.period}) as paid`);
            qc.invalidateQueries({ queryKey: ["manager-payout-queue"] });
            qc.invalidateQueries({ queryKey: ["manager-payouts-kpi"] });
        } catch (e: any) {
            toast.error(e.message || "Failed to update");
        }
    };

    const handleMarkUnpaid = async (row: any) => {
        try {
            await supabase
                .from("commissions")
                .update({ status: "pending" })
                .in("id", row.ids);
            toast.success(`Reverted ${row.affiliateName} (${row.period}) to pending`);
            qc.invalidateQueries({ queryKey: ["manager-payout-queue"] });
            qc.invalidateQueries({ queryKey: ["manager-payouts-kpi"] });
        } catch (e: any) {
            toast.error(e.message || "Failed to update");
        }
    };

    const [queueSearch, setQueueSearch] = useState("");
    const [queueStatus, setQueueStatus] = useState("all");
    const resetFilters = () => { setQueueSearch(""); setQueueStatus("all"); };

    const filteredQueue = useMemo(() => {
        if (!payoutQueue) return [];
        return payoutQueue.filter((r: any) => {
            const q = queueSearch.toLowerCase();
            const matchQ = !q || (r.affiliateName || "").toLowerCase().includes(q);
            const matchS = queueStatus === "all" || r.status === queueStatus;
            return matchQ && matchS;
        });
    }, [payoutQueue, queueSearch, queueStatus]);

    const kpis = [
        {
            label: "Pending Payouts",
            value: fmt(kpiData?.pending ?? 0),
            sub: "Affiliate commissions awaiting payment",
            icon: DollarSign,
            color: "text-amber-500",
            bg: "bg-amber-50 dark:bg-amber-900/20",
        },
        {
            label: "Paid This Month",
            value: fmt(kpiData?.paidThisMonth ?? 0),
            sub: "Affiliate payouts marked paid this month",
            icon: Clock,
            color: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-900/20",
        },
        {
            label: "30-Day Hold",
            value: fmt(kpiData?.hold ?? 0),
            sub: `${kpiData?.holdSubs ?? 0} subscribers in chargeback window`,
            icon: ShieldAlert,
            color: "text-rose-500",
            bg: "bg-rose-50 dark:bg-rose-900/20",
        },
        {
            label: "Next Payout Date",
            value: kpiData?.nextPayout ?? "—",
            sub: "Net 60 payout cycle",
            icon: CalendarClock,
            color: "text-blue-500",
            bg: "bg-blue-50 dark:bg-blue-900/20",
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Payouts</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Manage payout status for your affiliates</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                        <Card key={k.label}>
                            <CardContent className="pt-5 pb-5">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                                        <p className="text-xl font-bold leading-tight">{k.value}</p>
                                        <p className="text-[11px] text-muted-foreground">{k.sub}</p>
                                    </div>
                                    <div className={`p-2 rounded-lg ${k.bg}`}>
                                        <Icon className={`h-5 w-5 ${k.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Affiliate Payout Queue */}
            <Card>
                <CardHeader>
                    <CardTitle>Affiliate Payout Queue</CardTitle>
                    <p className="text-[12px] text-muted-foreground mt-1">
                        Affiliate-tier (10%) commissions only. Your 4% is managed by your SAM in My Earnings.
                    </p>
                </CardHeader>
                <div className="flex flex-wrap gap-2 px-6 py-3 border-t border-b bg-muted/30 items-center">
                    <div className="relative flex-1 min-w-[180px] max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input className="pl-8 h-8 text-sm" placeholder="Search affiliate..." value={queueSearch} onChange={e => setQueueSearch(e.target.value)} />
                    </div>
                    <Select value={queueStatus} onValueChange={setQueueStatus}>
                        <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={resetFilters}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                    </Button>
                </div>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Affiliate</TableHead>
                                    <TableHead>Amount Due</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell>
                                    </TableRow>
                                )}
                                {!isLoading && payoutQueue?.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No payout records found.</TableCell>
                                    </TableRow>
                                )}
                                {filteredQueue.map((row: any, i: number) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{row.affiliateName}</TableCell>
                                        <TableCell className="font-semibold">{fmt(row.total)}</TableCell>
                                        <TableCell>{row.period}</TableCell>
                                        <TableCell>
                                            <Badge variant={row.status === "paid" ? "default" : "secondary"}>
                                                {row.status === "paid" ? "Paid" : "Pending"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {row.status === "pending" ? (
                                                <Button size="sm" onClick={() => handleMarkPaid(row)}>Mark Paid</Button>
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => handleMarkUnpaid(row)}>Mark Unpaid</Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
