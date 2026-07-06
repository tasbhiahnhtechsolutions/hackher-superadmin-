import { createFileRoute } from "@tanstack/react-router";
import { ReportsView } from "@/components/reports-view";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: () => <ReportsView role="super_admin" />,
});
