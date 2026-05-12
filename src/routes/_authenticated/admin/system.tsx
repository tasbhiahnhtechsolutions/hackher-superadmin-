import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getSystemHealth } from "@/lib/analytics.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/system")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: SystemPage,
});

function SystemPage() {
  const fetchHealth = useServerFn(getSystemHealth);
  const [data, setData] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await fetchHealth()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); /* eslint-disable-next-line */ }, []);

  const webhookHealthy = data && data.webhooks_failed_24h === 0;
  const emailHealthy = data && Number(data.emails_failed_24h ?? 0) < Number(data.emails_24h ?? 0) * 0.05;
  const fraudOk = data && Number(data.open_fraud_flags ?? 0) < 10;
  const loginOk = data && Number(data.failed_logins_1h ?? 0) < 50;

  const Stat = ({ label, value, healthy, hint }: { label: string; value: string | number; healthy?: boolean; hint?: string }) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          {healthy === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {healthy === false && <AlertTriangle className="h-4 w-4 text-amber-500" />}
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        subtitle="Live operational metrics across webhooks, email, fraud, and auth"
        action={<Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <Stat label="Webhooks 24h" value={data?.webhooks_24h ?? "—"} healthy={webhookHealthy ?? undefined} hint={`${data?.webhooks_failed_24h ?? 0} failed`} />
        <Stat label="Emails 24h" value={data?.emails_24h ?? "—"} healthy={emailHealthy ?? undefined} hint={`${data?.emails_failed_24h ?? 0} failed · ${data?.emails_pending_retry ?? 0} pending`} />
        <Stat label="Open fraud flags" value={data?.open_fraud_flags ?? "—"} healthy={fraudOk ?? undefined} />
        <Stat label="Failed logins 1h" value={data?.failed_logins_1h ?? "—"} healthy={loginOk ?? undefined} />
        <Stat label="API calls 24h" value={data?.api_calls_24h ?? "—"} />
        <Stat label="Pending commissions" value={data ? `$${(Number(data.commissions_pending_cents) / 100).toFixed(2)}` : "—"} />
        <Stat label="Cleared commissions" value={data ? `$${(Number(data.commissions_cleared_cents) / 100).toFixed(2)}` : "—"} />
      </div>
    </div>
  );
}
