import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";
import { Users, UserCheck, DollarSign, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager/")({
  component: ManagerDashboard,
});

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ManagerDashboard() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["manager-dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { mgr: null, affiliates: [], subsThisMonth: 0 };

      const { data: mgr } = await supabase
        .from("manager_analytics_view" as any)
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // Affiliates with analytics data
      const { data: affiliates } = await supabase
        .from("affiliate_analytics_view" as any)
        .select("*")
        .eq("manager_id", user.id);

      // Active subscribers this month across all affiliates
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      return { mgr: (mgr as any) || null, affiliates: (affiliates as any[]) || [] };
    },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const resetFilters = () => { setSearch(""); setStatusFilter("all"); };

  const mgr = data?.mgr;
  const allAffiliates = data?.affiliates ?? [];
  const affiliates = useMemo(() => allAffiliates.filter((a: any) => {
    const q = search.toLowerCase();
    const matchQ = !q || (a.full_name || "").toLowerCase().includes(q);
    const matchS = statusFilter === "all" || (a.status || "active") === statusFilter;
    return matchQ && matchS;
  }), [allAffiliates, search, statusFilter]);

  const kpis = [
    {
      label: "My Affiliates",
      value: String(mgr?.active_affiliates ?? 0),
      sub: "Active affiliates assigned to you",
      icon: Users,
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-900/20",
    },
    {
      label: "Total Subscribers",
      value: String(mgr?.total_subscribers ?? 0),
      sub: "Active paid subscribers",
      icon: UserCheck,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "My Commission (4%)",
      value: fmt(mgr?.total_earned_cents ?? 0),
      sub: "Manager-tier earnings",
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Affiliate Commissions",
      value: fmt(affiliates.reduce((s: number, a: any) => s + (a.total_earned_cents || 0), 0)),
      sub: "Combined 10% across all affiliates",
      icon: TrendingUp,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Manager Dashboard</h1>
        <p className="text-[13px] text-muted-foreground mb-6">Your affiliates and their performance</p>
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
                    <p className="text-2xl font-bold">{k.value}</p>
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

      {/* Affiliates Performance Table */}
      <Card>
        <div className="px-6 pt-5 pb-3 border-b">
          <h2 className="font-semibold text-base">Affiliates Performance</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">You can only view your own affiliates.</p>
        </div>
        <div className="flex flex-wrap gap-2 px-6 py-3 border-b bg-muted/30 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search affiliate..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={resetFilters}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Comm. %</TableHead>
                <TableHead>Subscribers</TableHead>
                <TableHead>Contract Exp.</TableHead>
                <TableHead>Their Comm.</TableHead>
                <TableHead className="text-primary font-semibold">My Comm.</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {affiliates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No affiliates found.
                  </TableCell>
                </TableRow>
              )}
              {affiliates.map((aff: any) => {
                const meta = (typeof aff.metadata === "string" ? JSON.parse(aff.metadata || "{}") : aff.metadata) || {};
                const contractEnd = meta.contract_end ? new Date(meta.contract_end) : null;
                const daysLeft = contractEnd ? Math.ceil((contractEnd.getTime() - Date.now()) / 86400000) : null;
                // Manager earns 4% of what the affiliate drives
                const mgrCommCents = Math.round((aff.total_earned_cents || 0) * 0.04 / 0.10);
                return (
                  <TableRow key={aff.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-xs">
                          {(aff.full_name || "U").substring(0, 2).toUpperCase()}
                        </div>
                        {aff.full_name || "Unknown"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {aff.primary_campaign
                        ? <Badge variant="outline">{aff.primary_campaign}</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>{aff.commission_rate ? `${(aff.commission_rate * 100).toFixed(0)}%` : "10%"}</TableCell>
                    <TableCell>{aff.active_subscribers || 0}</TableCell>
                    <TableCell>
                      {contractEnd ? (
                        <div className="flex items-center gap-1.5">
                          {contractEnd.toLocaleDateString()}
                          {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 &&
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">Expiring</Badge>}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>{fmt(aff.total_earned_cents || 0)}</TableCell>
                    <TableCell className="font-semibold text-primary">{fmt(mgrCommCents)}</TableCell>
                    <TableCell>
                      <Badge variant={aff.status === "active" ? "default" : "secondary"}>
                        {aff.status || "active"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
