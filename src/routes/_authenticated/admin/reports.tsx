import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/admin/reports")({ component: () => <ComingSoon title="Reports" subtitle="Revenue, conversions, payouts" /> });
