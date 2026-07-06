import { createFileRoute } from "@tanstack/react-router";
import { ChangeLogsView } from "@/components/changelogs-view";

export const Route = createFileRoute("/_authenticated/sam/changelog")({
  component: SamChangelogRoute,
});

function SamChangelogRoute() {
  return <ChangeLogsView role="sam" />;
}
