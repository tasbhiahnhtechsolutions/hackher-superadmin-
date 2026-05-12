import { createFileRoute } from "@tanstack/react-router";
import { PromoCodeManager } from "@/components/promo-code-manager";

export const Route = createFileRoute("/_authenticated/sam/promo-codes")({
  component: () => (
    <PromoCodeManager
      title="Affiliate Promo Codes"
      subtitle="Create promo codes for affiliates within your hierarchy."
      affiliatePicker="descendants"
    />
  ),
});
