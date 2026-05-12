import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/admin/settings")({ component: () => <ComingSoon title="Settings" subtitle="Platform configuration" /> });
