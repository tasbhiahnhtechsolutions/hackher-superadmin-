import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: PrefsPage,
});

type Prefs = Record<string, boolean>;

const FIELDS: Array<{
  section: string;
  items: Array<{ key: string; label: string; desc?: string }>;
}> = [
  {
    section: "Email notifications",
    items: [
      { key: "email_payouts", label: "Payouts", desc: "When your payout is sent or fails." },
      { key: "email_commissions", label: "Commissions", desc: "When commissions clear." },
      {
        key: "email_subscription",
        label: "Subscription & billing",
        desc: "Receipts, failed payments, cancellations.",
      },
      { key: "email_security", label: "Security", desc: "Password resets, login alerts." },
      {
        key: "email_admin_alerts",
        label: "Admin alerts",
        desc: "(Admins only) refunds, chargebacks, system events.",
      },
      {
        key: "email_marketing",
        label: "Product updates",
        desc: "Occasional product news. Off by default.",
      },
    ],
  },
  {
    section: "In-app notifications",
    items: [
      { key: "inapp_payouts", label: "Payouts" },
      { key: "inapp_commissions", label: "Commissions" },
      { key: "inapp_subscription", label: "Subscription & billing" },
      { key: "inapp_admin_alerts", label: "Admin alerts" },
    ],
  },
];

function PrefsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs(data as unknown as Prefs);
        else setPrefs({});
      });
  }, [user]);

  const update = async (key: string, value: boolean) => {
    if (!user) return;
    setPrefs((p) => ({ ...(p ?? {}), [key]: value }));
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: user.id, [key]: value, updated_at: new Date().toISOString() } as never,
        { onConflict: "user_id" } as never,
      );
    if (error) toast.error(error.message);
  };

  if (!prefs) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader title="Notification preferences" subtitle="Choose what we send you and where." />
      {FIELDS.map((s) => (
        <Card key={s.section}>
          <CardHeader>
            <CardTitle className="text-base">{s.section}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.items.map((it) => (
              <div key={it.key} className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor={it.key} className="text-sm font-medium">
                    {it.label}
                  </Label>
                  {it.desc && <div className="text-xs text-muted-foreground mt-0.5">{it.desc}</div>}
                </div>
                <Switch
                  id={it.key}
                  checked={prefs[it.key] ?? true}
                  onCheckedChange={(v) => update(it.key, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
