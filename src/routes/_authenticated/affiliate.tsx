import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard } from "@/components/role-dashboard";

export const Route = createFileRoute("/_authenticated/affiliate")({
  component: AffiliatePage,
});

function AffiliatePage() {
  return (
    <RoleDashboard
      title="Affiliate"
      subtitle="Your promo codes, conversions, and earnings"
      kpis={[
        { label: "Active Promo Codes", value: "0" },
        { label: "Subscribers", value: "0", tone: "primary" },
        { label: "Pending Commissions", value: "$0", tone: "warning" },
        { label: "Total Earnings", value: "$0", tone: "success" },
      ]}
    />
  );
}
