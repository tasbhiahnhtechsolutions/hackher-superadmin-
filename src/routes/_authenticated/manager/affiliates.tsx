import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createSubordinate, updateSubordinate } from "@/lib/users.functions";
import { useAuth } from "@/lib/auth";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Minus, Search, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager/affiliates")({
  component: ManagerAffiliatesRoute,
});

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── form state type ──
type FormState = {
  id: string; firstName: string; lastName: string; email: string;
  password: string; phone: string; socialHandles: string[];
  contractStart: string; contractEnd: string;
  commissionRate: number; paymentMethod: string; status: string;
};

const emptyForm = (): FormState => ({
  id: "", firstName: "", lastName: "", email: "", password: "", phone: "",
  socialHandles: [""],
  contractStart: new Date().toISOString().split("T")[0],
  contractEnd: "",
  commissionRate: 10, paymentMethod: "", status: "active",
});

function ManagerAffiliatesRoute() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const createFn = useServerFn(createSubordinate);
  const updateFn = useServerFn(updateSubordinate);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── form state lives here, NOT inside a nested component ──
  const [form, setForm] = useState<FormState>(emptyForm());

  // ── filter state ──
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: affiliates, isLoading } = useQuery({
    queryKey: ["manager-affiliates", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("affiliate_analytics_view" as any)
        .select("*")
        .eq("manager_id", user?.id || "");
      return (data as any[]) ?? [];
    },
  });

  // ── filtered list ──
  const filtered = useMemo(() => {
    if (!affiliates) return [];
    return affiliates.filter((aff: any) => {
      const name = (aff.full_name || "").toLowerCase();
      const email = (aff.email || "").toLowerCase();
      const q = search.toLowerCase();
      const matchSearch = !q || name.includes(q) || email.includes(q);
      const matchStatus = statusFilter === "all" || (aff.status || "active") === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [affiliates, search, statusFilter]);

  const resetFilters = () => { setSearch(""); setStatusFilter("all"); };

  // ── social handle helpers ──
  const handleAddSocial = () => setForm(f => ({ ...f, socialHandles: [...f.socialHandles, ""] }));
  const handleRemoveSocial = (idx: number) => {
    const h = [...form.socialHandles]; h.splice(idx, 1);
    setForm(f => ({ ...f, socialHandles: h }));
  };
  const handleSocialChange = (idx: number, val: string) => {
    const h = [...form.socialHandles]; h[idx] = val;
    setForm(f => ({ ...f, socialHandles: h }));
  };

  // ── submit handlers ──
  const handleAddSubmit = async () => {
    if (!form.firstName.trim()) { toast.error("First name is required"); return; }
    if (!form.lastName.trim()) { toast.error("Last name is required"); return; }
    if (!form.email.trim()) { toast.error("Email is required"); return; }
    if (!form.contractStart) { toast.error("Contract start date is required"); return; }
    try {
      setSubmitting(true);
      await createFn({
        data: {
          role: "affiliate",
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
          fullName: `${form.firstName} ${form.lastName}`.trim(),
          commissionRate: form.commissionRate / 100,
          parentUserId: user?.id,
          phoneNumber: form.phone,
          socialHandles: form.socialHandles.filter(h => h.trim() !== ""),
          contractStart: form.contractStart,
          contractEnd: form.contractEnd || undefined,
          paymentMethod: form.paymentMethod,
        },
      });
      toast.success("Affiliate created successfully");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["manager-affiliates"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create affiliate");
    } finally { setSubmitting(false); }
  };

  const handleEditSubmit = async () => {
    try {
      setSubmitting(true);
      await updateFn({
        data: {
          userId: form.id,
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
          fullName: `${form.firstName} ${form.lastName}`.trim(),
          commissionRate: form.commissionRate / 100,
          phoneNumber: form.phone,
          socialHandles: form.socialHandles.filter(h => h.trim() !== ""),
          contractStart: form.contractStart,
          contractEnd: form.contractEnd || undefined,
          paymentMethod: form.paymentMethod,
          status: form.status as any,
        },
      });
      toast.success("Affiliate updated successfully");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["manager-affiliates"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update affiliate");
    } finally { setSubmitting(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      setSubmitting(true);
      await updateFn({ data: { userId: deactivateTarget.id, status: "suspended" } });
      toast.success(`${deactivateTarget.full_name || "Affiliate"} deactivated`);
      setDeactivateTarget(null);
      qc.invalidateQueries({ queryKey: ["manager-affiliates"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to deactivate");
    } finally { setSubmitting(false); }
  };

  const openAdd = () => { setForm(emptyForm()); setAddOpen(true); };
  const openEdit = (aff: any) => {
    const meta = (typeof aff.metadata === "string" ? JSON.parse(aff.metadata || "{}") : aff.metadata) || {};
    const parts = (aff.full_name || "").split(" ");
    setForm({
      id: aff.id,
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
      email: aff.email || "",
      password: "",
      phone: meta.phone_number || "",
      socialHandles: meta.social_handles?.length ? meta.social_handles : [""],
      contractStart: meta.contract_start || "",
      contractEnd: meta.contract_end || "",
      commissionRate: (aff.commission_rate || 0.10) * 100,
      paymentMethod: meta.payment_method || "",
      status: aff.status || "active",
    });
    setEditOpen(true);
  };

  // ── shared modal fields (inline JSX — no nested component to avoid remount) ──
  const modalFields = (isEdit: boolean) => (
    <div className="grid grid-cols-2 gap-4 py-4">
      <div className="space-y-2">
        <Label>First Name {!isEdit && <span className="text-red-500">*</span>}</Label>
        <Input maxLength={50} placeholder="First name" value={form.firstName}
          onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Last Name {!isEdit && <span className="text-red-500">*</span>}</Label>
        <Input maxLength={50} placeholder="Last name" value={form.lastName}
          onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Email {!isEdit && <span className="text-red-500">*</span>}</Label>
        <Input type="email" placeholder="affiliate@example.com" value={form.email}
          onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <Input type="password" placeholder={isEdit ? "Leave blank to keep same" : "Auto-generated if blank"} value={form.password}
          onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} />
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Cell Phone Number</Label>
        <Input type="tel" placeholder="(555) 123-4567" value={form.phone}
          onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} />
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Social Handles</Label>
        <div className="flex flex-col space-y-2">
          {form.socialHandles.map((h, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input type="url" placeholder="https://instagram.com/handle" value={h}
                onChange={e => handleSocialChange(idx, e.target.value)} />
              <Button type="button" variant="outline" size="icon" onClick={handleAddSocial}><Plus className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" size="icon" onClick={() => handleRemoveSocial(idx)} disabled={form.socialHandles.length === 1}><Minus className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Contract Start Date {!isEdit && <span className="text-red-500">*</span>}</Label>
        <Input type="date" value={form.contractStart}
          onChange={e => setForm(prev => ({ ...prev, contractStart: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Contract Expiration Date</Label>
        <Input type="date" value={form.contractEnd}
          onChange={e => setForm(prev => ({ ...prev, contractEnd: e.target.value }))} />
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Commission %</Label>
        <Input type="number" min="0" max="30" value={form.commissionRate}
          onChange={e => setForm(prev => ({ ...prev, commissionRate: Number(e.target.value) }))} />
        <p className="text-[11px] text-muted-foreground">Default 10%. System cap is 30%.</p>
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Preferred Payment Method</Label>
        <Textarea placeholder="e.g. Direct deposit, Zelle, Wire - include relevant details"
          value={form.paymentMethod}
          onChange={e => setForm(prev => ({ ...prev, paymentMethod: e.target.value }))} />
      </div>
      {isEdit && (
        <div className="col-span-2 space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(prev => ({ ...prev, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="col-span-2 p-3 bg-amber-50 rounded-lg">
        <p className="text-xs text-amber-800">
          <strong>Note:</strong> Affiliates do not sign up themselves. You create their account and share login credentials.
          {isEdit && " To reassign to another manager, contact your SAM."}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Affiliates</h1>
        <p className="text-[13px] text-muted-foreground mb-6">Manage all affiliates under your network</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My Affiliates</CardTitle>
          <Button onClick={openAdd}>+ Add Affiliate</Button>
        </CardHeader>

        {/* Filter Bar */}
        <div className="flex flex-wrap gap-2 px-6 py-3 border-t border-b bg-muted/30 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search affiliates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={resetFilters}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>

        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Commission %</TableHead>
                  <TableHead>Promo Codes</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Total Commission</TableHead>
                  <TableHead>Contract Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((aff: any) => {
                  const meta = (typeof aff.metadata === "string" ? JSON.parse(aff.metadata || "{}") : aff.metadata) || {};
                  const contractEnd = meta.contract_end ? new Date(meta.contract_end) : null;
                  const daysLeft = contractEnd ? Math.ceil((contractEnd.getTime() - Date.now()) / 86400000) : null;
                  const isActive = (aff.status || "active") === "active";
                  return (
                    <TableRow key={aff.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-xs">
                            {(aff.full_name || "U").substring(0, 2).toUpperCase()}
                          </div>
                          {aff.full_name || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell>{aff.commission_rate ? `${(aff.commission_rate * 100).toFixed(0)}%` : "10%"}</TableCell>
                      <TableCell>{aff.active_promo_codes || 0}</TableCell>
                      <TableCell>{aff.active_subscribers || 0}</TableCell>
                      <TableCell>{fmt(aff.total_earned_cents || 0)}</TableCell>
                      <TableCell>
                        {contractEnd ? (
                          <div className="flex items-center gap-1.5">
                            {contractEnd.toLocaleDateString()}
                            {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 &&
                              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">Expiring</Badge>}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isActive ? "default" : "secondary"}>{aff.status || "active"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(aff)}>Edit</Button>
                          {isActive && (
                            <Button variant="outline" size="sm"
                              className="text-red-500 border-red-200 hover:bg-red-50"
                              onClick={() => setDeactivateTarget(aff)}>
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {affiliates?.length === 0 ? "No affiliates found." : "No results match your filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Affiliate</DialogTitle></DialogHeader>
          {modalFields(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSubmit} disabled={submitting}>Create Affiliate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Affiliate</DialogTitle></DialogHeader>
          {modalFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={submitting}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={open => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Affiliate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set <strong>{deactivateTarget?.full_name || "this affiliate"}</strong> to Inactive.
              All historical data is preserved. This can be reversed via Edit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-red-500 hover:bg-red-600 text-white" disabled={submitting}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
