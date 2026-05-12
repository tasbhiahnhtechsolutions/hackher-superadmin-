import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { createSubordinate } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  title: string;
  subtitle: string;
  childRole: "sam" | "manager" | "affiliate";
  // when true, show all descendants (recursive); else only direct
  recursive?: boolean;
  readOnly?: boolean;
}

export function TeamManagement({ title, subtitle, childRole, recursive = false, readOnly = false }: Props) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const create = useServerFn(createSubordinate);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", fullName: "", password: "", commission: 10 });
  const isSuperAdmin = role === "super_admin";

  const queryKey = ["team", childRole, user?.id, recursive];
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      // Get user_ids for this role (RLS now allows ancestors to see descendant roles)
      const { data: rolesRows } = await supabase.from("user_roles").select("user_id").eq("role", childRole);
      const ids = (rolesRows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      let q = supabase.from("profiles").select("*").in("id", ids).order("created_at", { ascending: false });
      // For non-recursive lists (Manager → affiliates, SAM → managers, SuperAdmin → SAMs)
      // restrict to DIRECT children of the current user.
      if (!recursive && user) q = q.eq("parent_user_id", user.id);
      const { data: profiles } = await q;
      return profiles ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      return create({ data: {
        email: form.email,
        fullName: form.fullName,
        password: form.password,
        role: childRole,
      }});
    },
    onSuccess: (res) => {
      if (childRole === "affiliate" && res?.promoCode) {
        toast.success(`Affiliate created — promo code ${res.promoCode}`);
      } else {
        toast.success("Account created");
      }
      setOpen(false);
      setForm({ email: "", fullName: "", password: "", commission: 10 });
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelMap: Record<AppRole, string> = { super_admin: "Super Admin", sam: "SAM", manager: "Manager", affiliate: "Affiliate", customer: "Customer" };

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={readOnly ? undefined : <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New {labelMap[childRole]}</Button>}
      />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead>
              <TableHead>Commission</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : !data?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No {labelMap[childRole]}s yet.</TableCell></TableRow>
                : data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.commission_rate ? `${(Number(u.commission_rate) * 100).toFixed(0)}%` : "—"}</TableCell>
                    <TableCell><Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create {labelMap[childRole]}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full name</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Temporary password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></div>
            {childRole === "affiliate" ? (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                The affiliate will create their own branded promo codes (e.g. <span className="font-mono font-semibold">YOURNAMETIKTOK</span>) from their dashboard. Default split: customer <b>15%</b> off, affiliate <b>10%</b>, manager <b>4%</b>, SAM <b>1%</b>.
              </div>
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                Commission rate uses the platform default for {labelMap[childRole]}s configured in <b>Platform Settings</b>. Update it there to apply globally.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>{createMut.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
