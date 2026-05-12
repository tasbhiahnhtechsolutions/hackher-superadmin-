import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/manager")({
  component: ManagerLayout,
});

function ManagerLayout() {
  const { role } = useAuth();
  if (role && !["manager", "sam", "super_admin"].includes(role)) return <Navigate to={ROLE_HOME[role]} />;
  return <Outlet />;
}
