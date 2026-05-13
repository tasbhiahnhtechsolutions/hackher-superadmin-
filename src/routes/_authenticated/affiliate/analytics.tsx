import { createFileRoute } from "@tanstack/react-router";
import { CampaignAnalytics } from "@/components/campaign-analytics";

export const Route = createFileRoute("/_authenticated/affiliate/analytics")({
  component: () => (
    <div className="p-6 md:p-8">
      <CampaignAnalytics
        title="Campaign analytics"
        subtitle="Revenue, conversions and plan mix for your promo codes."
      />
    </div>
  ),
});
