import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { syncPromoToStripe } from "@/lib/stripe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/affiliate/promo-codes")({
  component: AffiliatePromoPage,
});

function AffiliatePromoPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const sync = useServerFn(syncPromoToStripe);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(10);

  const { data: codes, isLoading } = useQuery({
    queryKey: ["my-promos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("promo_codes").select("*").eq("affiliate_id", user!.id).order("created_at", { ascending: false });
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
        affiliate_id: user!.id,
        status: "active",
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success("Promo code created. Syncing…");
      setOpen(false); setCode(""); setDiscount(10);
      qc.invalidateQueries({ queryKey: ["my-promos"] });
      try {
        const r = await sync({ data: { promoId: id } });
        if (r.synced) toast.success("Synced to Stripe");
      } catch (e: unknown) { toast.error((e as Error).message); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="My Promo Codes"
        subtitle="Create discount codes — max 30% — and earn commissions on conversions."
        action={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New code</Button>}
      />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Uses</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Share</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : !codes?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No codes yet — create your first.</TableCell></TableRow>
                : codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                    <TableCell>{c.discount_percent}%</TableCell>
                    <TableCell>{c.usage_count}</TableCell>
                    <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
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
            <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MYCODE10" /></div>
            <div><Label>Discount %</Label><Input type="number" min={0} max={30} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
              <p className="mt-1 text-xs text-muted-foreground">Maximum 30% — also caps your commission.</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
