import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createSubordinate, updateSubordinate } from "@/lib/users.functions";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/sams")({
  component: AdminSamsRoute,
});

function AdminSamsRoute() {
  const qc = useQueryClient();
  const createFn = useServerFn(createSubordinate);
  const updateFn = useServerFn(updateSubordinate);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    id: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    commissionRate: 1,
    status: "active",
  });

  const { data: sams, isLoading } = useQuery({
    queryKey: ["admin-sams"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sam");

      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data } = await supabase
        .from("sam_analytics_view" as any)
        .select("*")
        .in("id", userIds);

      return data ?? [];
    },
  });

  const handleAddSubmit = async () => {
    try {
      setSubmitting(true);
      await createFn({
        data: {
          role: "sam",
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
          fullName: `${form.firstName} ${form.lastName}`.trim(),
          commissionRate: form.commissionRate / 100, // DB stores as decimal (e.g. 0.01 for 1%)
          phoneNumber: form.phone
        }
      });
      toast.success("SAM created successfully");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-sams"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create SAM");
    } finally {
      setSubmitting(false);
    }
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
          status: form.status as any
        }
      });
      toast.success("SAM updated successfully");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-sams"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update SAM");
    } finally {
      setSubmitting(false);
    }
  };

  const openAdd = () => {
    setForm({ id: "", firstName: "", lastName: "", email: "", password: "", phone: "", commissionRate: 1, status: "active" });
    setAddOpen(true);
  };

  const openEdit = (sam: any) => {
    const metaStr = sam.metadata;
    const meta = (typeof metaStr === 'string' ? JSON.parse(metaStr || "{}") : metaStr) || {};
    const parts = (sam.full_name || "").split(" ");
    setForm({
      id: sam.id,
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
      email: sam.email || "",
      password: "",
      phone: meta.phone_number || "",
      commissionRate: (sam.commission_rate || 0.01) * 100,
      status: sam.status || "active"
    });
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">My SAMs</h1>
        <p className="text-[13px] text-muted-foreground mb-6">Manage all Super Admin Managers</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Super Admin Managers</CardTitle>
          <Button onClick={openAdd}>+ Add SAM</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Commission %</TableHead>
                <TableHead>Managers</TableHead>
                <TableHead>Total Affiliates</TableHead>
                <TableHead>Total Subscribers</TableHead>
                <TableHead>Total Earned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sams?.map((sam: any) => (
                <TableRow key={sam.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
                        {(sam.full_name || "U").substring(0, 2).toUpperCase()}
                      </div>
                      {sam.full_name || "Unknown"}
                    </div>
                  </TableCell>
                  <TableCell>{sam.email}</TableCell>
                  <TableCell><strong>{sam.commission_rate ? `${(sam.commission_rate * 100).toFixed(1)}%` : "1%"}</strong></TableCell>
                  <TableCell>{sam.active_managers || 0}</TableCell>
                  <TableCell>{sam.total_affiliates || 0}</TableCell>
                  <TableCell>{sam.total_subscribers || 0}</TableCell>
                  <TableCell>${((sam.total_earned_cents || 0) / 100).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={sam.status === "active" ? "default" : "secondary"}>
                      {sam.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(sam)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sams?.length === 0 && !isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No SAMs found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add SAM Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Super Admin Manager</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input placeholder="First name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input placeholder="Last name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="sam@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="Leave blank to keep same" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Cell Phone Number</Label>
              <Input type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Commission %</Label>
              <Input type="number" min="0" max="30" step="0.5" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground">SAM commission on discounted price. Max: 30%.</p>
            </div>
            <div className="col-span-2 p-3 bg-[#E0E6F2] bg-opacity-[0.3] rounded-lg">
              <p className="text-xs text-[#1e3a8a]"><strong>Reminder:</strong> This commission is deducted from revenue before Manager and Affiliate commissions. Total across all tiers cannot exceed 30%.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSubmit} disabled={submitting}>Create SAM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit SAM Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Super Admin Manager</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="Leave blank to keep same" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Cell Phone Number</Label>
              <Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Commission %</Label>
              <Input type="number" min="0" max="30" step="0.5" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground">SAM commission on discounted price. Max: 30%.</p>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 p-3 bg-[#FFFBEB] bg-opacity-[0.5] rounded-lg">
              <p className="text-xs text-[#92400E]"><strong>Impact:</strong> Changing the commission rate affects future payouts only. Existing cleared payouts are not recalculated.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={submitting}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
