import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { DollarSign, Clock, CheckCircle, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sam/earnings")({
    component: SamEarningsRoute,
});

function fmt(cents: number) {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    if (status === "paid" || status === "cleared") return "default";
    if (status === "pending") return "secondary";
    return "outline";
}

function SamEarningsRoute() {
    const { user } = useAuth();

    // Summary metrics from sam_analytics_view
    const { data: summary } = useQuery({
        queryKey: ["sam-earnings-summary", user?.id],
        enabled: !!user,
        queryFn: async () => {
            const { data } = await supabase
                .from("sam_analytics_view" as any)
                .select("total_earned_cents, total_paid_commission_cents, pending_commission_cents")
                .eq("id", user!.id)
                .maybeSingle();
            return data as {
                total_earned_cents: number;
                total_paid_commission_cents: number;
                pending_commission_cents: number;
            } | null;
        },
    });

    // 30-day hold: commissions in "pending" status created in last 30 days for this SAM
    const { data: holdData } = useQuery({
        queryKey: ["sam-earnings-hold", user?.id],
        enabled: !!user,
        queryFn: async () => {
            const since = new Date();
            since.setDate(since.getDate() - 30);
            const { data } = await supabase
                .from("commissions")
                .select("amount_cents")
                .eq("beneficiary_id", user!.id)
                .eq("status", "pending")
                .gte("created_at", since.toISOString());
            const total = (data ?? []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);
            return total as number;
        },
    });

    // Monthly payout-status rows grouped by month (Period, Amount, Status)
    const { data: monthlyPayouts, isLoading } = useQuery({
        queryKey: ["sam-earnings-monthly", user?.id],
        enabled: !!user,
        queryFn: async () => {
            const { data } = await supabase
                .from("commissions")
                .select("amount_cents, status, created_at")
                .eq("beneficiary_id", user!.id)
                .order("created_at", { ascending: false });

            if (!data?.length) return [];

            // Group by YYYY-MM
            const map: Record<string, { period: string; total: number; statuses: string[] }> = {};
            for (const row of data) {
                const d = new Date(row.created_at);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                if (!map[key]) map[key] = { period: label, total: 0, statuses: [] };
                map[key].total += row.amount_cents || 0;
                map[key].statuses.push(row.status);
            }

            // Determine dominant status per month
            return Object.entries(map)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([, v]) => {
                    const hasPaid = v.statuses.some((s) => s === "paid" || s === "cleared");
                    const hasPending = v.statuses.some((s) => s === "pending");
                    const status = hasPaid && !hasPending ? "Paid" : hasPending ? "Pending" : v.statuses[0];
                    return { period: v.period, total: v.total, status };
                });
        },
    });

    const totalEarned = summary?.total_earned_cents ?? 0;
    const paidOut = summary?.total_paid_commission_cents ?? 0;
    const pending = summary?.pending_commission_cents ?? 0;
    const hold = holdData ?? 0;

    const metrics = [
        {
            label: "Total Earned",
            value: fmt(totalEarned),
            sub: "Cumulative SAM-tier commission",
            icon: DollarSign,
            color: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-900/20",
        },
        {
            label: "Paid Out",
            value: fmt(paidOut),
            sub: "Cumulative payouts received",
            icon: CheckCircle,
            color: "text-blue-500",
            bg: "bg-blue-50 dark:bg-blue-900/20",
        },
        {
            label: "Pending",
            value: fmt(pending),
            sub: "Earned but not yet paid",
            icon: Clock,
            color: "text-amber-500",
            bg: "bg-amber-50 dark:bg-amber-900/20",
        },
        {
            label: "30-Day Hold",
            value: fmt(hold),
            sub: "In chargeback window (SAM tier only)",
            icon: ShieldAlert,
            color: "text-rose-500",
            bg: "bg-rose-50 dark:bg-rose-900/20",
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-[22px] font-bold mb-1">My Earnings</h1>
                <p className="text-[13px] text-muted-foreground mb-6">
                    Your personal SAM-tier commission earnings
                </p>
            </div>

            {/* Summary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((m) => {
                    const Icon = m.icon;
                    return (
                        <Card key={m.label}>
                            <CardContent className="pt-5 pb-5">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">
                                            {m.label}
                                        </p>
                                        <p className="text-2xl font-bold">{m.value}</p>
                                        <p className="text-[11px] text-muted-foreground">{m.sub}</p>
                                    </div>
                                    <div className={`p-2 rounded-lg ${m.bg}`}>
                                        <Icon className={`h-5 w-5 ${m.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Payout Status Table */}
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Payout Status</CardTitle>
                        <p className="text-[12px] text-muted-foreground mt-1">
                            Monthly breakdown — managed by your Super Admin Manager
                        </p>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Period</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            )}
                            {!isLoading && monthlyPayouts?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                                        No earnings records found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {monthlyPayouts?.map((row: any) => (
                                <TableRow key={row.period}>
                                    <TableCell className="font-medium">{row.period}</TableCell>
                                    <TableCell className="font-semibold">{fmt(row.total)}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(row.status.toLowerCase())}>
                                            {row.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
