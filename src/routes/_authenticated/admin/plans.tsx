import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { syncPlanToStripe } from "@/lib/stripe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, RefreshCw, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  component: PlansPage,
});

interface PlanForm {
  id?: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  interval: "month" | "year";
  trial_days: number;
  features: string;
  is_active: boolean;
}

const empty: PlanForm = { name: "", description: "", price_cents: 0, currency: "usd", interval: "month", trial_days: 0, features: "", is_active: true };

function PlansPage() {
  const qc = useQueryClient();
  const sync = useServerFn(syncPlanToStripe);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(empty);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: PlanForm) => {
      const features = f.features.split("\n").map((s) => s.trim()).filter(Boolean);
      const payload = { name: f.name, description: f.description || null, price_cents: f.price_cents, currency: f.currency, interval: f.interval, trial_days: f.trial_days, features, is_active: f.is_active };
      if (f.id) {
        const { error } = await supabase.from("plans").update(payload).eq("id", f.id);
        if (error) throw error;
        return f.id;
      } else {
        const { data, error } = await supabase.from("plans").insert(payload).select("id").single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: async (id) => {
      toast.success("Plan saved. Syncing to Stripe…");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["plans"] });
      try {
        const r = await sync({ data: { planId: id } });
        if (r.synced) toast.success("Synced to Stripe");
        else toast.warning(r.reason ?? "Stripe sync skipped");
        qc.invalidateQueries({ queryKey: ["plans"] });
      } catch (e: unknown) {
        toast.error(`Stripe: ${(e as Error).message}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resync = async (id: string) => {
    try {
      const r = await sync({ data: { planId: id } });
      if (r.synced) toast.success("Re-synced");
      else toast.warning(r.reason ?? "Skipped");
      qc.invalidateQueries({ queryKey: ["plans"] });
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (p: typeof empty & { id: string; features: unknown }) => {
    const feats = Array.isArray(p.features) ? (p.features as string[]).join("\n") : "";
    setForm({ ...p, features: feats });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Subscription Plans"
        subtitle="Create plans and sync them to Stripe"
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />New plan</Button>}
      />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : !plans?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No plans yet. Create your first.</TableCell></TableRow>
              ) : plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>${(p.price_cents / 100).toFixed(2)} {p.currency.toUpperCase()}</TableCell>
                  <TableCell className="capitalize">{p.interval}</TableCell>
                  <TableCell>{p.trial_days} days</TableCell>
                  <TableCell>{p.stripe_price_id ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> Synced</Badge> : <Badge variant="secondary">Not synced</Badge>}</TableCell>
                  <TableCell>{p.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => resync(p.id)}><RefreshCw className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p as never)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Price (cents)</Label><Input type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })} /></div>
              <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toLowerCase() })} /></div>
              <div><Label>Interval</Label>
                <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v as "month" | "year" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="month">Monthly</SelectItem><SelectItem value="year">Yearly</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Trial days</Label><Input type="number" value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })} /></div>
            <div><Label>Features (one per line)</Label><Textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save & sync"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
