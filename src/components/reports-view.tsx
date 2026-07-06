import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface ReportsViewProps {
  role: "super_admin" | "sam" | "manager";
}

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
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatPeriod(dateStr?: string | null) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function ReportsView({ role }: ReportsViewProps) {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState<string | null>(null);

  // 1. Fetch profiles and user roles to construct the hierarchy tree in memory
  const { data: treeData } = useQuery({
    queryKey: ["reports-hierarchy-tree"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, parent_user_id, metadata"),
        supabase.from("user_roles").select("user_id, role")
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];

      const profilesMap: Record<string, {
        id: string;
        name: string;
        email: string;
        role: string;
        parent_user_id: string | null;
        payment_method: string;
      }> = {};

      profiles.forEach((p) => {
        const roleRow = roles.find((r) => r.user_id === p.id);
        const metadata = (p.metadata as any) || {};
        profilesMap[p.id] = {
          id: p.id,
          name: p.full_name || p.email.split("@")[0],
          email: p.email,
          role: roleRow?.role || "affiliate",
          parent_user_id: p.parent_user_id,
          payment_method: metadata.payment_method || "Bank Transfer",
        };
      });

      return profilesMap;
    }
  });

  const profilesMap = treeData || {};

  // Check if a beneficiary or affiliate is within the current user's tree scope
  const isWithinScope = (targetId: string): boolean => {
    if (role === "super_admin") return true;
    if (targetId === user?.id) return true; // Can see their own payout/commissions

    const target = profilesMap[targetId];
    if (!target) return false;

    if (role === "manager") {
      return target.parent_user_id === user?.id;
    }

    if (role === "sam") {
      // Direct child
      if (target.parent_user_id === user?.id) return true;
      // Grandchild (affiliate under manager who is under this SAM)
      if (target.parent_user_id) {
        const parent = profilesMap[target.parent_user_id];
        if (parent && parent.parent_user_id === user?.id) return true;
      }
    }

    return false;
  };

  const resolveAffiliateInfo = (affId?: string | null) => {
    if (!affId) return { affiliateName: "", managerName: "", samName: "" };
    const aff = profilesMap[affId];
    if (!aff) return { affiliateName: "", managerName: "", samName: "" };

    let managerName = "";
    let samName = "";

    if (aff.parent_user_id) {
      const parent = profilesMap[aff.parent_user_id];
      if (parent) {
        if (parent.role === "manager") {
          managerName = parent.name;
          if (parent.parent_user_id) {
            const grandparent = profilesMap[parent.parent_user_id];
            if (grandparent && grandparent.role === "sam") {
              samName = grandparent.name;
            }
          }
        } else if (parent.role === "sam") {
          samName = parent.name;
        }
      }
    }

    return {
      affiliateName: aff.name,
      managerName,
      samName,
    };
  };

  // 2. Fetch all raw data required for the reports
  const downloadReport = async (reportKey: string) => {
    setDownloading(reportKey);
    try {
      if (reportKey === "commission") {
        // Commission Report CSV
        const { data: subs, error } = await supabase
          .from("subscriptions")
          .select(`
            id,
            created_at,
            amount_paid_cents,
            plans (name, price_cents),
            customers (email, full_name, affiliate_id),
            promo_codes (code, discount_percent, affiliate_id)
          `);

        if (error) throw error;

        const rows = (subs || [])
          .map((sub: any) => {
            const affiliateId = sub.customers?.affiliate_id || sub.promo_codes?.affiliate_id;
            if (!affiliateId || !isWithinScope(affiliateId)) return null;

            const paidAmount = (sub.amount_paid_cents || 0) / 100;
            const fullPrice = (sub.plans?.price_cents || 0) / 100;
            const discountPercent = sub.promo_codes?.discount_percent || 0;

            const { affiliateName, managerName, samName } = resolveAffiliateInfo(affiliateId);

            const affiliateComm = paidAmount * 0.10;
            const managerComm = managerName ? paidAmount * 0.04 : 0;
            const samComm = samName ? paidAmount * 0.01 : 0;
            const netRev = paidAmount - affiliateComm - managerComm - samComm;

            return {
              "Period": formatPeriod(sub.created_at),
              "Subscriber": sub.customers?.full_name || sub.customers?.email?.split("@")[0] || "Subscriber",
              "Email": sub.customers?.email || "",
              "Plan": sub.plans?.name || "Subscription",
              "Full Price": `$${fullPrice.toFixed(2)}`,
              "Discount %": `${discountPercent}%`,
              "Paid Amount": `$${paidAmount.toFixed(2)}`,
              "Affiliate Name": affiliateName,
              "Affiliate Commission": `$${affiliateComm.toFixed(2)}`,
              "Manager Name": managerName || "N/A",
              "Manager Commission": `$${managerComm.toFixed(2)}`,
              "SAM Commission": `$${samComm.toFixed(2)}`,
              "Net Revenue": `$${netRev.toFixed(2)}`,
            };
          })
          .filter(Boolean) as Record<string, any>[];

        const headers = [
          "Period", "Subscriber", "Email", "Plan", "Full Price", "Discount %",
          "Paid Amount", "Affiliate Name", "Affiliate Commission", "Manager Name",
          "Manager Commission", "SAM Commission", "Net Revenue"
        ];
        downloadCSV(toCSV(rows, headers), `commission_report_${Date.now()}.csv`);
        toast.success("Commission Report downloaded successfully.");
      }

      else if (reportKey === "subscriber") {
        // Subscriber Report CSV
        const { data: subs, error } = await supabase
          .from("subscriptions")
          .select(`
            id,
            created_at,
            status,
            current_period_end,
            trial_ends_at,
            amount_paid_cents,
            plans (name),
            customers (email, full_name, affiliate_id),
            promo_codes (code, affiliate_id)
          `);

        if (error) throw error;

        const rows = (subs || [])
          .map((sub: any) => {
            const affiliateId = sub.customers?.affiliate_id || sub.promo_codes?.affiliate_id;
            if (!affiliateId || !isWithinScope(affiliateId)) return null;

            const { affiliateName, managerName, samName } = resolveAffiliateInfo(affiliateId);
            const paidAmount = (sub.amount_paid_cents || 0) / 100;
            const totalCommission = paidAmount * (0.10 + (managerName ? 0.04 : 0) + (samName ? 0.01 : 0));

            return {
              "Subscriber Name": sub.customers?.full_name || sub.customers?.email?.split("@")[0] || "Subscriber",
              "Email": sub.customers?.email || "",
              "Plan": sub.plans?.name || "Subscription",
              "Promo Code Used": sub.promo_codes?.code || "None",
              "Subscribed Date": formatDate(sub.created_at),
              "Expiry Date": formatDate(sub.current_period_end || sub.trial_ends_at),
              "Status": sub.status ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1) : "Unknown",
              "Affiliate Name": affiliateName,
              "Manager Name": managerName || "N/A",
              "Commission Earned": `$${totalCommission.toFixed(2)}`,
            };
          })
          .filter(Boolean) as Record<string, any>[];

        const headers = [
          "Subscriber Name", "Email", "Plan", "Promo Code Used", "Subscribed Date",
          "Expiry Date", "Status", "Affiliate Name", "Manager Name", "Commission Earned"
        ];
        downloadCSV(toCSV(rows, headers), `subscriber_report_${Date.now()}.csv`);
        toast.success("Subscriber Report downloaded successfully.");
      }

      else if (reportKey === "campaign") {
        // Campaign Performance CSV
        const [promoRes, subsRes] = await Promise.all([
          supabase.from("promo_codes").select("*"),
          supabase.from("subscriptions").select(`
            id,
            amount_paid_cents,
            promo_code_id,
            customers (affiliate_id),
            promo_codes (affiliate_id)
          `)
        ]);

        if (promoRes.error) throw promoRes.error;
        if (subsRes.error) throw subsRes.error;

        const promoCodes = promoRes.data || [];
        const subscriptions = subsRes.data || [];

        // Group by campaign_label
        const campaignsMap: Record<string, {
          codes: typeof promoCodes;
          subs: typeof subscriptions;
        }> = {};

        promoCodes.forEach((code) => {
          const affId = code.affiliate_id;
          if (!affId || !isWithinScope(affId)) return;

          const label = code.campaign_label || "Default Campaign";
          if (!campaignsMap[label]) {
            campaignsMap[label] = { codes: [], subs: [] };
          }
          campaignsMap[label].codes.push(code);
        });

        subscriptions.forEach((sub: any) => {
          const affiliateId = sub.customers?.affiliate_id || sub.promo_codes?.affiliate_id;
          if (!affiliateId || !isWithinScope(affiliateId)) return;

          const matchedCode = promoCodes.find((c) => c.id === sub.promo_code_id);
          if (matchedCode) {
            const label = matchedCode.campaign_label || "Default Campaign";
            if (campaignsMap[label]) {
              campaignsMap[label].subs.push(sub);
            }
          }
        });

        const rows = Object.entries(campaignsMap).map(([campaignName, data]) => {
          const totalSubscribers = data.subs.length;
          const activeCodes = data.codes.filter(c => c.status === "active").length;
          const revenueGenerated = data.subs.reduce((sum, s) => sum + (s.amount_paid_cents || 0) / 100, 0);

          // Commission Owed (15% total waterfall pool)
          const commissionPaid = data.subs.reduce((sum, s) => {
            const affiliateId = s.customers?.affiliate_id || s.promo_codes?.affiliate_id;
            const { managerName, samName } = resolveAffiliateInfo(affiliateId);
            const rate = 0.10 + (managerName ? 0.04 : 0) + (samName ? 0.01 : 0);
            return sum + ((s.amount_paid_cents || 0) / 100) * rate;
          }, 0);

          const startDates = data.codes.map(c => new Date(c.created_at).getTime()).filter(Boolean);
          const launchDate = startDates.length ? new Date(Math.min(...startDates)) : null;

          const avgOrderValue = totalSubscribers > 0 ? revenueGenerated / totalSubscribers : 0;
          const hasActiveCodes = data.codes.some(c => c.status === "active");

          return {
            "Campaign Name": campaignName,
            "Total Subscribers": totalSubscribers,
            "Active Codes": activeCodes,
            "Revenue Generated": `$${revenueGenerated.toFixed(2)}`,
            "Commission Paid": `$${commissionPaid.toFixed(2)}`,
            "Start Date": launchDate ? formatDate(launchDate.toISOString()) : "N/A",
            "End Date": "Ongoing",
            "Status": hasActiveCodes ? "Active" : "Completed",
            "Average Order Value": `$${avgOrderValue.toFixed(2)}`,
            "Conversion Rate": "N/A",
          };
        });

        const headers = [
          "Campaign Name", "Total Subscribers", "Active Codes", "Revenue Generated",
          "Commission Paid", "Start Date", "End Date", "Status", "Average Order Value",
          "Conversion Rate"
        ];
        downloadCSV(toCSV(rows, headers), `campaign_performance_${Date.now()}.csv`);
        toast.success("Campaign Performance Report downloaded successfully.");
      }

      else if (reportKey === "payout") {
        // Payout Report CSV
        const { data: payouts, error } = await supabase
          .from("payouts")
          .select("*");

        if (error) throw error;

        const rows = (payouts || [])
          .map((pay) => {
            if (!isWithinScope(pay.beneficiary_id)) return null;

            const profile = profilesMap[pay.beneficiary_id];
            if (!profile) return null;

            const getStatusLabel = (status: string) => {
              if (status === "pending") return "Pending";
              if (status === "processing") return "Cleared";
              if (status === "paid") return "Paid";
              if (status === "failed") return "On Hold";
              return status.charAt(0).toUpperCase() + status.slice(1);
            };

            const amountDue = pay.amount_cents / 100;
            const periodLabel = pay.period_start ? formatPeriod(pay.period_start) : "N/A";

            return {
              "Recipient": profile.name,
              "Email": profile.email,
              "Role": profile.role === "sam" ? "Super Admin Manager" : profile.role === "manager" ? "Manager" : "Affiliate",
              "Amount Due": `$${amountDue.toFixed(2)}`,
              "Period": periodLabel,
              "Status": getStatusLabel(pay.status),
              "Date Status Changed": formatDate(pay.paid_at || pay.created_at),
              "Date Marked Paid": pay.paid_at ? formatDate(pay.paid_at) : "N/A",
              "Payment Method": profile.payment_method,
            };
          })
          .filter(Boolean) as Record<string, any>[];

        const headers = [
          "Recipient", "Email", "Role", "Amount Due", "Period", "Status",
          "Date Status Changed", "Date Marked Paid", "Payment Method"
        ];
        downloadCSV(toCSV(rows, headers), `payout_report_${Date.now()}.csv`);
        toast.success("Payout Report downloaded successfully.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate and download report.");
    } finally {
      setDownloading(null);
    }
  };

  const reportsList = [
    {
      key: "commission",
      title: "Commission Report",
      description: "Reconcile affiliate earnings and verify commission waterfall distribution details.",
      columns: "Period, Subscriber, Email, Plan, Full Price, Discount %, Paid Amount, Affiliate Name, Affiliate Commission, Manager Name, Manager Commission, SAM Commission, Net Revenue",
    },
    {
      key: "subscriber",
      title: "Subscriber Report",
      description: "Analyze customer lifetimes, package statuses, and referrers scoped to your tree.",
      columns: "Subscriber Name, Email, Plan, Promo Code Used, Subscribed Date, Expiry Date, Status, Affiliate Name, Manager Name, Commission Earned",
    },
    {
      key: "campaign",
      title: "Campaign Performance",
      description: "Verify campaign launch statuses, code counts, generated MRR, and conversion rates.",
      columns: "Campaign Name, Total Subscribers, Active Codes, Revenue Generated, Commission Paid, Start Date, End Date, Status, Average Order Value, Conversion Rate",
    },
    {
      key: "payout",
      title: "Payout Report",
      description: "Financial payout logs matching bank transfers, status tracking, and compliance trails.",
      columns: "Recipient, Email, Role, Amount Due, Period, Status, Date Status Changed, Date Marked Paid, Payment Method",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Reports & Analytics</h1>
        <p className="text-[13px] text-muted-foreground">
          Download real-time CSV compliance exports scoped to your role: <strong>{role.toUpperCase().replace("_", " ")}</strong>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {reportsList.map((r) => (
          <Card key={r.key} className="flex flex-col justify-between border-[#E5E7EB] shadow-xs">
            <CardContent className="pt-6 pb-4 space-y-3.5 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                  <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-sm text-[#0F1A33]">{r.title}</h3>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{r.description}</p>
              <div className="rounded-lg bg-[#F9FAFB] border border-[#F3F4F6] p-3">
                <p className="text-[11px] text-muted-foreground leading-normal">
                  <strong className="text-gray-700 font-semibold">Columns:</strong> {r.columns}
                </p>
              </div>
            </CardContent>
            <div className="px-6 pb-5 pt-1">
              <Button
                className="w-full gap-2 bg-[#18294F] hover:bg-[#0F1A33] text-white transition-all text-xs font-semibold h-9.5 rounded-lg cursor-pointer"
                onClick={() => downloadReport(r.key)}
                disabled={downloading === r.key}
              >
                <FileDown className="h-4 w-4" />
                {downloading === r.key ? "Generating CSV..." : "Download CSV"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
