import { useState, useMemo } from "react";
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

interface PersonOpt { id: string; full_name: string | null; email: string; parent_user_id?: string | null }

export function PromoCodeManager({ title, subtitle, affiliatePicker = "self" }: Props) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const create = useServerFn(createPromoCode);
  const update = useServerFn(updatePromoCode);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", discount: 15, managerId: "", affiliateId: "", campaign: "" });
  const [editing, setEditing] = useState<null | { id: string; code: string; discount: number; usageLimit: string; usageCount: number; status: "active" | "inactive"; campaign: string }>(null);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const canEdit = role === "super_admin" || role === "sam";
  const canEditAll = role === "super_admin";

  const showHierarchy = affiliatePicker !== "self";

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

  // Managers in the current scope (RLS filters to descendants for SAM, all for super)
  const { data: managers } = useQuery({
    queryKey: ["manager-pick", user?.id, affiliatePicker],
    enabled: !!user && showHierarchy,
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id,full_name,email,parent_user_id").in("id", ids);
      return (data ?? []) as PersonOpt[];
    },
  });

  // All affiliates in scope (used both for the picker and for table labels)
  const { data: affiliates } = useQuery({
    queryKey: ["affiliate-pick", user?.id, affiliatePicker],
    enabled: !!user && showHierarchy,
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "affiliate");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id,full_name,email,parent_user_id").in("id", ids);
      return (data ?? []) as PersonOpt[];
    },
  });

  // Lookup maps for fast labeling
  const affMap = useMemo(() => {
    const m = new Map<string, PersonOpt>();
    (affiliates ?? []).forEach((a) => m.set(a.id, a));
    return m;
  }, [affiliates]);
  const mgrMap = useMemo(() => {
    const m = new Map<string, PersonOpt>();
    (managers ?? []).forEach((mg) => m.set(mg.id, mg));
    return m;
  }, [managers]);

  // Affiliates filtered by selected manager
  const filteredAffiliates = useMemo(() => {
    if (!form.managerId) return [];
    return (affiliates ?? []).filter((a) => a.parent_user_id === form.managerId);
  }, [affiliates, form.managerId]);

  const createMut = useMutation({
    mutationFn: async () => {
      return create({ data: {
        code: form.code,
        discountPercent: form.discount,
        affiliateId: showHierarchy ? (form.affiliateId || undefined) : undefined,
        campaignLabel: form.campaign.trim() || undefined,
      }});
    },
    onSuccess: () => {
      toast.success("Promo code created");
      setOpen(false);
      setForm({ code: "", discount: 15, managerId: "", affiliateId: "", campaign: "" });
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

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No promo selected");
      return update({ data: {
        id: editing.id,
        ...(canEditAll && editing.code ? { code: editing.code.toUpperCase() } : {}),
        discountPercent: editing.discount,
        status: editing.status,
        usageLimit: editing.usageLimit === "" ? null : Number(editing.usageLimit),
        campaignLabel: editing.campaign.trim() === "" ? null : editing.campaign.trim(),
        ...(canEditAll ? { usageCount: editing.usageCount } : {}),
      }});
    },
    onSuccess: () => {
      toast.success("Promo code updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["promo-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelFor = (p?: PersonOpt | null) => p ? (p.full_name ?? p.email) : "—";

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
              {showHierarchy && <><TableHead>Affiliate</TableHead><TableHead>Manager</TableHead></>}
              <TableHead>Uses</TableHead><TableHead>Stripe</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={showHierarchy ? 8 : 6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : !codes?.length ? <TableRow><TableCell colSpan={showHierarchy ? 8 : 6} className="text-center py-8 text-muted-foreground">No promo codes yet. Create one to get started.</TableCell></TableRow>
                : codes.map((c) => {
                  const aff = c.affiliate_id ? affMap.get(c.affiliate_id) : null;
                  const mgr = aff?.parent_user_id ? mgrMap.get(aff.parent_user_id) : null;
                  return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}
                      <Button size="sm" variant="ghost" className="ml-1 h-6 w-6 p-0"
                        onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied"); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                    <TableCell>{Number(c.discount_percent)}%</TableCell>
                    {showHierarchy && <>
                      <TableCell>{labelFor(aff)}</TableCell>
                      <TableCell>{labelFor(mgr)}</TableCell>
                    </>}
                    <TableCell>{c.usage_count} / {c.usage_limit ?? "∞"}</TableCell>
                    <TableCell>{c.stripe_promo_id ? <Badge variant="outline">Synced</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                    <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-2">
                      {canEdit && (
                        <Button size="sm" variant="outline"
                          onClick={() => setEditing({
                            id: c.id,
                            code: c.code,
                            discount: Number(c.discount_percent),
                            usageLimit: c.usage_limit?.toString() ?? "",
                            usageCount: c.usage_count,
                            status: c.status as "active" | "inactive",
                          })}>
                          Edit
                        </Button>
                      )}
                      <Button size="sm" variant="outline"
                        onClick={() => toggleStatus.mutate({ id: c.id, status: c.status === "active" ? "inactive" : "active" })}>
                        {c.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
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
            {showHierarchy && (
              <>
                <div>
                  <Label>Manager</Label>
                  <Select
                    value={form.managerId}
                    onValueChange={(v) => setForm({ ...form, managerId: v, affiliateId: "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select manager…" /></SelectTrigger>
                    <SelectContent>
                      {(managers ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{labelFor(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">Pick a manager to see their affiliates.</p>
                </div>
                <div>
                  <Label>Affiliate</Label>
                  <Select
                    value={form.affiliateId}
                    onValueChange={(v) => setForm({ ...form, affiliateId: v })}
                    disabled={!form.managerId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.managerId ? "Select affiliate…" : "Select a manager first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAffiliates.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted-foreground">No affiliates under this manager.</div>
                      ) : filteredAffiliates.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{labelFor(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || (showHierarchy && !form.affiliateId) || !form.code}
            >
              {createMut.isPending ? "Creating…" : "Create & sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit promo code</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Code</Label>
                <Input value={editing.code} disabled={!canEditAll}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
                {!canEditAll && <p className="mt-1 text-xs text-muted-foreground">Only super admin can rename a code.</p>}
              </div>
              <div>
                <Label>Discount %</Label>
                <Input type="number" min={1} max={15} value={editing.discount}
                  onChange={(e) => setEditing({ ...editing, discount: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Usage limit</Label>
                  <Input type="number" min={1} placeholder="∞" value={editing.usageLimit}
                    onChange={(e) => setEditing({ ...editing, usageLimit: e.target.value })} />
                </div>
                <div>
                  <Label>Usage count</Label>
                  <Input type="number" min={0} value={editing.usageCount} disabled={!canEditAll}
                    onChange={(e) => setEditing({ ...editing, usageCount: Number(e.target.value) })} />
                  {!canEditAll && <p className="mt-1 text-xs text-muted-foreground">Super admin only.</p>}
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editMut.mutate()} disabled={editMut.isPending}>
              {editMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
