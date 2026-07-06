import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/manager/reports")({
  component: ManagerReportsRoute,
});

function toCSV(rows: Record<string, any>[], headers: string[]) {
  const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(","));
  return lines.join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Returns last completed month as { label, start, end } */
function lastMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { label, start: start.toISOString(), end: end.toISOString() };
}

function ManagerReportsRoute() {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState<string | null>(null);
  const period = lastMonth();

  /* ── Fetch affiliate IDs under manager ── */
  const { data: affRows } = useQuery({
    queryKey: ["manager-reports-affiliates", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("parent_user_id", user!.id);
      return (data as any[]) ?? [];
    },
  });

  const affIds = affRows?.map((a: any) => a.id) ?? [];

  /* ── Download handlers ── */
  const downloadCommissions = async () => {
    if (!affIds.length) { toast.error("No affiliates found"); return; }
    setDownloading("commissions");
    try {
      const { data } = await supabase
        .from("commissions")
        .select("id, amount_cents, status, created_at, beneficiary_id")
        .in("beneficiary_id", affIds)
        .gte("created_at", period.start)
        .lte("created_at", period.end);

      const rows = (data ?? []).map((r: any) => {
        const aff = affRows?.find((a: any) => a.id === r.beneficiary_id);
        return {
          date: new Date(r.created_at).toLocaleDateString(),
          affiliate: aff?.full_name || aff?.email || r.beneficiary_id,
          amount_usd: (r.amount_cents / 100).toFixed(2),
          status: r.status,
        };
      });
      downloadCSV(toCSV(rows, ["date", "affiliate", "amount_usd", "status"]), `commissions_${period.label.replace(/ /g, "_")}.csv`);
      toast.success("Commission report downloaded");
    } catch { toast.error("Failed to generate report"); }
    finally { setDownloading(null); }
  };

  const downloadSubscribers = async () => {
    if (!affIds.length) { toast.error("No affiliates found"); return; }
    setDownloading("subscribers");
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, status, created_at, customer_id, customers!inner(affiliate_id)")
        .gte("created_at", period.start)
        .lte("created_at", period.end);

      const filtered = (data ?? []).filter((r: any) => affIds.includes((r.customers as any)?.affiliate_id));
      const rows = filtered.map((r: any) => ({
        date: new Date(r.created_at).toLocaleDateString(),
        customer_id: r.customer_id,
        affiliate_id: (r.customers as any)?.affiliate_id ?? "",
        status: r.status,
      }));
      downloadCSV(toCSV(rows, ["date", "customer_id", "affiliate_id", "status"]), `subscribers_${period.label.replace(/ /g, "_")}.csv`);
      toast.success("Subscriber report downloaded");
    } catch { toast.error("Failed to generate report"); }
    finally { setDownloading(null); }
  };

  const downloadCampaigns = async () => {
    if (!affIds.length) { toast.error("No affiliates found"); return; }
    setDownloading("campaigns");
    try {
      const { data } = await supabase
        .from("promo_codes")
        .select("code, campaign_label, discount_percent, usage_count, status, affiliate_id")
        .in("affiliate_id", affIds);

      const rows = (data ?? []).map((r: any) => {
        const aff = affRows?.find((a: any) => a.id === r.affiliate_id);
        return {
          code: r.code,
          campaign: r.campaign_label ?? "",
          affiliate: aff?.full_name || aff?.email || r.affiliate_id,
          discount_pct: r.discount_percent ?? "",
          total_uses: r.usage_count ?? 0,
          status: r.status,
        };
      });
      downloadCSV(toCSV(rows, ["code", "campaign", "affiliate", "discount_pct", "total_uses", "status"]), `campaigns_${period.label.replace(/ /g, "_")}.csv`);
      toast.success("Campaign report downloaded");
    } catch { toast.error("Failed to generate report"); }
    finally { setDownloading(null); }
  };

  const reports = [
    {
      key: "commissions",
      title: "Commission Report",
      description: `Affiliate-tier commissions for ${period.label}, scoped to your affiliates.`,
      columns: "Date, Affiliate, Amount (USD), Status",
      onDownload: downloadCommissions,
    },
    {
      key: "subscribers",
      title: "Subscriber Report",
      description: `Active paid subscribers attributed to your affiliates in ${period.label}.`,
      columns: "Date, Customer ID, Affiliate ID, Status",
      onDownload: downloadSubscribers,
    },
    {
      key: "campaigns",
      title: "Campaign Performance",
      description: `Promo code usage and campaign breakdown for ${period.label}.`,
      columns: "Code, Campaign, Affiliate, Discount %, Total Uses, Status",
      onDownload: downloadCampaigns,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Reports</h1>
        <p className="text-[13px] text-muted-foreground mb-6">
          Available downloads scoped to your affiliates — most recent completed month: <strong>{period.label}</strong>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.key} className="flex flex-col justify-between">
            <CardContent className="pt-6 pb-4 space-y-3 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                  <FileSpreadsheet className="h-5 w-5 text-violet-500" />
                </div>
                <h3 className="font-semibold text-sm">{r.title}</h3>
              </div>
              <p className="text-[12px] text-muted-foreground">{r.description}</p>
              <div className="rounded-md bg-muted px-3 py-2">
                <p className="text-[11px] text-muted-foreground font-medium">Columns: {r.columns}</p>
              </div>
            </CardContent>
            <div className="px-6 pb-5">
              <Button
                className="w-full gap-2"
                onClick={r.onDownload}
                disabled={downloading === r.key}
              >
                <FileDown className="h-4 w-4" />
                {downloading === r.key ? "Generating…" : "Download CSV"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
