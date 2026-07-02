import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/manager/subscribers")({
  component: () => (
    <ComingSoon title="Subscribers" subtitle="Customers attributed to your affiliates" />
  ),
});
