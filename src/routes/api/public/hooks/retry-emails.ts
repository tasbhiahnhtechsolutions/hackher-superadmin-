// POST /api/public/hooks/retry-emails — called by pg_cron every 5 minutes.
import { createFileRoute } from "@tanstack/react-router";
import { retryFailedEmails } from "@/lib/email/send.server";

export const Route = createFileRoute("/api/public/hooks/retry-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer /, "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apiKey || !expected || apiKey !== expected)
          return new Response("unauthorized", { status: 401 });
        const result = await retryFailedEmails();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
