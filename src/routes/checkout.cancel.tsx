import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";

export const Route = createFileRoute("/checkout/cancel")({
  head: () => ({ meta: [{ title: "Checkout canceled — HackHer.ai" }] }),
  component: CancelPage,
});

function CancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md text-center">
        <XCircle className="mx-auto h-16 w-16 text-muted-foreground" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Checkout canceled</h1>
        <p className="mt-3 text-muted-foreground">No charge was made. You can try again any time.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/pricing" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">View plans</Link>
          <Link to="/" className="rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-accent">Home</Link>
        </div>
      </div>
    </div>
  );
}
