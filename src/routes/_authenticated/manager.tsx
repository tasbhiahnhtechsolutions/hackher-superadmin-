import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/manager")({
  component: ManagerPage,
});

function ManagerPage() {
  const { role } = useAuth();
  if (role && !["manager", "sam", "super_admin"].includes(role)) return <Navigate to={ROLE_HOME[role]} />;
  return (
    <RoleDashboard
      title="Manager"
      subtitle="Your affiliates and their performance"
      kpis={[
        { label: "Affiliates", value: "0" },
        { label: "Active Subscribers", value: "0", tone: "primary" },
        { label: "Pending Commissions", value: "$0", tone: "warning" },
        { label: "Cleared Earnings", value: "$0", tone: "success" },
      ]}
    />
  );
}
