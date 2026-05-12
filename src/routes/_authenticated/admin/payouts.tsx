import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generatePayouts, markPayoutPaid } from "@/lib/payouts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/payouts")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const gen = useServerFn(generatePayouts);
  const mark = useServerFn(markPayoutPaid);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["payouts"],
    queryFn: async () => (await supabase.from("payouts").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const generate = useMutation({
    mutationFn: async () => gen({ data: { periodStart: start, periodEnd: end } }),
    onSuccess: (r) => {
      toast.success(`Generated ${r.created} payout(s) totaling $${(r.totalCents / 100).toFixed(2)}`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["payouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = async (id: string) => {
    try {
      await mark({ data: { payoutId: id } });
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["payouts"] });
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Payouts" subtitle="Generate payouts from cleared commissions" action={<Button onClick={() => setOpen(true)}>Generate payouts</Button>} />
      <PageBody><div className="rounded-xl border border-border/60 bg-card"><Table>
        <TableHeader><TableRow><TableHead>Beneficiary</TableHead><TableHead>Amount</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Paid</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            : !data?.length ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No payouts yet.</TableCell></TableRow>
            : data.map((p) => <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.beneficiary_id.slice(0,8)}</TableCell>
                <TableCell>${(p.amount_cents/100).toFixed(2)}</TableCell>
                <TableCell>{p.period_start} → {p.period_end}</TableCell>
                <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="text-right">{p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid(p.id)}>Mark paid</Button>}</TableCell>
              </TableRow>)}
        </TableBody></Table></div></PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate payouts</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Aggregates all cleared (un-paid) commissions in the selected window into a payout per beneficiary.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? "Generating…" : "Generate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
