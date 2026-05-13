import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageBody } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/affiliate/subscribers")({ component: Page });

type Sub = {
  id: string; created_at: string; full_name: string | null; email: string;
  campaign: string | null;
};

function Page() {
  const { user } = useAuth();
  const [campaign, setCampaign] = useState("__all");

  const { data, isLoading } = useQuery({
    queryKey: ["my-subs", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Sub[]> => {
      const { data: customers } = await supabase.from("customers")
        .select("id,created_at,full_name,email")
        .eq("affiliate_id", user!.id).order("created_at", { ascending: false });
      const ids = (customers ?? []).map((c) => c.id);
      if (!ids.length) return [];
      const { data: subs } = await supabase.from("subscriptions")
        .select("customer_id,promo_code_id").in("customer_id", ids);
      const promoIds = Array.from(new Set((subs ?? []).map((s) => s.promo_code_id).filter(Boolean) as string[]));
      const { data: codes } = promoIds.length
        ? await supabase.from("promo_codes").select("id,campaign_label").in("id", promoIds)
        : { data: [] as { id: string; campaign_label: string | null }[] };
      const promoToCampaign = new Map((codes ?? []).map((p) => [p.id, p.campaign_label]));
      const customerToCampaign = new Map<string, string | null>();
      for (const s of subs ?? []) {
        if (!customerToCampaign.has(s.customer_id)) {
          customerToCampaign.set(s.customer_id, s.promo_code_id ? promoToCampaign.get(s.promo_code_id) ?? null : null);
        }
      }
      return (customers ?? []).map((c) => ({ ...c, campaign: customerToCampaign.get(c.id) ?? null }));
    },
  });

  const campaigns = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.campaign ?? "(no campaign)"))), [data]);
  const filtered = useMemo(
    () => (campaign === "__all" ? (data ?? []) : (data ?? []).filter((r) => (r.campaign ?? "(no campaign)") === campaign)),
    [data, campaign],
  );

  return <>
    <PageHeader title="Subscribers" subtitle="Customers attributed to your promo codes" />
    <PageBody>
      <div className="mb-3 flex justify-end">
        <Select value={campaign} onValueChange={setCampaign}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Filter by campaign" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All campaigns</SelectItem>
            {campaigns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border/60 bg-card"><Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Email</TableHead>
          <TableHead>Campaign</TableHead><TableHead>Joined</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            : !filtered.length ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No subscribers yet.</TableCell></TableRow>
            : filtered.map((c) => <TableRow key={c.id}>
                <TableCell className="font-medium">{c.full_name ?? "—"}</TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell><Badge variant="secondary">{c.campaign ?? "(no campaign)"}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
              </TableRow>)}
        </TableBody></Table></div>
    </PageBody>
  </>;
}
