import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { ArrowRight, ShieldCheck, Users, Zap, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HackHer.ai Affiliate Portal — Manage affiliates, commissions, and growth" },
      { name: "description", content: "Premium affiliate management platform for HackHer.ai. Track commissions, payouts, promo codes, and subscriptions in one place." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (user && role) {
    return <Navigate to={ROLE_HOME[role]} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-brand shadow-glow" />
            <span className="text-lg font-semibold tracking-tight">HackHer<span className="text-primary">.ai</span></span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elegant hover:opacity-90">
              Sign in <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-24 pt-20 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground glass">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Affiliate Portal · v1.0
        </div>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight md:text-7xl">
          Affiliate revenue,<br />
          <span className="bg-gradient-brand bg-clip-text text-transparent">engineered for scale</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Manage affiliates, promo codes, commissions, and Stripe subscriptions across a multi-tier hierarchy — with enterprise-grade security baked in.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/signup" className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-elegant hover:opacity-90">
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="inline-flex items-center rounded-md border border-border bg-card/50 px-6 py-3 text-sm font-medium hover:bg-accent glass">
            Sign in
          </Link>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-4">
          {[
            { icon: Users, title: "Multi-tier hierarchy", desc: "SAM → Manager → Affiliate" },
            { icon: Zap, title: "Promo engine", desc: "Stripe-synced coupons" },
            { icon: BarChart3, title: "Commission tracking", desc: "30-day hold + payout" },
            { icon: ShieldCheck, title: "Enterprise security", desc: "RLS · RBAC · audit logs" },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border/60 bg-card p-5 text-left shadow-card">
              <f.icon className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold">{f.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
