import { createFileRoute } from "@tanstack/react-router";
import { ChangeLogsView } from "@/components/changelogs-view";

export const Route = createFileRoute("/_authenticated/admin/changelog")({
  component: AdminChangelogRoute,
});

function AdminChangelogRoute() {
  return <ChangeLogsView role="super_admin" />;
}
