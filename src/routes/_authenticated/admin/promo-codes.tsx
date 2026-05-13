import { createFileRoute } from "@tanstack/react-router";
import { PromoCodeManager } from "@/components/promo-code-manager";

export const Route = createFileRoute("/_authenticated/admin/promo-codes")({
  component: () => (
    <PromoCodeManager
      title="Promo Codes"
      subtitle="Create promo codes for any affiliate. Codes always belong to an affiliate."
      affiliatePicker="sam+manager+affiliate"
    />
  ),
});
