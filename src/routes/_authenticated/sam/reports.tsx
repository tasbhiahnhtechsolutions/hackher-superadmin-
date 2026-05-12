import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/sam/reports")({ component: () => <ComingSoon title="Reports" /> });
