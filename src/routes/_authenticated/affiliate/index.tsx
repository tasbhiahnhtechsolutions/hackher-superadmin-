import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";
import { PageBody } from "@/components/page-header";
import { Tag, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/affiliate/")({
  component: AffiliateDashboard,
});

function AffiliateDashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["affiliate-kpis", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [promos, customers, comm] = await Promise.all([
        supabase.from("promo_codes").select("id,code,discount_percent,usage_count,campaign_label,status").eq("affiliate_id", user!.id).order("created_at", { ascending: false }),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("affiliate_id", user!.id),
        supabase.from("commissions").select("amount_cents,status").eq("beneficiary_id", user!.id),
      ]);
      const pending = comm.data?.filter((c) => c.status === "pending").reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      const cleared = comm.data?.filter((c) => c.status === "cleared").reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      const total = comm.data?.reduce((a, c) => a + c.amount_cents, 0) ?? 0;
      return { promos: promos.data ?? [], customers: customers.count ?? 0, pending, cleared, total };
    },
  });

  return (
    <>
      <RoleDashboard
        title="Affiliate"
        subtitle="Your assigned promo code, conversions, and earnings"
        kpis={[
          { label: "Subscribers", value: String(data?.customers ?? 0), tone: "primary" },
          { label: "Pending", value: `$${((data?.pending ?? 0) / 100).toFixed(2)}`, tone: "warning" },
          { label: "Cleared", value: `$${((data?.cleared ?? 0) / 100).toFixed(2)}`, tone: "success" },
          { label: "Total Earnings", value: `$${((data?.total ?? 0) / 100).toFixed(2)}` },
        ]}
      />
      <PageBody>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Tag className="h-3.5 w-3.5" /> Your assigned promo codes ({data?.promos.length ?? 0})
          </div>
          {(data?.promos ?? []).length === 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">No promo codes assigned yet.</div>
          )}
          {(data?.promos ?? []).map((promo) => (
            <Link
              key={promo.id}
              to="/affiliate/my-code"
              className="block rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-card transition hover:shadow-glow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-3xl font-bold tracking-tight text-primary">{promo.code}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {Number(promo.discount_percent)}% off · {promo.usage_count} uses
                    {promo.campaign_label ? ` · ${promo.campaign_label}` : ""}
                    {promo.status !== "active" ? ` · ${promo.status}` : ""}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
