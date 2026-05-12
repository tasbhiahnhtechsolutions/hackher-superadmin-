import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/api-keys")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => (await supabase.from("api_keys").select("*").is("revoked_at", null).order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const raw = "hh_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0,16);
      const prefix = raw.slice(0, 12);
      // Hash with SubtleCrypto SHA-256
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      const keyHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.from("api_keys").insert({ name, prefix, key_hash: keyHash, created_by: user!.id });
      if (error) throw error;
      return raw;
    },
    onSuccess: (raw) => {
      setRevealed(raw);
      setOpen(false); setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = async (id: string) => {
    await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["api-keys"] });
    toast.success("Revoked");
  };

  return (
    <>
      <PageHeader title="API Keys" subtitle="For external customer apps to query plans, validate codes, and create subscriptions"
        action={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New key</Button>} />
      <PageBody>
        {revealed && (
          <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-semibold">Save this key now — it won't be shown again:</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-background px-3 py-2 text-xs font-mono">{revealed}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealed); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>Dismiss</Button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border/60 bg-card"><Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Created</TableHead><TableHead>Last used</TableHead><TableHead className="text-right"></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              : !data?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No keys yet.</TableCell></TableRow>
              : data.map((k) => <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{k.prefix}…</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(k.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => revoke(k.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>)}
          </TableBody></Table></div>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New API key</DialogTitle></DialogHeader>
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer App Production" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>{create.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
