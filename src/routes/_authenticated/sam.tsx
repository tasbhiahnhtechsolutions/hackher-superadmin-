import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/sam")({
  component: SamPage,
});

function SamPage() {
  const { role } = useAuth();
  if (role && role !== "sam" && role !== "super_admin") return <Navigate to={ROLE_HOME[role]} />;
  return (
    <RoleDashboard
      title="Super Admin Manager"
      subtitle="Your hierarchy of managers and affiliates"
      kpis={[
        { label: "Managers", value: "0" },
        { label: "Affiliates", value: "0" },
        { label: "Subscribers", value: "0", tone: "primary" },
        { label: "Your Earnings", value: "$0", tone: "success" },
      ]}
    />
  );
}
