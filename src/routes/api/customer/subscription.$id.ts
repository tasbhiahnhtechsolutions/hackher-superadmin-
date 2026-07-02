// GET /api/customer/subscription/:id — subscription status, renewal, plan, coupon
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

export const Route = createFileRoute("/api/customer/subscription/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ params }) => {
        const id = params.id;
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select(
            "id,status,current_period_end,trial_ends_at,amount_paid_cents,stripe_subscription_id,plan_id,promo_code_id,customer_id,created_at",
          )
          .or(`id.eq.${id},stripe_subscription_id.eq.${id}`)
          .maybeSingle();
        if (!sub) return jsonError(404, "subscription_not_found");
        const { data: plan } = sub.plan_id
          ? await supabaseAdmin
              .from("plans")
              .select("id,name,price_cents,currency,interval,trial_days")
              .eq("id", sub.plan_id)
              .maybeSingle()
          : { data: null };
        const { data: promo } = sub.promo_code_id
          ? await supabaseAdmin
              .from("promo_codes")
              .select("code,discount_percent,campaign_label")
              .eq("id", sub.promo_code_id)
              .maybeSingle()
          : { data: null };
        return jsonOk({
          id: sub.id,
          status: sub.status,
          stripe_subscription_id: sub.stripe_subscription_id,
          current_period_end: sub.current_period_end,
          trial_ends_at: sub.trial_ends_at,
          amount_paid_cents: sub.amount_paid_cents,
          created_at: sub.created_at,
          plan,
          coupon: promo
            ? {
                code: promo.code,
                discountPercent: Number(promo.discount_percent),
                campaign: promo.campaign_label,
              }
            : null,
        });
      },
    },
  },
});
