import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  syncPlanToStripe,
  syncPlanActionToDjango,
  deletePlanServerFn,
} from "@/lib/stripe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/page-header";
import { Plus, RefreshCw, Pencil, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  component: PlansPage,
});

interface PlanForm {
  id?: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  interval: "month" | "year";
  trial_days: number;
  features: string;
  is_active: boolean;
  actual_price: string;
  discount_percent: number;
  guest_limit: number;
  host_limit: number;
  badge_text: string;
  is_featured: boolean;
  billing_subtext: string;
  package_name: string;
  extra_host_price: string;
  order: number;
}

const empty: PlanForm = {
  name: "",
  description: "",
  price_cents: 0,
  currency: "usd",
  interval: "month",
  trial_days: 0,
  features: "",
  is_active: true,
  actual_price: "",
  discount_percent: 0,
  guest_limit: 1,
  host_limit: 1,
  badge_text: "",
  is_featured: false,
  billing_subtext: "",
  package_name: "",
  extra_host_price: "",
  order: 0,
};

function PlansPage() {
  const qc = useQueryClient();
  const sync = useServerFn(syncPlanToStripe);
  const syncDjango = useServerFn(syncPlanActionToDjango);
  const deletePlanFn = useServerFn(deletePlanServerFn);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(empty);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: PlanForm) => {
      const featuresList = f.features
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const featuresJson = {
        features_list: featuresList,
        actual_price: f.actual_price || (f.price_cents / 100).toFixed(2),
        discount_percent: Number(f.discount_percent || 0),
        guest_limit: Number(f.guest_limit || 1),
        host_limit: Number(f.host_limit || 1),
        free_trial_days: Number(f.trial_days || 0),
        badge_text: f.badge_text || null,
        is_featured: !!f.is_featured,
        billing_subtext: f.billing_subtext || null,
        package_name: f.package_name || f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        extra_host_price: f.extra_host_price || "0.00",
        order: Number(f.order || 0),
      };

      const payload = {
        name: f.name,
        description: f.description || null,
        price_cents: f.price_cents,
        currency: f.currency,
        interval: f.interval,
        trial_days: f.trial_days,
        features: featuresJson as any,
        is_active: f.is_active,
      };

      if (f.id) {
        const { error } = await supabase.from("plans").update(payload).eq("id", f.id);
        if (error) throw error;
        return { id: f.id, isNew: false };
      } else {
        const { data, error } = await supabase.from("plans").insert(payload).select("id").single();
        if (error) throw error;
        return { id: data.id, isNew: true };
      }
    },
    onSuccess: async ({ id, isNew }) => {
      toast.success("Plan saved. Syncing to Stripe…");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["plans"] });
      try {
        const r = await sync({ data: { planId: id } });
        if (r.synced) toast.success("Synced to Stripe");
        else toast.warning(r.reason ?? "Stripe sync skipped");
        qc.invalidateQueries({ queryKey: ["plans"] });

        // Fetch latest plan details to sync to Django
        const { data: updatedPlan } = await supabase
          .from("plans")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (updatedPlan) {
          toast.info("Syncing plan to Django…");
          const djSync = await syncDjango({
            data: {
              action: isNew ? "create" : "update",
              planData: {
                id: updatedPlan.id,
                name: updatedPlan.name,
                description: updatedPlan.description,
                price_cents: updatedPlan.price_cents,
                currency: updatedPlan.currency,
                interval: updatedPlan.interval,
                trial_days: updatedPlan.trial_days,
                features: updatedPlan.features,
                is_active: updatedPlan.is_active,
                stripe_product_id: updatedPlan.stripe_product_id,
                stripe_price_id: updatedPlan.stripe_price_id,
              },
            },
          });
          if (djSync.success) toast.success("Synced to Django");
          else toast.error(`Django sync failed: ${djSync.reason}`);
        }
      } catch (e: unknown) {
        toast.error(`Sync: ${(e as Error).message}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      return await deletePlanFn({ data: { planId: id } });
    },
    onSuccess: () => {
      toast.success("Plan deleted and archived");
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => {
      toast.error(`Delete failed: ${e.message}`);
    },
  });

  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this plan? This will remove it from the DB and archive it in Stripe & Django.",
      )
    ) {
      deletePlan.mutate(id);
    }
  };

  const resync = async (id: string) => {
    try {
      const r = await sync({ data: { planId: id } });
      if (r.synced) toast.success("Re-synced to Stripe");
      else toast.warning(r.reason ?? "Skipped Stripe");
      qc.invalidateQueries({ queryKey: ["plans"] });

      // Fetch plan to sync to Django
      const { data: updatedPlan } = await supabase
        .from("plans")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (updatedPlan) {
        toast.info("Re-syncing plan to Django…");
        const djSync = await syncDjango({
          data: {
            action: "update",
            planData: {
              id: updatedPlan.id,
              name: updatedPlan.name,
              description: updatedPlan.description,
              price_cents: updatedPlan.price_cents,
              currency: updatedPlan.currency,
              interval: updatedPlan.interval,
              trial_days: updatedPlan.trial_days,
              features: updatedPlan.features,
              is_active: updatedPlan.is_active,
              stripe_product_id: updatedPlan.stripe_product_id,
              stripe_price_id: updatedPlan.stripe_price_id,
            },
          },
        });
        if (djSync.success) toast.success("Re-synced to Django");
        else toast.error(`Django sync failed: ${djSync.reason}`);
      }
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const openNew = () => {
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (p: any) => {
    let featsStr = "";
    let actual_price = "";
    let discount_percent = 0;
    let guest_limit = 1;
    let host_limit = 1;
    let badge_text = "";
    let is_featured = false;
    let billing_subtext = "";
    let package_name = "";
    let extra_host_price = "";
    let order = 0;

    if (p.features && typeof p.features === "object" && !Array.isArray(p.features)) {
      const fObj = p.features as any;
      featsStr = Array.isArray(fObj.features_list) ? fObj.features_list.join("\n") : "";
      actual_price = fObj.actual_price || "";
      discount_percent = fObj.discount_percent ?? 0;
      guest_limit = fObj.guest_limit ?? 1;
      host_limit = fObj.host_limit ?? 1;
      badge_text = fObj.badge_text || "";
      is_featured = !!fObj.is_featured;
      billing_subtext = fObj.billing_subtext || "";
      package_name = fObj.package_name || "";
      extra_host_price = fObj.extra_host_price || "";
      order = fObj.order ?? 0;
    } else if (Array.isArray(p.features)) {
      featsStr = p.features.join("\n");
    }

    setForm({
      id: p.id,
      name: p.name,
      description: p.description || "",
      price_cents: p.price_cents,
      currency: p.currency,
      interval: p.interval,
      trial_days: p.trial_days,
      features: featsStr,
      is_active: p.is_active,
      actual_price,
      discount_percent,
      guest_limit,
      host_limit,
      badge_text,
      is_featured,
      billing_subtext,
      package_name,
      extra_host_price,
      order,
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Subscription Plans"
        subtitle="Create plans and sync them to Stripe"
        action={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            New plan
          </Button>
        }
      />
      <PageBody>
        <div className="rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !plans?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No plans yet. Create your first.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      ${(p.price_cents / 100).toFixed(2)} {p.currency.toUpperCase()}
                    </TableCell>
                    <TableCell className="capitalize">{p.interval}</TableCell>
                    <TableCell>{p.trial_days} days</TableCell>
                    <TableCell>
                      {p.stripe_price_id ? (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" /> Synced
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not synced</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.is_active ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resync(p.id)}
                        title="Re-sync to Stripe & Django"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(p)}
                        title="Edit plan"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit plan" : "New plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Price (cents)</Label>
                <Input
                  type="number"
                  value={form.price_cents}
                  onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toLowerCase() })}
                />
              </div>
              <div>
                <Label>Interval</Label>
                <Select
                  value={form.interval}
                  onValueChange={(v) => setForm({ ...form, interval: v as "month" | "year" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Package Name / Slug (Django key)</Label>
                <Input
                  value={form.package_name}
                  onChange={(e) => setForm({ ...form, package_name: e.target.value })}
                  placeholder="e.g. founders_circle"
                />
              </div>
              <div>
                <Label>Order</Label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Actual Price (e.g. 19.99)</Label>
                <Input
                  value={form.actual_price}
                  onChange={(e) => setForm({ ...form, actual_price: e.target.value })}
                />
              </div>
              <div>
                <Label>Discount Percent</Label>
                <Input
                  type="number"
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Guest Limit</Label>
                <Input
                  type="number"
                  value={form.guest_limit}
                  onChange={(e) => setForm({ ...form, guest_limit: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Host Limit</Label>
                <Input
                  type="number"
                  value={form.host_limit}
                  onChange={(e) => setForm({ ...form, host_limit: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Extra Host Price</Label>
                <Input
                  value={form.extra_host_price}
                  onChange={(e) => setForm({ ...form, extra_host_price: e.target.value })}
                  placeholder="e.g. 3.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Badge Text</Label>
                <Input
                  value={form.badge_text}
                  onChange={(e) => setForm({ ...form, badge_text: e.target.value })}
                  placeholder="e.g. Popular"
                />
              </div>
              <div>
                <Label>Billing Subtext</Label>
                <Input
                  value={form.billing_subtext}
                  onChange={(e) => setForm({ ...form, billing_subtext: e.target.value })}
                  placeholder="e.g. billed annually"
                />
              </div>
            </div>
            <div>
              <Label>Trial days</Label>
              <Input
                type="number"
                value={form.trial_days}
                onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Features (one per line)</Label>
              <Textarea
                rows={4}
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_featured}
                  onCheckedChange={(v) => setForm({ ...form, is_featured: v })}
                />
                <Label>Featured Plan</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save & sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
