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

export const Route = createFileRoute("/_authenticated/admin/managers")({
    component: AdminManagersRoute,
});

function AdminManagersRoute() {
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
        commissionRate: 4,
        status: "active",
        phone: "",
        samId: ""
    });

    const { data, isLoading } = useQuery({
        queryKey: ["admin-managers"],
        queryFn: async () => {
            const { data: roles } = await supabase
                .from("user_roles")
                .select("user_id")
                .eq("role", "manager");

            // Also fetch SAMs so we can map their names and use them in the Create dropdown
            const { data: samRoles } = await supabase.from("user_roles").select("user_id").eq("role", "sam");
            const samIds = (samRoles || []).map(r => r.user_id);
            const { data: samsData } = await supabase.from("profiles").select("id, full_name").in("id", samIds);

            if (!roles?.length) return { managers: [], samsList: samsData || [] };

            const userIds = roles.map((r) => r.user_id);
            const { data: managersData } = await supabase
                .from("manager_analytics_view" as any)
                .select("*")
                .in("id", userIds);

            return { managers: managersData ?? [], samsList: samsData || [] };
        },
    });

    const managers = data?.managers || [];
    const samsList = data?.samsList || [];

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const filteredManagers = managers.filter((m: any) => {
        const matchesName = (m.full_name || "").toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || m.status === statusFilter;
        return matchesName && matchesStatus;
    });

    const handleAddSubmit = async () => {
        try {
            setSubmitting(true);
            await createFn({
                data: {
                    role: "manager",
                    email: form.email,
                    ...(form.password ? { password: form.password } : {}),
                    fullName: `${form.firstName} ${form.lastName}`.trim(),
                    commissionRate: form.commissionRate / 100, // DB stores as decimal
                    parentUserId: (form as any).samId,
                }
            });
            toast.success("Manager created successfully");
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-managers"] });
        } catch (e: any) {
            toast.error(e.message || "Failed to create Manager");
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
                    status: form.status as any,
                    phoneNumber: (form as any).phone,
                    parentUserId: (form as any).samId
                }
            });
            toast.success("Manager updated successfully");
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-managers"] });
        } catch (e: any) {
            toast.error(e.message || "Failed to update Manager");
        } finally {
            setSubmitting(false);
        }
    };

    const openAdd = () => {
        setForm({ id: "", firstName: "", lastName: "", email: "", password: "", commissionRate: 4, status: "active", phone: "", samId: "" });
        setAddOpen(true);
    };

    const openEdit = (mgr: any) => {
        const metaStr = mgr.metadata;
        const meta = (typeof metaStr === 'string' ? JSON.parse(metaStr || "{}") : metaStr) || {};
        const parts = (mgr.full_name || "").split(" ");
        setForm({
            id: mgr.id,
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" ") || "",
            email: mgr.email || "",
            password: "",
            commissionRate: (mgr.commission_rate || 0.04) * 100,
            status: mgr.status || "active",
            samId: mgr.sam_id || "",
            phone: meta.phone_number || ""
        });
        setEditOpen(true);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Managers</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Manage all managers in the system</p>
            </div>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle>All Managers</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            placeholder="Search by manager name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-[200px]"
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={openAdd}>+ Add Manager</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Manager Name</TableHead>
                                <TableHead>SAM</TableHead>
                                <TableHead>Affiliates Count</TableHead>
                                <TableHead>Total Subscribers</TableHead>
                                <TableHead>Pending Commission</TableHead>
                                <TableHead>Total Paid to Date</TableHead>
                                <TableHead>Their Commission (4%)</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredManagers.map((mgr: any) => {
                                const matchedSam = samsList.find((s: any) => s.id === mgr.sam_id);
                                return (
                                    <TableRow key={mgr.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                                                    {(mgr.full_name || "U").substring(0, 2).toUpperCase()}
                                                </div>
                                                {mgr.full_name || "Unknown"}
                                            </div>
                                        </TableCell>
                                        <TableCell>{matchedSam ? matchedSam.full_name : <span className="text-muted-foreground">-</span>}</TableCell>
                                        <TableCell>{mgr.active_affiliates || 0}</TableCell>
                                        <TableCell>{mgr.total_subscribers || 0}</TableCell>
                                        <TableCell>${((mgr.pending_commission_cents || 0) / 100).toFixed(2)}</TableCell>
                                        <TableCell>${((mgr.total_paid_commission_cents || 0) / 100).toFixed(2)}</TableCell>
                                        <TableCell><strong>{mgr.commission_rate ? `${(mgr.commission_rate * 100).toFixed(1)}%` : "4%"}</strong></TableCell>
                                        <TableCell>
                                            <Badge variant={mgr.status === "active" ? "default" : "secondary"}>
                                                {mgr.status === "active" ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => openEdit(mgr)}>
                                                Edit
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredManagers.length === 0 && !isLoading && (
                                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">No managers found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Add Manager Modal */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Add Manager</DialogTitle>
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
                            <Input type="email" placeholder="manager@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input type="password" placeholder="Leave blank to keep same" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Assign to SAM</Label>
                            <Select value={(form as any).samId || ""} onValueChange={v => setForm({ ...form, samId: v } as any)}>
                                <SelectTrigger><SelectValue placeholder="Select a SAM..." /></SelectTrigger>
                                <SelectContent>
                                    {samsList.map((sam: any) => (
                                        <SelectItem key={sam.id} value={sam.id}>{sam.full_name || sam.id}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">Required. This manager will report to and generate override commissions for this SAM.</p>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Commission %</Label>
                            <Input type="number" min="0" max="29" step="0.5" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} />
                            <p className="text-[11px] text-muted-foreground">Manager commission on discounted price. Max: 29% (30% cap - 1% SAM).</p>
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
                        <div className="col-span-2 p-3 bg-[#E0E6F2] bg-opacity-[0.3] rounded-lg">
                            <p className="text-xs text-[#1e3a8a]"><strong>Note:</strong> This manager will be assigned to you. Their affiliates' commissions plus this manager's commission plus your SAM commission cannot exceed 30%.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddSubmit} disabled={submitting}>Create Manager</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Manager Modal */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Edit Manager</DialogTitle>
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
                            <Input type="tel" value={(form as any).phone || ""} onChange={e => setForm({ ...form, phone: e.target.value } as any)} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Assign to SAM</Label>
                            <Select value={(form as any).samId || ""} onValueChange={v => setForm({ ...form, samId: v } as any)}>
                                <SelectTrigger><SelectValue placeholder="Select a SAM..." /></SelectTrigger>
                                <SelectContent>
                                    {samsList.map((sam: any) => (
                                        <SelectItem key={sam.id} value={sam.id}>{sam.full_name || sam.id}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">Required. This manager will report to and generate override commissions for this SAM.</p>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Commission %</Label>
                            <Input type="number" min="0" max="29" step="0.5" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} />
                            <p className="text-[11px] text-muted-foreground">Manager commission on discounted price. Max: 29% (30% cap - 1% SAM).</p>
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
