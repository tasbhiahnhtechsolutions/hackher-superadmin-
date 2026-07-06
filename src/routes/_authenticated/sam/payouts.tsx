import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { markPayoutPaid } from "@/lib/payouts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageBody } from "@/components/page-header";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sam/payouts")({ component: SamPayoutsPage });

function SamPayoutsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const mark = useServerFn(markPayoutPaid);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("__all");
  const [periodFilter, setPeriodFilter] = useState("__all");
  const [statusFilter, setStatusFilter] = useState("__all");

  const { data, isLoading } = useQuery({
    queryKey: ["sam-payouts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: mgrs } = await supabase.from("profiles").select("id,full_name,role").eq("parent_user_id", user!.id);
      const mgrIds = mgrs?.map(m => m.id) || [];

      let affIds: string[] = [];
      if (mgrIds.length > 0) {
        const { data: affs } = await supabase.from("profiles").select("id,full_name,role").in("parent_user_id", mgrIds);
        affIds = affs?.map(a => a.id) || [];
      }

      const downlineIds = [...mgrIds, ...affIds];
      if (downlineIds.length === 0) return [];

      const { data } = await supabase
        .from("payouts")
        .select("*, profiles:beneficiary_id(full_name, email, role)")
        .in("beneficiary_id", downlineIds)
        .order("created_at", { ascending: false });

      return data ?? [];
    },
  });

  const periods = useMemo(() => {
    if (!data) return [];
    const set = new Set((data as any[]).map(p => p.period_start?.slice(0, 7)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return (data as any[]).filter(p => {
      const name = (p.profiles?.full_name || p.profiles?.email || "").toLowerCase();
      const role = p.profiles?.role || "";
      const period = p.period_start?.slice(0, 7) || "";
      const status = p.status || "";
      if (q && !name.includes(q)) return false;
      if (roleFilter !== "__all" && role !== roleFilter) return false;
      if (periodFilter !== "__all" && period !== periodFilter) return false;
      if (statusFilter !== "__all" && status !== statusFilter) return false;
      return true;
    });
  }, [data, search, roleFilter, periodFilter, statusFilter]);

  const markPaid = async (id: string, currentlyPaid: boolean) => {
    if (currentlyPaid) {
      toast.info("Marking unpaid is not fully supported by current backend implementation yet.");
      return;
    }
    try {
      await mark({ data: { payoutId: id } });
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["sam-payouts"] });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const reset = () => { setSearch(""); setRoleFilter("__all"); setPeriodFilter("__all"); setStatusFilter("__all"); };

  return (
    <>
      <PageHeader title="Network Payouts" subtitle="Manage payouts for your managers and affiliates" />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border/60 bg-muted/30 items-center">
            <div className="relative flex-1 min-w-[180px] max-w-[280px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search recipient..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All roles</SelectItem>
                <SelectItem value="affiliate">Affiliate</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All periods" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All periods</SelectItem>
                {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={reset} className="text-orange-600 font-semibold h-9 px-3">
              ↻ Reset
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : !filtered.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payouts found.</TableCell>
                </TableRow>
              ) : (
                filtered.map((p: any) => {
                  const isPaid = p.status === "paid";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.profiles?.full_name || p.profiles?.email || p.beneficiary_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{p.profiles?.role || "—"}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">${(p.amount_cents / 100).toFixed(2)}</TableCell>
                      <TableCell>{p.period_start} → {p.period_end}</TableCell>
                      <TableCell>
                        <Badge variant={isPaid ? "default" : "secondary"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        {isPaid ? (
                          <Button size="sm" variant="outline" onClick={() => markPaid(p.id, true)}>Mark Unpaid</Button>
                        ) : (
                          <Button size="sm" onClick={() => markPaid(p.id, false)}>Mark Paid</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}




