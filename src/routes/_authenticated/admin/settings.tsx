import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageBody } from "@/components/page-header";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: SettingsPage });

interface Settings {
  platform_name: string;
  support_email: string;
  commission_hold_days: number;
  default_affiliate_rate: number;
  default_manager_rate: number;
  default_sam_rate: number;
}

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () =>
      (await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle()).data,
  });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (data)
      setForm({
        platform_name: data.platform_name,
        support_email: data.support_email,
        commission_hold_days: data.commission_hold_days,
        default_affiliate_rate: Number(data.default_affiliate_rate),
        default_manager_rate: Number(data.default_manager_rate),
        default_sam_rate: Number(data.default_sam_rate),
      });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase.from("app_settings").update(form).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form)
    return (
      <PageBody>
        <div className="text-muted-foreground">Loading…</div>
      </PageBody>
    );

  const pctInput = (val: number, set: (n: number) => void) => (
    <Input
      type="number"
      step="0.5"
      min={0}
      max={50}
      value={Number((val * 100).toFixed(2))}
      onChange={(e) => set(Number(e.target.value) / 100)}
    />
  );

  return (
    <>
      <PageHeader title="Platform Settings" subtitle="Defaults applied across the platform" />
      <PageBody>
        <div className="max-w-2xl space-y-6 rounded-xl border border-border/60 bg-card p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Platform name</Label>
              <Input
                value={form.platform_name}
                onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Support email</Label>
              <Input
                type="email"
                value={form.support_email}
                onChange={(e) => setForm({ ...form, support_email: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Commission hold (days)</Label>
            <Input
              type="number"
              min={0}
              max={180}
              value={form.commission_hold_days}
              onChange={(e) => setForm({ ...form, commission_hold_days: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Time after a sale before commissions clear and become payable.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Default affiliate %</Label>
              {pctInput(form.default_affiliate_rate, (n) =>
                setForm({ ...form, default_affiliate_rate: n }),
              )}
            </div>
            <div>
              <Label>Default manager %</Label>
              {pctInput(form.default_manager_rate, (n) =>
                setForm({ ...form, default_manager_rate: n }),
              )}
            </div>
            <div>
              <Label>Default SAM %</Label>
              {pctInput(form.default_sam_rate, (n) => setForm({ ...form, default_sam_rate: n }))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter values as percentages (e.g. 20 = 20%). Per-user rates on profiles override these
            defaults.
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </PageBody>
    </>
  );
}
