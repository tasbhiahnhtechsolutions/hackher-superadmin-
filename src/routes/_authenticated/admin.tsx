import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { role } = useAuth();
  if (role && role !== "super_admin") return <Navigate to={ROLE_HOME[role]} />;
  return (
    <RoleDashboard
      title="Super Admin"
      subtitle="Platform-wide revenue, affiliates, and subscriptions"
      kpis={[
        { label: "MRR", value: "$0", trend: "+0%", tone: "primary" },
        { label: "Active Subscriptions", value: "0", trend: "—", tone: "default" },
        { label: "Pending Payouts", value: "$0", trend: "—", tone: "warning" },
        { label: "Cleared Commissions", value: "$0", trend: "—", tone: "success" },
      ]}
    />
  );
}
