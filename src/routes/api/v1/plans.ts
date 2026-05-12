// GET /api/v1/plans — list active subscription plans (requires API key)
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, jsonOk, corsPreflight } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/plans")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if (!auth.ok) return auth.response;
        const { data } = await supabaseAdmin.from("plans").select("id,name,description,price_cents,currency,interval,trial_days,features,stripe_price_id").eq("is_active", true).order("price_cents");
        return jsonOk({ plans: data ?? [] });
      },
    },
  },
});
