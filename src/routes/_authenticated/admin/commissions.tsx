import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/commissions")({
    component: AdminCommissionsRoute,
});

function AdminCommissionsRoute() {
    const [search, setSearch] = useState("");

    const { data: allocations, isLoading } = useQuery({
        queryKey: ["admin-waterfall-commissions"],
        queryFn: async () => {
            // Fetch subscriptions alongside their nested plans, customers (plus affiliate), & generated commissions
            const { data } = await supabase
                .from("subscriptions")
                .select(`
                    id, 
                    created_at,
                    customers (email, profiles (full_name)),
                    plans (name, price_cents),
                    commissions (amount_cents, beneficiary_role, status)
                `)
                .order("created_at", { ascending: false });

            // Filter out subscriptions that don't have an affiliate assigned
            return (data ?? []).filter((item: any) => item.customers?.profiles);
        },
    });

    const filtered = useMemo(() => {
        if (!allocations) return [];
        return allocations.filter((item: any) => {
            const customerEmail = item.customers?.email?.toLowerCase() || "";
            const affiliateName = item.customers?.profiles?.full_name?.toLowerCase() || "";
            const q = search.toLowerCase();
            return customerEmail.includes(q) || affiliateName.includes(q);
        });
    }, [allocations, search]);

    const handleExportCSV = () => {
        const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const headers = ["Subscriber", "Affiliate", "Plan", "Subscribed On", "Affiliate Comm.", "SAM Comm.", "Status"];
        
        const lines = [headers.join(",")];
        for (const item of filtered) {
            const affiliateComm = item.commissions?.find((c: any) => c.beneficiary_role === "affiliate");
            const samComm = item.commissions?.find((c: any) => c.beneficiary_role === "sam");
            
            const row = [
                item.customers?.email || "Unknown",
                item.customers?.profiles?.full_name || "Unassigned",
                `${item.plans?.name || "Unknown"} ($${((item.plans?.price_cents || 0) / 100).toFixed(0)})`,
                new Date(item.created_at).toLocaleDateString(),
                affiliateComm ? `$${(affiliateComm.amount_cents / 100).toFixed(2)}` : "—",
                samComm ? `$${(samComm.amount_cents / 100).toFixed(2)}` : "—",
                affiliateComm?.status || samComm?.status || "Pending"
            ];
            lines.push(row.map(escape).join(","));
        }
        
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `commissions_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 max-w-[1100px] mx-auto p-2">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Commission Breakdown</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Revenue waterfall — manager and affiliate commissions visible to Super Admin</p>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Per-Subscriber Revenue Breakdown</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>Export CSV</Button>
                </CardHeader>
                <div className="flex px-6 pb-2 items-center gap-2 border-b">
                    <Input
                        className="max-w-[300px] h-9"
                        placeholder="Search subscribers or affiliates..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="text-orange-600 font-semibold h-9 px-3">
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
                                    <TableHead>Affiliate Comm.</TableHead>
                                    <TableHead>SAM Comm.</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((item: any) => {
                                    const affiliateComm = item.commissions?.find((c: any) => c.beneficiary_role === "affiliate");
                                    const samComm = item.commissions?.find((c: any) => c.beneficiary_role === "sam");

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
                                                {samComm ? `$${(samComm.amount_cents / 100).toFixed(2)}` : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    affiliateComm?.status === "cleared" || samComm?.status === "cleared"
                                                        ? "default"
                                                        : "secondary"
                                                }>
                                                    {affiliateComm?.status || samComm?.status || "Pending"}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No matching subscriptions found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
