import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listFraudFlags, updateFraudFlag } from "@/lib/fraud.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldAlert, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/fraud")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: FraudPage,
});

interface Flag {
  id: string; flag_type: string; severity: string; status: string;
  risk_score: number; subject_user_id: string | null; details: Record<string, unknown>;
  ip_address: string | null; created_at: string; review_notes: string | null;
}

const SEV_COLORS: Record<string, string> = {
  low: "bg-blue-500/15 text-blue-500",
  medium: "bg-amber-500/15 text-amber-500",
  high: "bg-orange-500/15 text-orange-500",
  critical: "bg-red-500/15 text-red-500",
};

function FraudPage() {
  const list = useServerFn(listFraudFlags);
  const update = useServerFn(updateFraudFlag);
  const [rows, setRows] = useState<Flag[]>([]);
  const [filter, setFilter] = useState<"open" | "reviewing" | "dismissed" | "confirmed" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Flag | null>(null);
  const [notes, setNotes] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await list({ data: { status: filter, limit: 100 } });
      setRows(data as Flag[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filter]);

  const act = async (status: "reviewing" | "dismissed" | "confirmed") => {
    if (!selected) return;
    try {
      await update({ data: { id: selected.id, status, notes } });
      toast.success(`Marked as ${status}`);
      setSelected(null); setNotes("");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fraud Review"
        subtitle="Suspicious activity flagged by automated detection"
        action={
          <div className="flex gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>}
              {!loading && !rows.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No flags</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => { setSelected(r); setNotes(r.review_notes ?? ""); }}>
                  <TableCell className="font-medium">{r.flag_type.replace(/_/g, " ")}</TableCell>
                  <TableCell><Badge className={SEV_COLORS[r.severity] ?? ""} variant="secondary">{r.severity}</Badge></TableCell>
                  <TableCell>{r.risk_score}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell><Button size="sm" variant="ghost">Review</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fraud flag · {selected?.flag_type.replace(/_/g, " ")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Severity: <strong className="text-foreground">{selected.severity}</strong></span>
                <span>Risk score: <strong className="text-foreground">{selected.risk_score}</strong></span>
                {selected.ip_address && <span>IP: <strong className="text-foreground">{selected.ip_address}</strong></span>}
              </div>
              <pre className="bg-muted/50 rounded-md p-3 text-xs overflow-x-auto">{JSON.stringify(selected.details, null, 2)}</pre>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes…" rows={3} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => act("reviewing")}>Mark reviewing</Button>
            <Button variant="outline" onClick={() => act("dismissed")}>Dismiss</Button>
            <Button variant="destructive" onClick={() => act("confirmed")}>Confirm fraud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
