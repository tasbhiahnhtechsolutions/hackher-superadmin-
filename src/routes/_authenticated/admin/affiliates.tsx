import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/affiliates")({
    component: AdminAffiliatesRoute,
});

function AdminAffiliatesRoute() {
    const qc = useQueryClient();
    const { user } = useAuth();
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
        assignedManager: "",
        socialHandles: [""] as string[],
        contractStart: "2025-08-01",
        contractEnd: "2026-08-01",
        commissionRate: 10,
        paymentMethod: "",
        status: "active",
    });

    const { data: managers } = useQuery({
        queryKey: ["admin-managers-list"],
        queryFn: async () => {
            const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
            if (!roles?.length) return [];
            const userIds = roles.map((r) => r.user_id);
            const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
            return data ?? [];
        },
    });

    const { data: affiliates, isLoading } = useQuery({
        queryKey: ["admin-affiliates"],
        queryFn: async () => {
            const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "affiliate");
            if (!roles?.length) return [];
            const userIds = roles.map((r) => r.user_id);
            const { data } = await supabase.from("affiliate_analytics_view" as any).select("*").in("id", userIds);
            return data ?? [];
        },
    });

    const handleAddSocial = () => setForm(f => ({ ...f, socialHandles: [...f.socialHandles, ""] }));
    const handleRemoveSocial = (index: number) => {
        const newHandles = [...form.socialHandles];
        newHandles.splice(index, 1);
        setForm(f => ({ ...f, socialHandles: newHandles }));
    };
    const handleSocialChange = (index: number, val: string) => {
        const newHandles = [...form.socialHandles];
        newHandles[index] = val;
        setForm(f => ({ ...f, socialHandles: newHandles }));
    };

    const handleAddSubmit = async () => {
        try {
            setSubmitting(true);
            await createFn({
                data: {
                    role: "affiliate",
                    email: form.email,
                    ...(form.password ? { password: form.password } : {}),
                    fullName: `${form.firstName} ${form.lastName}`.trim(),
                    commissionRate: form.commissionRate / 100,
                    parentUserId: form.assignedManager || user?.id,
                    phoneNumber: form.phone,
                    socialHandles: form.socialHandles.filter(h => h.trim() !== ""),
                    contractStart: form.contractStart,
                    contractEnd: form.contractEnd,
                    paymentMethod: form.paymentMethod
                }
            });
            toast.success("Affiliate created successfully");
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-affiliates"] });
        } catch (e: any) {
            toast.error(e.message || "Failed to create Affiliate");
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
                    parentUserId: form.assignedManager || user?.id,
                    phoneNumber: form.phone,
                    socialHandles: form.socialHandles.filter(h => h.trim() !== ""),
                    contractStart: form.contractStart,
                    contractEnd: form.contractEnd,
                    paymentMethod: form.paymentMethod,
                    status: form.status as any
                }
            });
            toast.success("Affiliate updated successfully");
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-affiliates"] });
        } catch (e: any) {
            toast.error(e.message || "Failed to update Affiliate");
        } finally {
            setSubmitting(false);
        }
    };

    const openAdd = () => {
        setForm({
            id: "", firstName: "", lastName: "", email: "", password: "", phone: "",
            assignedManager: "", socialHandles: [""],
            contractStart: "2025-08-01", contractEnd: "2026-08-01",
            commissionRate: 10, paymentMethod: "", status: "active"
        });
        setAddOpen(true);
    };

    const openEdit = (aff: any) => {
        const metaStr = aff.metadata;
        const meta = (typeof metaStr === 'string' ? JSON.parse(metaStr || "{}") : metaStr) || {};
        const parts = (aff.full_name || "").split(" ");
        setForm({
            id: aff.id,
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" ") || "",
            email: aff.email || "",
            password: "",
            phone: meta.phone_number || "",
            assignedManager: aff.manager_id || "",
            socialHandles: (meta.social_handles?.length ? meta.social_handles : [""]),
            contractStart: meta.contract_start || "2025-08-01",
            contractEnd: meta.contract_end || "2026-08-01",
            commissionRate: (aff.commission_rate || 0.10) * 100,
            paymentMethod: meta.payment_method || "",
            status: aff.status || "active"
        });
        setEditOpen(true);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Affiliates</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Manage all affiliates across the network</p>
            </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>All Affiliates</CardTitle>
                    <Button onClick={openAdd}>+ Add Affiliate</Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Manager</TableHead>
                                <TableHead>Promo Codes</TableHead>
                                <TableHead>Subscribers</TableHead>
                                <TableHead>Total Trial Users</TableHead>
                                <TableHead>Contract Expiration</TableHead>
                                <TableHead>Commission</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {affiliates?.map((aff: any) => (
                                <TableRow key={aff.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-xs">
                                                {(aff.full_name || "U").substring(0, 2).toUpperCase()}
                                            </div>
                                            {aff.full_name || "Unknown"}
                                        </div>
                                    </TableCell>
                                    <TableCell>{managers?.find((m: any) => m.id === aff.manager_id)?.full_name || "Unknown Mgr"}</TableCell>
                                    <TableCell>{aff.active_promo_codes || 0}</TableCell>
                                    <TableCell>{aff.active_subscribers || 0}</TableCell>
                                    <TableCell>{aff.total_trial_users || 0}</TableCell>
                                    <TableCell>
                                        {(() => {
                                            if (!aff.metadata?.contract_end) return <span className="text-muted-foreground">N/A</span>;
                                            const end = new Date(aff.metadata.contract_end);
                                            const daysLeft = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                            const isExpiringSoon = daysLeft > 0 && daysLeft <= 30;
                                            return (
                                                <div className="flex items-center gap-2">
                                                    {end.toLocaleDateString()}
                                                    {isExpiringSoon && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">Expiring</Badge>}
                                                </div>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell>{aff.commission_rate ? `${(aff.commission_rate * 100).toFixed(1)}%` : "10%"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => openEdit(aff)}>
                                            Edit
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {affiliates?.length === 0 && !isLoading && (
                                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No affiliates found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Add Affiliate Modal */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add Affiliate</DialogTitle>
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
                            <Input type="email" placeholder="affiliate@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
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
                            <Label>Assign to Manager</Label>
                            <Select value={form.assignedManager} onValueChange={v => setForm({ ...form, assignedManager: v })}>
                                <SelectTrigger><SelectValue placeholder="Select a manager" /></SelectTrigger>
                                <SelectContent>
                                    {managers?.map(m => (
                                        <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Social Handles</Label>
                            <div className="flex flex-col space-y-2">
                                {form.socialHandles.map((handle, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <Input type="url" placeholder="https://instagram.com/handle" value={handle} onChange={e => handleSocialChange(idx, e.target.value)} />
                                        <Button type="button" variant="outline" size="icon" onClick={handleAddSocial}><Plus className="h-4 w-4" /></Button>
                                        <Button type="button" variant="outline" size="icon" onClick={() => handleRemoveSocial(idx)} disabled={form.socialHandles.length === 1}><Minus className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Contract Start Date</Label>
                            <Input type="date" value={form.contractStart} onChange={e => setForm({ ...form, contractStart: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Contract Expiration Date</Label>
                            <Input type="date" value={form.contractEnd} onChange={e => setForm({ ...form, contractEnd: e.target.value })} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Commission %</Label>
                            <Input type="number" min="0" max="100" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} />
                            <p className="text-[11px] text-muted-foreground">Percentage of discounted price paid to this affiliate</p>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Preferred Payment Method</Label>
                            <Textarea
                                placeholder="e.g. Direct deposit, Zelle, Wire - include relevant details&#10;Account: XXXXXX&#10;Routing: XXXXXX"
                                value={form.paymentMethod}
                                onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                            />
                        </div>
                        <div className="col-span-2 p-3 bg-[#FFFBEB] bg-opacity-[0.5] rounded-lg">
                            <p className="text-xs text-[#92400E]"><strong>Note:</strong> Affiliates do not sign up themselves. You create their account and share login credentials.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddSubmit} disabled={submitting}>Create Affiliate</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Affiliate Modal */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Affiliate</DialogTitle>
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
                            <Label>Social Handles</Label>
                            <div className="flex flex-col space-y-2">
                                {form.socialHandles.map((handle, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <Input type="url" value={handle} onChange={e => handleSocialChange(idx, e.target.value)} />
                                        <Button type="button" variant="outline" size="icon" onClick={handleAddSocial}><Plus className="h-4 w-4" /></Button>
                                        <Button type="button" variant="outline" size="icon" onClick={() => handleRemoveSocial(idx)} disabled={form.socialHandles.length === 1}><Minus className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Contract Start Date</Label>
                            <Input type="date" value={form.contractStart} onChange={e => setForm({ ...form, contractStart: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Contract Expiration Date</Label>
                            <Input type="date" value={form.contractEnd} onChange={e => setForm({ ...form, contractEnd: e.target.value })} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Commission %</Label>
                            <Input type="number" min="0" max="100" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} />
                            <p className="text-[11px] text-muted-foreground">Adjust this affiliate's commission rate</p>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Preferred Payment Method</Label>
                            <Textarea value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} />
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
                        <div className="col-span-2 space-y-2">
                            <Label>Reassign Manager (SA Only)</Label>
                            <Select value={form.assignedManager} onValueChange={v => setForm({ ...form, assignedManager: v })}>
                                <SelectTrigger><SelectValue placeholder="Select a Manager..." /></SelectTrigger>
                                <SelectContent>
                                    {(managers || []).map((m: any) => (
                                        <SelectItem key={m.id} value={m.id}>{m.full_name || m.id}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-[#92400E]"><strong>Note:</strong> Reassigning will track all future subscriptions to the new manager. Past subscriptions retain their legacy mappings.</p>
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
