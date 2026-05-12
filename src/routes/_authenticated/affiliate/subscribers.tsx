import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/affiliate/subscribers")({ component: Page });
function Page() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-subs", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("customers").select("*").eq("affiliate_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });
  return <>
    <PageHeader title="Subscribers" subtitle="Customers attributed to your promo codes" />
    <PageBody><div className="rounded-xl border border-border/60 bg-card"><Table>
      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
      <TableBody>
        {isLoading ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          : !data?.length ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No subscribers yet.</TableCell></TableRow>
          : data.map((c) => <TableRow key={c.id}>
              <TableCell className="font-medium">{c.full_name ?? "—"}</TableCell>
              <TableCell>{c.email}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
            </TableRow>)}
      </TableBody></Table></div></PageBody>
  </>;
}
