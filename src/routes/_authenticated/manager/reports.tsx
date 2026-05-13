import { createFileRoute } from "@tanstack/react-router";
import { CampaignAnalytics } from "@/components/campaign-analytics";

export const Route = createFileRoute("/_authenticated/manager/reports")({
  component: () => (
    <div className="p-6 md:p-8">
      <CampaignAnalytics
        title="Manager · Campaign reports"
        subtitle="Affiliate campaign leaderboard, ROI and growth across your team."
      />
    </div>
  ),
});
