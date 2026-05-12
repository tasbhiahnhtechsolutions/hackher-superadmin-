// POST /api/v1/coupons/validate — { code: string } -> { valid, discount_percent, affiliate_id? }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, jsonOk, jsonError, corsPreflight } from "@/lib/api-auth.server";

const Schema = z.object({ code: z.string().min(3).max(30).regex(/^[A-Za-z0-9]+$/) });

export const Route = createFileRoute("/api/v1/coupons/validate")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if (!auth.ok) return auth.response;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonError(400, "invalid_json"); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonError(400, "invalid_input", parsed.error.message);

        const { data: promo } = await supabaseAdmin
          .from("promo_codes").select("*").ilike("code", parsed.data.code).maybeSingle();
        if (!promo) return jsonOk({ valid: false, reason: "not_found" });
        if (promo.status !== "active") return jsonOk({ valid: false, reason: "inactive" });
        if (promo.ends_at && new Date(promo.ends_at) < new Date()) return jsonOk({ valid: false, reason: "expired" });
        if (promo.usage_limit && promo.usage_count >= promo.usage_limit) return jsonOk({ valid: false, reason: "limit_reached" });
        return jsonOk({
          valid: true,
          code: promo.code,
          discount_percent: Number(promo.discount_percent),
          affiliate_id: promo.affiliate_id,
          stripe_promo_id: promo.stripe_promo_id,
        });
      },
    },
  },
});
