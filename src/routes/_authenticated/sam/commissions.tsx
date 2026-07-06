import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sam/commissions")({
    component: SamCommissionsRoute,
});

function SamCommissionsRoute() {
    const { user } = useAuth();
    const [search, setSearch] = useState("");
    const [planFilter, setPlanFilter] = useState("__all");
    const [monthFilter, setMonthFilter] = useState("__all");

    const { data: allocations, isLoading } = useQuery({
        queryKey: ["sam-waterfall-commissions", user?.id],
        enabled: !!user,
        queryFn: async () => {
            // Fetch SAM's tree to scope subscriptions
            const { data: mgrs } = await supabase.from("profiles").select("id").eq("parent_user_id", user!.id);
            const mgrIds = mgrs?.map(m => m.id) || [];

            let affIds: string[] = [];
            if (mgrIds.length > 0) {
                const { data: affs } = await supabase.from("profiles").select("id").in("parent_user_id", mgrIds);
                affIds = affs?.map(a => a.id) || [];
            }

            let allCustRef: string[] = [];
            if (affIds.length > 0) {
                const { data: custs } = await supabase.from("customers").select("stripe_customer_id, id").in("affiliate_id", affIds);
                const custIdsStr = custs?.map(c => c.stripe_customer_id).filter(Boolean) as string[];
                const custIdsInt = custs?.map(c => String(c.id)).filter(Boolean) as string[];
                allCustRef = [...custIdsStr, ...custIdsInt];
            }

            if (allCustRef.length === 0) return [];

            const { data } = await supabase
                .from("subscriptions")
                .select(`
                    id, 
                    created_at,
                    customers (email, profiles (full_name)),
                    plans (name, price_cents),
                    commissions (amount_cents, beneficiary_role, status)
                `)
                .in("customer_id", allCustRef)
                .order("created_at", { ascending: false });

            return data ?? [];
        },
    });

    const filtered = useMemo(() => {
        if (!allocations) return [];
        const q = search.toLowerCase();
        return allocations.filter((item: any) => {
            const customerEmail = item.customers?.email?.toLowerCase() || "";
            const affiliateName = item.customers?.profiles?.full_name?.toLowerCase() || "";
            const planName = item.plans?.name || "";
            const month = item.created_at?.slice(0, 7) || "";
            if (q && !customerEmail.includes(q) && !affiliateName.includes(q)) return false;
            if (planFilter !== "__all" && planName !== planFilter) return false;
            if (monthFilter !== "__all" && month !== monthFilter) return false;
            return true;
        });
    }, [allocations, search, planFilter, monthFilter]);

    const months = useMemo(() => {
        if (!allocations) return [];
        const set = new Set((allocations as any[]).map((a: any) => a.created_at?.slice(0, 7)).filter(Boolean));
        return Array.from(set).sort().reverse();
    }, [allocations]);

    const planNames = useMemo(() => {
        if (!allocations) return [];
        const set = new Set((allocations as any[]).map((a: any) => a.plans?.name).filter(Boolean));
        return Array.from(set) as string[];
    }, [allocations]);

    return (
        <div className="space-y-6 max-w-[1100px] mx-auto p-2">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Commission Breakdown</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Revenue waterfall — all levels of commission visible to you</p>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Per-Subscriber Revenue Breakdown</CardTitle>
                    <Button variant="outline" size="sm">Export CSV</Button>
                </CardHeader>
                <div className="flex flex-wrap px-6 pb-2 pt-2 items-center gap-2 border-b">
                    <div className="relative flex-1 min-w-[180px] max-w-[280px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
                        <Input
                            className="pl-8 h-9 text-sm max-w-[300px]"
                            placeholder="Search subscribers or affiliates..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                        <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All plans" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all">All plans</SelectItem>
                            {planNames.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={monthFilter} onValueChange={setMonthFilter}>
                        <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="All months" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all">All months</SelectItem>
                            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPlanFilter("__all"); setMonthFilter("__all"); }} className="text-orange-600 font-semibold h-9 px-3">
                        ↻ Reset filters
                    </Button>
                </div>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">Loading waterfall...</div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Subscriber</TableHead>
                                    <TableHead>Affiliate</TableHead>
                                    <TableHead>Plan</TableHead>
                                    <TableHead>Subscribed On</TableHead>
                                    <TableHead>Affiliate (10%)</TableHead>
                                    <TableHead>Manager (4%)</TableHead>
                                    <TableHead>You (1%)</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((item: any) => {
                                    const affiliateComm = item.commissions?.find((c: any) => c.beneficiary_role === "affiliate");
                                    const managerComm = item.commissions?.find((c: any) => c.beneficiary_role === "manager");
                                    const samComm = item.commissions?.find((c: any) => c.beneficiary_role === "sam");

                                    // Display the status of the final branch (SAM) representing the overarching hold.
                                    const overallStatus = samComm?.status || managerComm?.status || affiliateComm?.status || "Pending";

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                {item.customers?.email || "Unknown"}
                                            </TableCell>
                                            <TableCell>
                                                {item.customers?.profiles?.full_name || "Unassigned"}
                                            </TableCell>
                                            <TableCell>
                                                {item.plans?.name || "Unknown"} (${((item.plans?.price_cents || 0) / 100).toFixed(0)})
                                            </TableCell>
                                            <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-semibold text-emerald-600">
                                                {affiliateComm ? `$${(affiliateComm.amount_cents / 100).toFixed(2)}` : "—"}
                                            </TableCell>
                                            <TableCell className="font-semibold text-emerald-600">
                                                {managerComm ? `$${(managerComm.amount_cents / 100).toFixed(2)}` : "—"}
                                            </TableCell>
                                            <TableCell className="font-semibold text-emerald-600 opacity-70">
                                                {samComm ? `$${(samComm.amount_cents / 100).toFixed(2)}` : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    overallStatus === "cleared" || overallStatus === "paid"
                                                        ? "default"
                                                        : "secondary"
                                                }>
                                                    {overallStatus}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No matching subscriptions found for your mapping.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
