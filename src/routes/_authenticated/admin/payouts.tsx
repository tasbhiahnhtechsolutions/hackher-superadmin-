import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/admin/payouts")({ component: Page });
function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["payouts"],
    queryFn: async () => (await supabase.from("payouts").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  return <>
    <PageHeader title="Payouts" subtitle="Pending and completed commission payouts" />
    <PageBody><div className="rounded-xl border border-border/60 bg-card"><Table>
      <TableHeader><TableRow><TableHead>Beneficiary</TableHead><TableHead>Amount</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Paid</TableHead></TableRow></TableHeader>
      <TableBody>
        {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          : !data?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No payouts yet.</TableCell></TableRow>
          : data.map((p) => <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.beneficiary_id.slice(0,8)}</TableCell>
              <TableCell>${(p.amount_cents/100).toFixed(2)}</TableCell>
              <TableCell>{p.period_start} → {p.period_end}</TableCell>
              <TableCell><Badge>{p.status}</Badge></TableCell>
              <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
            </TableRow>)}
      </TableBody></Table></div></PageBody>
  </>;
}
