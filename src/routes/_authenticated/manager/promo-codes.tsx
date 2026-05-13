import { createFileRoute } from "@tanstack/react-router";
import { PromoCodeManager } from "@/components/promo-code-manager";

export const Route = createFileRoute("/_authenticated/manager/promo-codes")({
  component: () => (
    <PromoCodeManager
      title="Promo Codes"
      subtitle="Create and manage promo codes for your affiliates."
      affiliatePicker="affiliate"
    />
  ),
});
