import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { role } = useAuth();
  if (role && role !== "super_admin") return <Navigate to={ROLE_HOME[role]} />;
  return <Outlet />;
}
