import { createFileRoute } from "@tanstack/react-router";
import { TeamManagement } from "@/components/team-management";

export const Route = createFileRoute("/_authenticated/manager/affiliates")({
  component: () => (
    <TeamManagement title="Affiliates" subtitle="Your direct affiliates" childRole="affiliate" />
  ),
});
