import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({ meta: [{ title: "Subscription confirmed — HackHer.ai" }] }),
  component: SuccessPage,
});

function SuccessPage() {
  useEffect(() => {
    localStorage.removeItem("hh_ref");
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">You're in</h1>
        <p className="mt-3 text-muted-foreground">
          Your subscription is being activated. You'll receive a confirmation email shortly.
        </p>
        <Link
          to="/"
          className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
