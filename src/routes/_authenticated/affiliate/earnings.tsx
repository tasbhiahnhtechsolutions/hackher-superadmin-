import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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

export const Route = createFileRoute("/_authenticated/affiliate/earnings")({ component: Page });

type Row = {
  id: string;
  created_at: string;
  amount_cents: number;
  rate: number;
  status: string;
  cleared_at: string | null;
  subscription_id: string;
  campaign: string | null;
};

function Page() {
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<string>("__all");

  const { data, isLoading } = useQuery({
    queryKey: ["earnings", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Row[]> => {
      const { data: comm } = await supabase
        .from("commissions")
        .select("id,created_at,amount_cents,rate,status,cleared_at,subscription_id")
        .eq("beneficiary_id", user!.id)
        .order("created_at", { ascending: false });
      const subIds = Array.from(new Set((comm ?? []).map((c) => c.subscription_id)));
      if (!subIds.length) return [];
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id,promo_code_id")
        .in("id", subIds);
      const promoIds = Array.from(
        new Set((subs ?? []).map((s) => s.promo_code_id).filter(Boolean) as string[]),
      );
      const { data: codes } = promoIds.length
        ? await supabase.from("promo_codes").select("id,campaign_label").in("id", promoIds)
        : { data: [] as { id: string; campaign_label: string | null }[] };
      const promoToCampaign = new Map((codes ?? []).map((p) => [p.id, p.campaign_label]));
      const subToCampaign = new Map(
        (subs ?? []).map((s) => [
          s.id,
          s.promo_code_id ? (promoToCampaign.get(s.promo_code_id) ?? null) : null,
        ]),
      );
      return (comm ?? []).map((c) => ({
        ...c,
        campaign: subToCampaign.get(c.subscription_id) ?? null,
      })) as Row[];
    },
  });

  const campaigns = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.campaign ?? "(no campaign)"))),
    [data],
  );
  const filtered = useMemo(
    () =>
      campaign === "__all"
        ? (data ?? [])
        : (data ?? []).filter((r) => (r.campaign ?? "(no campaign)") === campaign),
    [data, campaign],
  );

  return (
    <>
      <PageHeader title="Earnings" subtitle="Your commissions and payouts" />
      <PageBody>
        <div className="mb-3 flex justify-end">
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Filter by campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cleared</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !filtered.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No earnings yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.campaign ?? "(no campaign)"}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      ${(c.amount_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>{(Number(c.rate) * 100).toFixed(0)}%</TableCell>
                    <TableCell>
                      <Badge>{c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {c.cleared_at ? new Date(c.cleared_at).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
