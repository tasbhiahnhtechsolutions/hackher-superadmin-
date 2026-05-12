import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { syncPromoToStripe } from "@/lib/stripe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/promo-codes")({
  component: PromoPage,
});

function PromoPage() {
  const qc = useQueryClient();
  const sync = useServerFn(syncPromoToStripe);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(10);
  const [usageLimit, setUsageLimit] = useState<string>("");

  const { data: codes, isLoading } = useQuery({
    queryKey: ["promos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (discount < 0 || discount > 30) throw new Error("Discount must be between 0 and 30%");
      if (!/^[A-Za-z0-9]{3,30}$/.test(code)) throw new Error("Code must be 3-30 alphanumeric characters");
      const { data, error } = await supabase.from("promo_codes").insert({
        code: code.toUpperCase(),
        discount_percent: discount,
        usage_limit: usageLimit ? Number(usageLimit) : null,
        status: "active",
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success("Promo created. Syncing to Stripe…");
      setOpen(false); setCode(""); setDiscount(10); setUsageLimit("");
      qc.invalidateQueries({ queryKey: ["promos"] });
      try {
        const r = await sync({ data: { promoId: id } });
        if (r.synced) toast.success("Synced to Stripe");
        else toast.warning(r.reason ?? "Stripe sync skipped");
        qc.invalidateQueries({ queryKey: ["promos"] });
      } catch (e: unknown) { toast.error(`Stripe: ${(e as Error).message}`); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resync = async (id: string) => {
    try {
      const r = await sync({ data: { promoId: id } });
      if (r.synced) toast.success("Re-synced");
      else toast.warning(r.reason ?? "Skipped");
      qc.invalidateQueries({ queryKey: ["promos"] });
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("promo_codes").update({ status: active ? "disabled" : "active" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["promos"] });
  };

  return (
    <>
      <PageHeader
        title="Promo Codes"
        subtitle="Max 30% discount enforced. Synced as Stripe coupons."
        action={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New code</Button>}
      />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Usage</TableHead>
                <TableHead>Stripe</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : !codes?.length ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No promo codes yet.</TableCell></TableRow>
                : codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                    <TableCell>{c.discount_percent}%</TableCell>
                    <TableCell>{c.usage_count} / {c.usage_limit ?? "∞"}</TableCell>
                    <TableCell>{c.stripe_promo_id ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> Synced</Badge> : <Badge variant="secondary">Not synced</Badge>}</TableCell>
                    <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => resync(c.id)}><RefreshCw className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => toggle(c.id, c.status === "active")}>{c.status === "active" ? "Disable" : "Enable"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New promo code</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH20" /></div>
            <div><Label>Discount %</Label><Input type="number" min={0} max={30} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
              <p className="mt-1 text-xs text-muted-foreground">Maximum 30%.</p></div>
            <div><Label>Usage limit (optional)</Label><Input type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create & sync"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
