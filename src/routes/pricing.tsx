import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — HackHer.ai" },
      { name: "description", content: "Choose a plan and start your subscription. All plans include premium features." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const search = Route.useSearch() as { ref?: string };
  const [promo, setPromo] = useState<string>("");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const checkout = useServerFn(createCheckoutSession);

  useEffect(() => {
    const ref = search.ref ?? new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      localStorage.setItem("hh_ref", ref);
      setPromo(ref);
    } else {
      const stored = localStorage.getItem("hh_ref");
      if (stored) setPromo(stored);
    }
  }, [search.ref]);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => (await supabase.from("plans").select("*").eq("is_active", true).order("price_cents")).data ?? [],
  });

  const start = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a plan");
      const r = await checkout({
        data: {
          email, fullName: name || undefined, planId: selected.id,
          promoCode: promo || undefined,
          origin: window.location.origin,
        },
      });
      if (!r.url) throw new Error("Failed to create checkout session");
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-brand shadow-glow" />
            <span className="text-lg font-semibold">HackHer<span className="text-primary">.ai</span></span>
          </Link>
          <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign in</Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Simple, transparent pricing</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Choose the plan that fits your team. Cancel anytime.</p>
          {promo && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs">
              Promo applied: <code className="font-mono font-semibold">{promo}</code>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="mt-12 text-center text-muted-foreground">Loading plans…</div>
        ) : !plans?.length ? (
          <div className="mt-12 text-center text-muted-foreground">No plans available yet. Check back soon.</div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {plans.map((p, i) => (
              <div key={p.id} className={`rounded-2xl border bg-card p-8 shadow-card ${i === 1 ? "border-primary shadow-glow" : "border-border/60"}`}>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">${(p.price_cents / 100).toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/{p.interval}</span>
                </div>
                {p.trial_days > 0 && <div className="mt-1 text-xs text-success">{p.trial_days}-day free trial</div>}
                <ul className="mt-6 space-y-2 text-sm">
                  {(Array.isArray(p.features) ? (p.features as string[]) : []).map((f, idx) => (
                    <li key={idx} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-success shrink-0" />{f}</li>
                  ))}
                </ul>
                <Button
                  className="mt-8 w-full"
                  variant={i === 1 ? "default" : "outline"}
                  disabled={!p.stripe_price_id}
                  onClick={() => setSelected({ id: p.id, name: p.name })}
                >
                  {p.stripe_price_id ? <>Get {p.name} <ArrowRight className="ml-2 h-4 w-4" /></> : "Coming soon"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Subscribe to {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div><Label>Promo code (optional)</Label><Input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="LAUNCH10" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={() => start.mutate()} disabled={start.isPending || !email}>
              {start.isPending ? "Redirecting…" : "Continue to checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
