import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sam")({
  component: SamLayout,
});

function SamLayout() {
  const { role } = useAuth();
  if (role && role !== "sam" && role !== "super_admin") return <Navigate to={ROLE_HOME[role]} />;
  return <Outlet />;
}
