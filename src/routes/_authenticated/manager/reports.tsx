import { createFileRoute } from "@tanstack/react-router";
import { ReportsView } from "@/components/reports-view";

export const Route = createFileRoute("/_authenticated/manager/reports")({
  component: () => <ReportsView role="manager" />,
});
