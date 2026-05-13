import { createFileRoute } from "@tanstack/react-router";
import { PromoCodeManager } from "@/components/promo-code-manager";

export const Route = createFileRoute("/_authenticated/affiliate/my-code")({
  component: () => (
    <PromoCodeManager
      title="My Promo Codes"
      subtitle="Codes assigned to you by your manager. Copy and share with your audience."
      affiliatePicker="self"
      readOnly
    />
  ),
});
