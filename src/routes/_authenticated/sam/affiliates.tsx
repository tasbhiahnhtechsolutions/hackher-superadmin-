import { createFileRoute } from "@tanstack/react-router";
import { TeamManagement } from "@/components/team-management";

export const Route = createFileRoute("/_authenticated/sam/affiliates")({
  component: () => (
    <TeamManagement
      title="Affiliates"
      subtitle="All affiliates in your hierarchy"
      childRole="affiliate"
      recursive
      readOnly
    />
  ),
});
