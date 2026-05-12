import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { adminRetryEmail, adminRunRetryWorker, adminSendTestEmail } from "@/lib/email/email.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/emails")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: EmailsPage,
});

interface Row { id: string; template_name: string; recipient_email: string; status: string; subject: string | null; error_message: string | null; created_at: string; message_id: string | null; retry_count: number | null; }

function EmailsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tplFilter, setTplFilter] = useState<string>("all");
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const retryFn = useServerFn(adminRetryEmail);
  const runFn = useServerFn(adminRunRetryWorker);
  const testFn = useServerFn(adminSendTestEmail);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("email_send_log").select("id,template_name,recipient_email,status,subject,error_message,created_at,message_id,retry_count").order("created_at", { ascending: false }).limit(200);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (tplFilter !== "all") q = q.eq("template_name", tplFilter);
    const { data } = await q;
    // dedupe by message_id, keep latest
    const seen = new Set<string>();
    const dedup: Row[] = [];
    for (const r of (data ?? []) as Row[]) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key); dedup.push(r);
    }
    setRows(dedup);
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter, tplFilter]);

  const counts = rows.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
  const templates = Array.from(new Set(rows.map((r) => r.template_name)));

  const onRetry = async (id: string) => {
    try { const r = await retryFn({ data: { logId: id } }); r.ok ? toast.success("Resent") : toast.error(r.error || r.skipped || "Failed"); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onWorker = async () => {
    try { const r = await runFn(); toast.success(`Retried ${r.retried} email(s)`); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onTest = async () => {
    if (!testEmail) return;
    try { const r = await testFn({ data: { to: testEmail } }); r.ok ? toast.success("Test sent") : toast.error(r.error || "Failed"); load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const badge = (s: string) => {
    const map: Record<string, string> = { sent: "default", failed: "destructive", suppressed: "secondary", pending: "outline" };
    return <Badge variant={(map[s] as never) ?? "secondary"}>{s}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Email delivery" description="Audit log of every transactional email." action={
        <Button onClick={onWorker} variant="outline" size="sm"><RefreshCw className="mr-2 h-4 w-4" /> Run retry worker</Button>
      } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["sent", "failed", "suppressed", "pending"].map((k) => (
          <Card key={k}><CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{counts[k] ?? 0}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tplFilter} onValueChange={setTplFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {templates.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Input placeholder="test@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="w-64" />
            <Button size="sm" onClick={onTest}><Send className="mr-2 h-4 w-4" /> Send test</Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No emails yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.template_name}</TableCell>
                <TableCell>{r.recipient_email}</TableCell>
                <TableCell>{badge(r.status)}{r.error_message && <div className="text-[11px] text-destructive mt-1 line-clamp-1">{r.error_message}</div>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{r.retry_count ?? 0}</TableCell>
                <TableCell className="text-right">
                  {r.status === "failed" && <Button variant="ghost" size="sm" onClick={() => onRetry(r.id)}>Retry</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
