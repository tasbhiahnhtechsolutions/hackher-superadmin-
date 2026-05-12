import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map((roles.data ?? []).map((r) => [r.user_id, r.role]));
      return (profiles.data ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "—" }));
    },
  });

  return (
    <>
      <PageHeader title="Users & Roles" subtitle="All users in the platform" />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
              <TableHead>Status</TableHead><TableHead>Parent</TableHead><TableHead>Commission</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : !data?.length ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users.</TableCell></TableRow>
                : data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                    <TableCell><Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{u.parent_user_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell>{u.commission_rate ? `${(Number(u.commission_rate) * 100).toFixed(0)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
