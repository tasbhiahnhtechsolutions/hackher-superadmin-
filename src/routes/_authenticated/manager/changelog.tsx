import { createFileRoute } from "@tanstack/react-router";
import { ChangeLogsView } from "@/components/changelogs-view";

export const Route = createFileRoute("/_authenticated/manager/changelog")({
  component: ManagerChangelogRoute,
});

function ManagerChangelogRoute() {
  return <ChangeLogsView role="manager" />;
}
