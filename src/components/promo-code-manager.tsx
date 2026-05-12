import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createPromoCode, updatePromoCode } from "@/lib/promos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  title: string;
  subtitle: string;
  // who can be set as the owning affiliate from the form. "self" = current user only.
  affiliatePicker?: "self" | "descendants" | "all";
}

interface AffiliateOpt { id: string; full_name: string | null; email: string }

export function PromoCodeManager({ title, subtitle, affiliatePicker = "self" }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const create = useServerFn(createPromoCode);
  const update = useServerFn(updatePromoCode);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", discount: 15, affiliateId: "" });

  // List promo codes — RLS already filters: affiliate sees own, SAM sees descendants, super sees all
  const { data: codes, isLoading } = useQuery({
    queryKey: ["promo-codes", user?.id, affiliatePicker],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
      if (affiliatePicker === "self") q = q.eq("affiliate_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Affiliate picker options for SAM/Super (descendants only)
  const { data: affiliates } = useQuery({
    queryKey: ["affiliate-pick", user?.id, affiliatePicker],
    enabled: !!user && affiliatePicker !== "self",
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "affiliate");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      // RLS on profiles already restricts SAM to descendants
      const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      return (data ?? []) as AffiliateOpt[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      return create({ data: {
        code: form.code,
        discountPercent: form.discount,
        affiliateId: affiliatePicker === "self" ? undefined : (form.affiliateId || undefined),
      }});
    },
    onSuccess: () => {
      toast.success("Promo code created");
      setOpen(false);
      setForm({ code: "", discount: 15, affiliateId: "" });
      qc.invalidateQueries({ queryKey: ["promo-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) =>
      update({ data: { id, status } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["promo-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New code</Button>}
      />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Discount</TableHead>
              <TableHead>Uses</TableHead><TableHead>Stripe</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : !codes?.length ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No promo codes yet. Create one to get started.</TableCell></TableRow>
                : codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}
                      <Button size="sm" variant="ghost" className="ml-1 h-6 w-6 p-0"
                        onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied"); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                    <TableCell>{Number(c.discount_percent)}%</TableCell>
                    <TableCell>{c.usage_count} / {c.usage_limit ?? "∞"}</TableCell>
                    <TableCell>{c.stripe_promo_id ? <Badge variant="outline">Synced</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                    <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline"
                        onClick={() => toggleStatus.mutate({ id: c.id, status: c.status === "active" ? "inactive" : "active" })}>
                        {c.status === "active" ? "Disable" : "Enable"}
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
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. KEVINTIKTOK" />
              <p className="mt-1 text-xs text-muted-foreground">3–30 letters/numbers only. Make it memorable.</p>
            </div>
            <div>
              <Label>Customer discount %</Label>
              <Input type="number" min={1} max={15} value={form.discount}
                onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} />
              <p className="mt-1 text-xs text-muted-foreground">Maximum 15% (30% rule: discount + commissions ≤ 30%).</p>
            </div>
            {affiliatePicker !== "self" && (
              <div>
                <Label>Assign to affiliate</Label>
                <Select value={form.affiliateId} onValueChange={(v) => setForm({ ...form, affiliateId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select affiliate…" /></SelectTrigger>
                  <SelectContent>
                    {(affiliates ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name ?? a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? "Creating…" : "Create & sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
