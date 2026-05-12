import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth, ROLE_HOME, type AppRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (!role) return <Navigate to="/login" />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function useRequireRole(allowed: AppRole[]) {
  const { role } = useAuth();
  if (!role) return { allowed: false, redirect: "/login" as const };
  return {
    allowed: allowed.includes(role),
    redirect: ROLE_HOME[role],
  };
}
