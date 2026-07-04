// POST /api/customer/coupon/validate
// Body: { coupon: string, planId?: string } -> { valid, discount, affiliate, finalPrice }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyAndDecodeToken } from "./subscription.create";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

const Schema = z.object({
  coupon: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9]+$/),
  planId: z.string().uuid().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/api/customer/coupon/validate")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "invalid_json");
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonError(400, "invalid_input", parsed.error.message);

        const { data: promo } = await supabaseAdmin
          .from("promo_codes")
          .select("*")
          .ilike("code", parsed.data.coupon)
          .maybeSingle();

        if (!promo) return jsonOk({ valid: false, reason: "not_found" });
        if (promo.status !== "active") return jsonOk({ valid: false, reason: "inactive" });
        if (promo.ends_at && new Date(promo.ends_at) < new Date())
          return jsonOk({ valid: false, reason: "expired" });
        if (promo.usage_limit && promo.usage_count >= promo.usage_limit)
          return jsonOk({ valid: false, reason: "limit_reached" });

        // Check per-customer limit if token is passed
        if (promo.limit_per_customer && parsed.data.token) {
          try {
            const decoded = await verifyAndDecodeToken(parsed.data.token);
            const { data: customer } = await supabaseAdmin
              .from("customers")
              .select("id")
              .or(`django_user_id.eq.${decoded.id},email.eq.${decoded.email}`)
              .maybeSingle();

            if (customer) {
              const { count } = await supabaseAdmin
                .from("subscriptions")
                .select("*", { count: "exact", head: true })
                .eq("customer_id", customer.id)
                .eq("promo_code_id", promo.id);

              if (count && count >= promo.limit_per_customer) {
                return jsonOk({ valid: false, reason: "limit_per_customer_reached" });
              }
            }
          } catch (err) {
            console.error("[coupon validate token verify fail]", err);
            return jsonError(401, "unauthorized", (err as Error).message);
          }
        }

        let affiliateName: string | null = null;
        if (promo.affiliate_id) {
          const { data: aff } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", promo.affiliate_id)
            .maybeSingle();
          affiliateName = aff?.full_name ?? null;
        }

        let finalPriceCents: number | null = null;
        let originalPriceCents: number | null = null;
        let currency = "usd";
        if (parsed.data.planId) {
          const { data: plan } = await supabaseAdmin
            .from("plans")
            .select("price_cents,currency")
            .eq("id", parsed.data.planId)
            .maybeSingle();
          if (plan) {
            originalPriceCents = plan.price_cents;
            currency = plan.currency;
            finalPriceCents = Math.round(
              plan.price_cents * (1 - Number(promo.discount_percent) / 100),
            );
          }
        }

        return jsonOk({
          valid: true,
          code: promo.code,
          discount: Number(promo.discount_percent),
          discountPercent: Number(promo.discount_percent),
          affiliate: affiliateName,
          affiliateName,
          campaign: promo.campaign_label ?? null,
          expiresAt: promo.ends_at ?? null,
          originalPriceCents,
          finalPriceCents,
          currency,
        });
      },
    },
  },
});
