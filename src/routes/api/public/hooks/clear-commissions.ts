// POST /api/public/hooks/clear-commissions
// Called daily by pg_cron. Auth via Supabase apikey header.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/clear-commissions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer /, "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { data, error } = await supabaseAdmin.rpc("clear_due_commissions" as never);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return new Response(JSON.stringify({ cleared: data ?? 0 }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});
