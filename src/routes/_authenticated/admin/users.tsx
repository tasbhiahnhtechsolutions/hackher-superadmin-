import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, PageBody } from "@/components/page-header";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  super_admin: "destructive",
  sam: "default",
  manager: "secondary",
  affiliate: "outline",
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  sam: "SAM",
  manager: "Manager",
  affiliate: "Affiliate",
};

function UsersPage() {
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users-hierarchy"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map((roles.data ?? []).map((r) => [r.user_id, r.role as string]));
      return (profiles.data ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "—" }));
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["all-customers-subs"],
    queryFn: async () => {
      const [cust, subs, plans] = await Promise.all([
        supabase.from("customers").select("*").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*"),
        supabase.from("plans").select("id,name"),
      ]);
      const planMap = new Map((plans.data ?? []).map((p) => [p.id, p.name]));
      const subsByCustomer = new Map<string, any[]>();
      (subs.data ?? []).forEach((s) => {
        const list = subsByCustomer.get(s.customer_id) ?? [];
        list.push({ ...s, plan_name: planMap.get(s.plan_id) ?? "—" });
        subsByCustomer.set(s.customer_id, list);
      });
      return (cust.data ?? []).map((c) => ({ ...c, subs: subsByCustomer.get(c.id) ?? [] }));
    },
  });

  const userById = useMemo(
    () => new Map((users ?? []).map((u) => [u.id, u])),
    [users],
  );

  // Build hierarchy: SAMs -> Managers -> Affiliates
  const hierarchy = useMemo(() => {
    if (!users) return { sams: [], orphans: [] };
    const byParent = new Map<string | null, typeof users>();
    users.forEach((u) => {
      const k = u.parent_user_id ?? null;
      const arr = byParent.get(k) ?? [];
      arr.push(u);
      byParent.set(k, arr);
    });
    const sams = users.filter((u) => u.role === "sam");
    const used = new Set<string>();
    sams.forEach((s) => used.add(s.id));
    const orphans = users.filter(
      (u) => !["super_admin", "sam"].includes(u.role) && (!u.parent_user_id || !userById.get(u.parent_user_id)),
    );
    return { sams, orphans, byParent };
  }, [users, userById]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.full_name?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q),
    );
  }, [users, search]);

  const labelFor = (id?: string | null) => {
    if (!id) return "—";
    const u = userById.get(id);
    return u ? (u.full_name || u.email) : id.slice(0, 8);
  };

  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Hierarchy, team members, and subscribers" />
      <PageBody>
        <Tabs defaultValue="hierarchy" className="space-y-4">
          <TabsList>
            <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
            <TabsTrigger value="all">All users ({users?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="customers">Customers ({customers?.length ?? 0})</TabsTrigger>
          </TabsList>

          {/* HIERARCHY */}
          <TabsContent value="hierarchy" className="space-y-4">
            {isLoading ? (
              <div className="text-muted-foreground p-8 text-center">Loading…</div>
            ) : !hierarchy.sams.length ? (
              <div className="text-muted-foreground p-8 text-center rounded-xl border border-border/60 bg-card">
                No SAMs yet. Create one to start building your team.
              </div>
            ) : (
              hierarchy.sams.map((sam) => {
                const managers = (hierarchy.byParent?.get(sam.id) ?? []).filter((u) => u.role === "manager");
                return (
                  <div key={sam.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                    <div className="flex items-center justify-between gap-4 p-4 bg-muted/40 border-b border-border/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={ROLE_VARIANT.sam}>SAM</Badge>
                          <span className="font-semibold">{sam.full_name || sam.email}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{sam.email}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{managers.length} manager{managers.length === 1 ? "" : "s"}</div>
                        <div>Commission: {sam.commission_rate ? `${(Number(sam.commission_rate) * 100).toFixed(0)}%` : "—"}</div>
                      </div>
                    </div>
                    {!managers.length ? (
                      <div className="p-4 text-sm text-muted-foreground">No managers under this SAM.</div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {managers.map((mgr) => {
                          const affs = (hierarchy.byParent?.get(mgr.id) ?? []).filter((u) => u.role === "affiliate");
                          return (
                            <div key={mgr.id} className="p-4 pl-8">
                              <div className="flex items-center gap-2 mb-2">
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                <Badge variant={ROLE_VARIANT.manager}>Manager</Badge>
                                <span className="font-medium">{mgr.full_name || mgr.email}</span>
                                <span className="text-xs text-muted-foreground">{mgr.email}</span>
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {affs.length} affiliate{affs.length === 1 ? "" : "s"} · {mgr.commission_rate ? `${(Number(mgr.commission_rate) * 100).toFixed(0)}%` : "—"}
                                </span>
                              </div>
                              {!affs.length ? (
                                <div className="pl-6 text-xs text-muted-foreground">No affiliates yet.</div>
                              ) : (
                                <div className="pl-6 space-y-1">
                                  {affs.map((af) => (
                                    <div key={af.id} className="flex items-center gap-2 text-sm">
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                      <Badge variant={ROLE_VARIANT.affiliate}>Affiliate</Badge>
                                      <span>{af.full_name || af.email}</span>
                                      <span className="text-xs text-muted-foreground">{af.email}</span>
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        {af.commission_rate ? `${(Number(af.commission_rate) * 100).toFixed(0)}%` : "—"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {hierarchy.orphans?.length ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-card p-4">
                <div className="text-sm font-medium mb-2">Unassigned users</div>
                <div className="space-y-1">
                  {hierarchy.orphans.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 text-sm">
                      <Badge variant={ROLE_VARIANT[u.role] ?? "outline"}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                      <span>{u.full_name || u.email}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          {/* ALL USERS (flat) */}
          <TabsContent value="all" className="space-y-3">
            <Input
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="rounded-xl border border-border/60 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Reports to</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : !filteredUsers.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users.</TableCell></TableRow>
                  ) : (
                    filteredUsers.map((u) => {
                      const parent = u.parent_user_id ? userById.get(u.parent_user_id) : null;
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>
                            <Badge variant={ROLE_VARIANT[u.role] ?? "outline"}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {parent ? (
                              <div>
                                <div>{parent.full_name || parent.email}</div>
                                <div className="text-xs text-muted-foreground">{ROLE_LABEL[parent.role] ?? parent.role}</div>
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge>
                          </TableCell>
                          <TableCell>{u.commission_rate ? `${(Number(u.commission_rate) * 100).toFixed(0)}%` : "—"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* CUSTOMERS / SUBSCRIBERS */}
          <TabsContent value="customers">
            <div className="rounded-xl border border-border/60 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Attributed Affiliate</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!customers?.length ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No customers yet.</TableCell></TableRow>
                  ) : (
                    customers.flatMap((c) => {
                      const rows = c.subs.length ? c.subs : [null];
                      return rows.map((s: any, i: number) => (
                        <TableRow key={`${c.id}-${i}`}>
                          <TableCell className="font-medium">{c.full_name ?? "—"}</TableCell>
                          <TableCell>{c.email}</TableCell>
                          <TableCell>{s ? s.plan_name : <span className="text-muted-foreground">No subscription</span>}</TableCell>
                          <TableCell>
                            {s ? <Badge variant={s.status === "active" || s.status === "trialing" ? "default" : "secondary"}>{s.status}</Badge> : "—"}
                          </TableCell>
                          <TableCell>{s ? `$${(s.amount_paid_cents / 100).toFixed(2)}` : "—"}</TableCell>
                          <TableCell className="text-sm">{labelFor(c.affiliate_id)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ));
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
