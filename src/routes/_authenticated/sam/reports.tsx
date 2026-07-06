import { createFileRoute } from "@tanstack/react-router";
import { ReportsView } from "@/components/reports-view";

export const Route = createFileRoute("/_authenticated/sam/reports")({
  component: () => <ReportsView role="sam" />,
});
