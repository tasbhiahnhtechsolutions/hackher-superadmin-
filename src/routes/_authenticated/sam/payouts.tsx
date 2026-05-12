import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/sam/payouts")({ component: () => <ComingSoon title="Payouts" subtitle="Your hierarchy's payout history" /> });
