import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/affiliate/subscribers")({ component: Page });

type Sub = {
  id: string;
  created_at: string;
  full_name: string | null;
  email: string;
  promoCode: string | null;
  planName: string | null;
  expires: string | null;
  commission: number;
};

function Page() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [promoFilter, setPromoFilter] = useState("__all");
  const [planFilter, setPlanFilter] = useState("__all");

  const { data, isLoading } = useQuery({
    queryKey: ["my-subs-detailed", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Sub[]> => {
      // 1. Get customers
      const { data: customers } = await supabase
        .from("customers")
        .select("id,created_at,full_name,email")
        .eq("affiliate_id", user!.id)
        .order("created_at", { ascending: false });

      const ids = (customers ?? []).map((c) => c.id);
      if (!ids.length) return [];

      // 2. Get active subscriptions for these customers
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id,customer_id,promo_code_id,plan_id,current_period_end,status")
        .in("customer_id", ids);

      const promoIds = Array.from(new Set((subs ?? []).map((s) => s.promo_code_id).filter(Boolean) as string[]));
      const planIds = Array.from(new Set((subs ?? []).map((s) => s.plan_id).filter(Boolean) as string[]));
      const subIds = Array.from(new Set((subs ?? []).map((s) => s.id) as string[]));

      // 3. Get promo code names, plan names, and recent commissions
      const { data: codes } = promoIds.length
        ? await supabase.from("promo_codes").select("id,code").in("id", promoIds)
        : { data: [] };
      const { data: plans } = planIds.length
        ? await supabase.from("plans").select("id,name").in("id", planIds)
        : { data: [] };

      // Latest commission per subscription
      const { data: comms } = subIds.length
        ? await supabase.from("commissions").select("subscription_id,amount_cents,created_at").in("subscription_id", subIds).eq("status", "paid").order("created_at", { ascending: false })
        : { data: [] };

      const promoMap = new Map((codes ?? []).map((p) => [p.id, p.code]));
      const planMap = new Map((plans ?? []).map((p) => [p.id, p.name]));

      // Get the most recent commission for each sub
      const commMap = new Map<string, number>();
      for (const c of comms ?? []) {
        if (!commMap.has(c.subscription_id)) {
          commMap.set(c.subscription_id, c.amount_cents);
        }
      }

      const customerSubMap = new Map<string, any>();
      for (const s of subs ?? []) {
        if (!customerSubMap.has(s.customer_id) || s.status === 'active') {
          customerSubMap.set(s.customer_id, s);
        }
      }

      return (customers ?? []).map((c) => {
        const sub = customerSubMap.get(c.id);
        const subId = sub?.id;
        return {
          id: c.id,
          created_at: c.created_at,
          full_name: c.full_name,
          email: c.email,
          promoCode: sub?.promo_code_id ? promoMap.get(sub.promo_code_id) ?? null : null,
          planName: sub?.plan_id ? planMap.get(sub.plan_id) ?? null : null,
          expires: sub?.current_period_end ?? null,
          commission: subId ? (commMap.get(subId) ?? 0) : 0,
        };
      });
    },
  });

  const promos = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.promoCode ?? "(no promo code)"))).filter(x => x).sort(),
    [data],
  );
  const plans = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.planName ?? ""))).filter(Boolean).sort(),
    [data],
  );
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data ?? []).filter((r) => {
      if (promoFilter !== "__all" && (r.promoCode ?? "(no promo code)") !== promoFilter) return false;
      if (planFilter !== "__all" && (r.planName ?? "") !== planFilter) return false;
      if (q && !r.email.toLowerCase().includes(q) && !(r.full_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, promoFilter, planFilter, search]);

  const downloadReport = () => {
    if (!filtered.length) return;
    const headers = ["Subscriber", "Email", "Promo Code Used", "Plan", "Subscribed", "Expires", "Commission"];
    const rows = filtered.map(row => [
      `"${row.full_name ?? ''}"`,
      `"${row.email}"`,
      `"${row.promoCode ?? ''}"`,
      `"${row.planName ?? ''}"`,
      `"${new Date(row.created_at).toLocaleDateString()}"`,
      `"${row.expires ? new Date(row.expires).toLocaleDateString() : ''}"`,
      `"${(row.commission / 100).toFixed(2)}"`,
    ].join(","));

    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `affiliate_subscribers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <PageHeader title="Subscribers" subtitle="Customers attributed to your promo codes" />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          {/* Filter + Download Bar */}
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border/60 bg-muted/30 items-center">
            <div className="relative flex-1 min-w-[180px] max-w-[260px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search subscriber..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All plans" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All plans</SelectItem>
                {plans.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={promoFilter} onValueChange={setPromoFilter}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="All promo codes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All promo codes</SelectItem>
                {promos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm"
              onClick={() => { setSearch(""); setPromoFilter("__all"); setPlanFilter("__all"); }}
              className="text-orange-600 font-semibold h-9 px-3">↻ Reset
            </Button>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={downloadReport} disabled={!filtered.length}>
                <Download className="mr-2 h-4 w-4" /> Download Report
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subscriber</TableHead>
                <TableHead>Promo Code Used</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !filtered.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No subscribers yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.full_name ?? "—"}
                      <div className="text-xs text-muted-foreground font-normal">{c.email}</div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {c.promoCode ? <Badge variant="secondary">{c.promoCode}</Badge> : <span className="text-muted-foreground">(none)</span>}
                    </TableCell>
                    <TableCell>{c.planName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.expires ? new Date(c.expires).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="font-medium text-emerald-600">
                      ${(c.commission / 100).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}

