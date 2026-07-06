import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HackHer.ai Affiliate Portal — Manage affiliates, commissions, and growth" },
      {
        name: "description",
        content:
          "Premium affiliate management platform for HackHer.ai. Track commissions, payouts, promo codes, and subscriptions in one place.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (user && role) {
    return <Navigate to={ROLE_HOME[role]} />;
  }

  return <Navigate to="/login" />;
}
