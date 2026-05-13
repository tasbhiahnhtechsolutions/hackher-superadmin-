// GET /api/customer/plans — list active subscription plans (public, internal Customer Portal)
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, corsPreflight } from "@/lib/api-cors.server";

export const Route = createFileRoute("/api/customer/plans")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("plans")
          .select("id,name,description,price_cents,currency,interval,trial_days,features")
          .eq("is_active", true)
          .order("price_cents");
        return jsonOk({ plans: data ?? [] });
      },
    },
  },
});
