import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createPromoCode, updatePromoCode } from "@/lib/promos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  title: string;
  subtitle: string;
  /**
   * Hierarchy depth shown in the create form:
   * - "self" — current user IS the affiliate (legacy; not used now that affiliates are read-only)
   * - "affiliate" — pick from the user's direct affiliates (Manager flow)
   * - "manager+affiliate" — pick Manager → Affiliate (SAM flow)
   * - "sam+manager+affiliate" — pick SAM → Manager → Affiliate (Super Admin flow)
   */
  affiliatePicker?:
  "self" | "affiliate" | "manager+affiliate" | "sam+manager+affiliate" | "descendants" | "all";
  /** Hide create/edit/disable controls — show codes for sharing only. */
  readOnly?: boolean;
}

interface PersonOpt {
  id: string;
  full_name: string | null;
  email: string;
  parent_user_id?: string | null;
  commission_rate?: number | null;
}

export function PromoCodeManager({
  title,
  subtitle,
  affiliatePicker = "affiliate",
  readOnly = false,
}: Props) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const create = useServerFn(createPromoCode);
  const update = useServerFn(updatePromoCode);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discount: 15,
    samId: "",
    managerId: "",
    affiliateId: "",
    campaign: "",
    startsAt: "",
    endsAt: "",
    usageLimit: "",
    limitPerCustomer: "",
    affiliateComm: 10,
  });
  const [editing, setEditing] = useState<null | {
    id: string;
    code: string;
    discount: number;
    usageLimit: string;
    usageCount: number;
    status: "active" | "inactive";
    campaign: string;
    startsAt: string;
    endsAt: string;
    limitPerCustomer: string;
    affiliateId?: string | null;
    affiliateComm?: number;
  }>(null);
  const [campaignFilter, setCampaignFilter] = useState<string>("");

  // Legacy aliases
  const picker =
    affiliatePicker === "descendants"
      ? "manager+affiliate"
      : affiliatePicker === "all"
        ? "sam+manager+affiliate"
        : affiliatePicker;

  const showHierarchy = picker !== "self";

  const showSamPicker = picker === "sam+manager+affiliate";
  const showManagerPicker = picker === "manager+affiliate" || picker === "sam+manager+affiliate";
  const showAffiliatePicker = picker !== "self";

  const canEdit = !readOnly;
  const canEditAll = role === "super_admin";

  // Promo codes
  const { data: codes, isLoading } = useQuery({
    queryKey: ["promo-codes", user?.id, picker],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("promo_codes").select("*").order("created_at", { ascending: false });

      // Enforce strict tree scoping
      if (picker === "self") {
        q = q.eq("affiliate_id", user!.id);
      } else if (picker === "manager+affiliate") {
        // SAM flow: restrict to SAM's downstream affiliates
        const { data: mgrs } = await supabase.from("profiles").select("id").eq("parent_user_id", user!.id);
        const mgrIds = mgrs?.map(m => m.id) || [];
        if (mgrIds.length > 0) {
          const { data: affs } = await supabase.from("profiles").select("id").in("parent_user_id", mgrIds);
          const affIds = affs?.map(a => a.id) || [];
          if (affIds.length > 0) {
            q = q.in("affiliate_id", affIds);
          } else {
            return [];
          }
        } else {
          return [];
        }
      } else if (picker === "affiliate") {
        // Manager flow: restrict to Manager's downstream affiliates
        const { data: affs } = await supabase.from("profiles").select("id").eq("parent_user_id", user!.id);
        const affIds = affs?.map(a => a.id) || [];
        if (affIds.length > 0) {
          q = q.in("affiliate_id", affIds);
        } else {
          return [];
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // SAMs in scope (super_admin only)
  const { data: sams } = useQuery({
    queryKey: ["sam-pick", user?.id],
    enabled: !!user && showSamPicker,
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sam");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,parent_user_id,commission_rate")
        .in("id", ids);
      return (data ?? []) as PersonOpt[];
    },
  });

  // Managers in scope
  const { data: managers } = useQuery({
    queryKey: ["manager-pick", user?.id, picker],
    enabled: !!user && (showManagerPicker || showHierarchy),
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,parent_user_id,commission_rate")
        .in("id", ids);
      return (data ?? []) as PersonOpt[];
    },
  });

  // Affiliates in scope
  const { data: affiliates } = useQuery({
    queryKey: ["affiliate-pick", user?.id, picker],
    enabled: !!user && showAffiliatePicker,
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "affiliate");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,parent_user_id,commission_rate")
        .in("id", ids);
      return (data ?? []) as PersonOpt[];
    },
  });

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

  // Manager dropdown options — for SAM flow, RLS already returns only their managers; for super_admin, narrow by chosen SAM
  const managerOptions = useMemo(() => {
    const base = managers ?? [];
    if (showSamPicker && form.samId) return base.filter((m) => m.parent_user_id === form.samId);
    return base;
  }, [managers, showSamPicker, form.samId]);

  // Affiliates filtered by selected manager
  const filteredAffiliates = useMemo(() => {
    const base = affiliates ?? [];
    if (showManagerPicker) {
      if (!form.managerId) return [];
      return base.filter((a) => a.parent_user_id === form.managerId);
    }
    // Manager flow: only direct children of current user
    return base.filter((a) => a.parent_user_id === user?.id);
  }, [affiliates, form.managerId, showManagerPicker, user?.id]);

  const selectedSam = useMemo(() => (sams ?? []).find(s => s.id === form.samId), [sams, form.samId]);
  const selectedMgr = useMemo(() => (managers ?? []).find(m => m.id === form.managerId), [managers, form.managerId]);

  const samRate = selectedSam?.commission_rate !== undefined && selectedSam?.commission_rate !== null ? selectedSam.commission_rate * 100 : 1;
  const mgrRate = selectedMgr?.commission_rate !== undefined && selectedMgr?.commission_rate !== null ? selectedMgr.commission_rate * 100 : 4;

  // Reset cascading selections when parent changes
  useEffect(() => {
    setForm((f) => ({ ...f, managerId: "", affiliateId: "" }));
  }, [form.samId]);
  useEffect(() => {
    setForm((f) => ({ ...f, affiliateId: "" }));
  }, [form.managerId]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (showAffiliatePicker && !form.affiliateId) throw new Error("Pick an affiliate");

      const affiliateId = showAffiliatePicker ? form.affiliateId : user!.id;

      if (canEditAll && form.affiliateComm && affiliateId) {
        const selectedAff = affMap.get(affiliateId);
        const originalRate = selectedAff?.commission_rate !== undefined && selectedAff?.commission_rate !== null ? selectedAff.commission_rate * 100 : 10;
        if (originalRate !== form.affiliateComm) {
          await supabase.from("profiles").update({ commission_rate: form.affiliateComm / 100 }).eq("id", affiliateId);
        }
      }

      return create({
        data: {
          code: form.code,
          discountPercent: form.discount,
          affiliateId,
          campaignLabel: form.campaign.trim() || undefined,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          limitPerCustomer: form.limitPerCustomer ? Number(form.limitPerCustomer) : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Promo code created");
      setOpen(false);
      setForm({
        code: "",
        discount: 15,
        samId: "",
        managerId: "",
        affiliateId: "",
        campaign: "",
        startsAt: "",
        endsAt: "",
        usageLimit: "",
        limitPerCustomer: "",
        affiliateComm: 10,
      });
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
      return update({
        data: {
          id: editing.id,
          ...(canEditAll && editing.code ? { code: editing.code.toUpperCase() } : {}),
          discountPercent: editing.discount,
          status: editing.status,
          usageLimit: editing.usageLimit === "" ? null : Number(editing.usageLimit),
          campaignLabel: editing.campaign.trim() === "" ? null : editing.campaign.trim(),
          startsAt: editing.startsAt ? new Date(editing.startsAt).toISOString() : null,
          endsAt: editing.endsAt ? new Date(editing.endsAt).toISOString() : null,
          limitPerCustomer: editing.limitPerCustomer === "" ? null : Number(editing.limitPerCustomer),
          ...(canEditAll ? { usageCount: editing.usageCount } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Promo code updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["promo-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelFor = (p?: PersonOpt | null) => (p ? (p.full_name ?? p.email) : "—");
  const toLocalInput = (iso: string | null | undefined) =>
    iso ? new Date(iso).toISOString().slice(0, 16) : "";

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          !readOnly ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New code
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        {(() => {
          const all = codes ?? [];
          const campaignOptions = Array.from(
            new Set(all.map((c) => c.campaign_label).filter((x): x is string => !!x)),
          ).sort();
          const filtered = campaignFilter
            ? all.filter((c) =>
              campaignFilter === "__none__"
                ? !c.campaign_label
                : c.campaign_label === campaignFilter,
            )
            : all;
          const colSpan = showHierarchy ? 10 : 8;
          return (
            <>
              {campaignOptions.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Campaign
                  </Label>
                  <Select
                    value={campaignFilter || "__all__"}
                    onValueChange={(v) => setCampaignFilter(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All campaigns</SelectItem>
                      <SelectItem value="__none__">No campaign</SelectItem>
                      {campaignOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {filtered.length} of {all.length}
                  </span>
                </div>
              )}
              <div className="rounded-xl border border-border/60 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      {showHierarchy && <TableHead>Affiliate</TableHead>}
                      <TableHead>Campaign</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Uses</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={colSpan}
                          className="text-center py-8 text-muted-foreground"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : !filtered.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={colSpan}
                          className="text-center py-8 text-muted-foreground"
                        >
                          {all.length
                            ? "No codes match this campaign."
                            : readOnly
                              ? "No promo codes assigned to you yet."
                              : "No promo codes yet. Create one to get started."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((c) => {
                        const aff = c.affiliate_id ? affMap.get(c.affiliate_id) : null;
                        const mgr = aff?.parent_user_id ? mgrMap.get(aff.parent_user_id) : null;
                        const window =
                          c.starts_at || c.ends_at
                            ? `${c.starts_at ? new Date(c.starts_at).toLocaleDateString() : "—"} → ${c.ends_at ? new Date(c.ends_at).toLocaleDateString() : "∞"}`
                            : "Always";
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono font-semibold">
                              {c.code}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-1 h-6 w-6 p-0"
                                onClick={() => {
                                  navigator.clipboard.writeText(c.code);
                                  toast.success("Copied");
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TableCell>
                            {showHierarchy && <TableCell>{labelFor(aff) || "—"}</TableCell>}
                            <TableCell>
                              {c.campaign_label ? (
                                <Badge variant="outline">{c.campaign_label}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>{Number(c.discount_percent)}%</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : "∞"}
                            </TableCell>
                            <TableCell>
                              {c.usage_count} / {c.usage_limit ?? "∞"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={c.status === "active" ? "default" : "secondary"}>
                                {c.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              {canEdit && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setEditing({
                                        id: c.id,
                                        code: c.code,
                                        discount: Number(c.discount_percent),
                                        usageLimit: c.usage_limit?.toString() ?? "",
                                        usageCount: c.usage_count,
                                        status: c.status as "active" | "inactive",
                                        campaign: c.campaign_label ?? "",
                                        startsAt: toLocalInput(c.starts_at),
                                        endsAt: toLocalInput(c.ends_at),
                                        limitPerCustomer: c.limit_per_customer?.toString() ?? "",
                                        affiliateId: c.affiliate_id,
                                        affiliateComm: (aff?.commission_rate ?? 0.10) * 100,
                                      })
                                    }
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      toggleStatus.mutate({
                                        id: c.id,
                                        status: c.status === "active" ? "inactive" : "active",
                                      })
                                    }
                                  >
                                    {c.status === "active" ? "Disable" : "Enable"}
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          );
        })()}
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New promo code</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>PROMO CODE</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SPECIAL-20"
                style={{ textTransform: "uppercase", fontFamily: "monospace" }}
              />
            </div>
            <div>
              <Label>CAMPAIGN</Label>
              <Input
                value={form.campaign}
                onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                placeholder="e.g. TikTok Launch"
                maxLength={60}
              />
              <div className="text-[11px] text-muted-foreground mt-1">Enter the campaign this code belongs to</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>START DATE</Label>
                <Input
                  type="date"
                  value={form.startsAt?.slice(0, 10) || ""}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value + "T00:00" })}
                />
              </div>
              <div>
                <Label>END DATE</Label>
                <Input
                  type="date"
                  value={form.endsAt?.slice(0, 10) || ""}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value + "T23:59" })}
                />
              </div>
            </div>
            <div>
              <Label>DISCOUNT %</Label>
              <Input
                type="number"
                min={1}
                max={picker === "manager+affiliate" ? 29 : 30}
                value={form.discount}
                disabled={role === "affiliate"}
                onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })}
              />
              {picker === "manager+affiliate" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Max 29% (SAM's 1% already allocated from 30% cap)
                </p>
              )}
            </div>

            {showSamPicker && (
              <>
                <div>
                  <Label>SELECT SAM</Label>
                  <Select value={form.samId} onValueChange={(v) => setForm({ ...form, samId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select SAM…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sams ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {labelFor(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.samId && (
                  <div>
                    <Label>SAM COMMISSION %</Label>
                    <Input readOnly disabled value={samRate} className="bg-muted cursor-not-allowed" />
                  </div>
                )}
              </>
            )}

            {showManagerPicker && (
              <>
                <div>
                  <Label>SELECT MANAGER</Label>
                  <Select
                    value={form.managerId}
                    onValueChange={(v) => setForm({ ...form, managerId: v })}
                    disabled={showSamPicker && !form.samId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          showSamPicker && !form.samId ? "Select a SAM first" : "Select manager…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {managerOptions.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted-foreground">
                          No managers in scope.
                        </div>
                      ) : (
                        managerOptions.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {labelFor(m)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {form.managerId && (
                  <div>
                    <Label>MANAGER COMMISSION %</Label>
                    <Input readOnly disabled value={mgrRate} className="bg-muted cursor-not-allowed" />
                  </div>
                )}
              </>
            )}

            {showAffiliatePicker && (
              <>
                <div>
                  <Label>ASSIGN TO AFFILIATE</Label>
                  <Select
                    value={form.affiliateId}
                    onValueChange={(v) => setForm({ ...form, affiliateId: v, affiliateComm: (affMap.get(v)?.commission_rate ?? 0.10) * 100 })}
                    disabled={showManagerPicker && !form.managerId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          showManagerPicker && !form.managerId
                            ? "Select a manager first"
                            : "Select affiliate…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAffiliates.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted-foreground">
                          No affiliates available.
                        </div>
                      ) : (
                        filteredAffiliates.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {labelFor(a)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {form.affiliateId && (
                  <div>
                    <Label>AFFILIATE COMMISSION %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={form.affiliateComm}
                      onChange={(e) => setForm({ ...form, affiliateComm: Number(e.target.value) })}
                    />
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>USAGE LIMIT <span className="text-muted-foreground font-normal lowercase">(optional)</span></Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                />
              </div>
              <div>
                <Label>LIMIT PER CUSTOMER <span className="text-muted-foreground font-normal lowercase">(optional)</span></Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={form.limitPerCustomer}
                  onChange={(e) => setForm({ ...form, limitPerCustomer: e.target.value })}
                />
              </div>
            </div>

            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-primary mt-2">
              <strong>Max discount (subscriber + affiliate + SAM/Mgr):</strong> {showAffiliatePicker ? "30%" : "30%"}
              <div className="mt-1">Current total: {(form.discount + (form.samId ? samRate : 0) + (form.managerId ? mgrRate : 0) + form.affiliateComm).toFixed(1)}%. Must be ≤ 30%.</div>
            </div>

            <div className="p-3 bg-green-50/80 rounded-lg text-xs text-emerald-800 mt-2">
              <strong>Note:</strong> Commission is calculated on the <strong>discounted amount</strong>, not the full price. Code is case-insensitive.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending ||
                !form.code ||
                (showAffiliatePicker && !form.affiliateId) ||
                (form.discount + (form.samId ? samRate : 0) + (form.managerId ? mgrRate : 0) + form.affiliateComm > 30)
              }
            >
              {createMut.isPending ? "Creating…" : "Create & sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit promo code</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>PROMO CODE</Label>
                <Input
                  value={editing.code}
                  disabled={!canEditAll}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SPECIAL-20"
                  style={{ textTransform: "uppercase", fontFamily: "monospace" }}
                />
                {!canEditAll && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Only super admin can rename a code.
                  </p>
                )}
              </div>
              <div>
                <Label>CAMPAIGN</Label>
                <Input
                  value={editing.campaign}
                  maxLength={60}
                  placeholder="e.g. TikTok Launch"
                  onChange={(e) => setEditing({ ...editing, campaign: e.target.value })}
                />
                <div className="text-[11px] text-muted-foreground mt-1">The campaign this code belongs to</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>START DATE</Label>
                  <Input
                    type="date"
                    value={editing.startsAt?.slice(0, 10) || ""}
                    onChange={(e) => setEditing({ ...editing, startsAt: e.target.value + "T00:00" })}
                  />
                </div>
                <div>
                  <Label>END DATE</Label>
                  <Input
                    type="date"
                    value={editing.endsAt?.slice(0, 10) || ""}
                    onChange={(e) => setEditing({ ...editing, endsAt: e.target.value + "T23:59" })}
                  />
                </div>
              </div>
              <div>
                <Label>DISCOUNT %</Label>
                <Input
                  type="number"
                  min={1}
                  max={picker === "manager+affiliate" ? 29 : 30}
                  value={editing.discount}
                  disabled={role === "affiliate"}
                  onChange={(e) => setEditing({ ...editing, discount: Number(e.target.value) })}
                />
                {picker === "manager+affiliate" && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Max 29% (SAM's 1% already allocated from 30% cap)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ASSIGNED AFFILIATE</Label>
                  <Select value={editing.affiliateId || ""} disabled>
                    <SelectTrigger className="bg-muted text-muted-foreground">
                      <SelectValue placeholder="No Affiliate" />
                    </SelectTrigger>
                    <SelectContent>
                      {editing.affiliateId && (
                        <SelectItem value={editing.affiliateId}>
                          {labelFor(affMap.get(editing.affiliateId))}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>AFFILIATE COMMISSION %</Label>
                  <Input
                    type="number"
                    value={editing.affiliateComm}
                    disabled
                    readOnly
                    className="bg-muted cursor-not-allowed text-muted-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>USAGE LIMIT <span className="text-muted-foreground font-normal lowercase">(optional)</span></Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={editing.usageLimit}
                    onChange={(e) => setEditing({ ...editing, usageLimit: e.target.value })}
                  />
                </div>
                <div>
                  <Label>LIMIT PER CUSTOMER <span className="text-muted-foreground font-normal lowercase">(optional)</span></Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={editing.limitPerCustomer}
                    onChange={(e) => setEditing({ ...editing, limitPerCustomer: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>USAGE COUNT</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.usageCount}
                    disabled={!canEditAll}
                    onChange={(e) => setEditing({ ...editing, usageCount: Number(e.target.value) })}
                  />
                  {!canEditAll && (
                    <p className="mt-1 text-xs text-muted-foreground">Super admin only.</p>
                  )}
                </div>
                <div>
                  <Label>STATUS</Label>
                  <Select
                    value={editing.status}
                    onValueChange={(v) =>
                      setEditing({ ...editing, status: v as "active" | "inactive" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-[11px] text-muted-foreground mt-1">Set to Inactive to disable this promo code</div>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-primary mt-2">
                <strong>Max discount (subscriber + affiliate + SAM/Mgr):</strong> 30%
              </div>
              <div className="p-3 bg-green-50/80 rounded-lg text-xs text-emerald-800 mt-2">
                <strong>Note:</strong> Commission is calculated on the <strong>discounted amount</strong>, not the full price. Code is case-insensitive.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editMut.mutate()} disabled={editMut.isPending}>
              {editMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
