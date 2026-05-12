import { createFileRoute } from "@tanstack/react-router";
import { TeamManagement } from "@/components/team-management";

export const Route = createFileRoute("/_authenticated/admin/sams")({
  component: () => (
    <TeamManagement
      title="Super Admin Managers"
      subtitle="Create and manage SAMs — they recruit Managers, who recruit Affiliates."
      childRole="sam"
    />
  ),
});
