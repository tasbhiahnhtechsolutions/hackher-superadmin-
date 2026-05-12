import { createFileRoute } from "@tanstack/react-router";
import { TeamManagement } from "@/components/team-management";

export const Route = createFileRoute("/_authenticated/sam/managers")({
  component: () => <TeamManagement title="Managers" subtitle="Your direct managers" childRole="manager" />,
});
