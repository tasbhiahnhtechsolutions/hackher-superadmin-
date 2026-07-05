import { createFileRoute } from "@tanstack/react-router";
import { PromoCodeManager } from "@/components/promo-code-manager";

export const Route = createFileRoute("/_authenticated/affiliate/my-code")({
  component: () => (
    <PromoCodeManager
      title="My Promo Codes"
      subtitle="Codes assigned to you or created by you. Copy and share with your audience."
      affiliatePicker="self"
    />
  ),
});
