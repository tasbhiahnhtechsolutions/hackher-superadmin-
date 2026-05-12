import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/affiliate/earnings")({ component: Page });
function Page() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["earnings", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("commissions").select("*").eq("beneficiary_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });
  return <>
    <PageHeader title="Earnings" subtitle="Your commissions and payouts" />
    <PageBody><div className="rounded-xl border border-border/60 bg-card"><Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Rate</TableHead><TableHead>Status</TableHead><TableHead>Cleared</TableHead></TableRow></TableHeader>
      <TableBody>
        {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          : !data?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No earnings yet.</TableCell></TableRow>
          : data.map((c) => <TableRow key={c.id}>
              <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="font-medium">${(c.amount_cents/100).toFixed(2)}</TableCell>
              <TableCell>{(Number(c.rate)*100).toFixed(0)}%</TableCell>
              <TableCell><Badge>{c.status}</Badge></TableCell>
              <TableCell>{c.cleared_at ? new Date(c.cleared_at).toLocaleDateString() : "—"}</TableCell>
            </TableRow>)}
      </TableBody></Table></div></PageBody>
  </>;
}
