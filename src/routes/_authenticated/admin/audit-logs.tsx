import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({ component: Page });
function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return <>
    <PageHeader title="Audit Logs" subtitle="All sensitive actions across the platform" />
    <PageBody><div className="rounded-xl border border-border/60 bg-card"><Table>
      <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
      <TableBody>
        {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          : !data?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No events yet.</TableCell></TableRow>
          : data.map((a) => <TableRow key={a.id}>
              <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
              <TableCell className="font-mono text-xs">{a.actor_id?.slice(0,8) ?? "—"}</TableCell>
              <TableCell className="font-medium">{a.action}</TableCell>
              <TableCell>{a.entity_type ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground max-w-md truncate">{JSON.stringify(a.new_values ?? {})}</TableCell>
            </TableRow>)}
      </TableBody></Table></div></PageBody>
  </>;
}
