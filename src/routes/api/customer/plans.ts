/* eslint-disable @typescript-eslint/no-explicit-any */
// GET/POST/PATCH/DELETE /api/customer/plans — REST API for plan operations.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";
import Stripe from "stripe";

async function syncPlanToDjango(action: "create" | "update" | "delete", payload: any) {
  const djangoApiUrl = process.env.DJANGO_API_URL;
  const s2sSecret = process.env.SUPABASE_S2S_API_KEY || process.env.DJANGO_S2S_SECRET;
  const syncUrl =
    process.env.DJANGO_SYNC_PACKAGE_URL ||
    (djangoApiUrl ? `${djangoApiUrl.replace(/\/$/, "")}/internal/v1/sync-package/` : null);

  if (!syncUrl) {
    console.error("syncPlanToDjango: Django sync URL not configured");
    return;
  }

  try {
    console.log(`Sending S2S sync-package to Django (${action}): ${syncUrl}`, payload);
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(s2sSecret
          ? {
            Authorization: `Bearer ${s2sSecret}`,
            "X-API-Key": s2sSecret,
          }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Django sync-package failed: ${res.status} ${res.statusText} - ${text}`);
    } else {
      console.log(`Django sync-package succeeded: ${res.status}`);
    }
  } catch (err) {
    console.error("Django sync-package error:", err);
  }
}

// Supported billing_interval values and their Stripe equivalents:
//   "month"          → monthly
//   "year"           → yearly
//   "every_3_months" → quarterly (3 months)
function getStripeRecurring(interval: string): Stripe.PriceCreateParams.Recurring {
  if (interval === "every_3_months") {
    return { interval: "month", interval_count: 3 };
  }
  if (interval === "year") {
    return { interval: "year" };
  }
  // default: month
  return { interval: "month" };
}

export const Route = createFileRoute("/api/customer/plans")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      // GET /api/customer/plans — List plans
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const format = url.searchParams.get("format");
          const all = url.searchParams.get("all") === "true";

          if (format === "django" || all) {
            // Retrieve all plans (both active and inactive) for admin/django sync context
            const { data: plans, error: fetchErr } = await supabaseAdmin
              .from("plans")
              .select("*")
              .order("created_at", { ascending: false });

            if (fetchErr || !plans) {
              return jsonError(
                500,
                "database_error",
                `Failed to fetch plans: ${fetchErr?.message}`,
              );
            }

            const formattedPlans = plans.map((plan) => {
              const featuresObj =
                typeof plan.features === "object" && plan.features !== null
                  ? (plan.features as any)
                  : { features_list: Array.isArray(plan.features) ? plan.features : [] };

              return {
                id: plan.id,
                action: "list",
                package_name:
                  featuresObj.package_name || plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                stripe_product_id: plan.stripe_product_id || null,
                stripe_default_price_id: plan.stripe_price_id || null,
                price: Number((plan.price_cents / 100).toFixed(2)),
                actual_price: Number(
                  Number(featuresObj.actual_price || plan.price_cents / 100).toFixed(2),
                ),
                discount_percent: Number(featuresObj.discount_percent ?? 0),
                guest_limit: Number(featuresObj.guest_limit ?? 1),
                host_limit: Number(featuresObj.host_limit ?? 1),
                extra_host_price: Number(Number(featuresObj.extra_host_price ?? 0).toFixed(2)),
                free_trial_days: Number(featuresObj.free_trial_days ?? plan.trial_days ?? 0),
                order: Number(featuresObj.order ?? 0),
                badge_text: featuresObj.badge_text || null,
                is_featured: !!featuresObj.is_featured,
                description: plan.description || "",
                billing_interval: plan.interval,
                billing_subtext: featuresObj.billing_subtext || null,
                features: featuresObj.features_list || [],
                is_active: plan.is_active,
              };
            });

            return jsonOk(formattedPlans);
          } else {
            // Default behavior: list active plans for public/customer portal
            const { data, error } = await supabaseAdmin
              .from("plans")
              .select("id,name,description,price_cents,currency,interval,trial_days,features,stripe_price_id,stripe_product_id")
              .eq("is_active", true)
              .order("price_cents");

            if (error) {
              return jsonError(500, "database_error", `Failed to fetch plans: ${error.message}`);
            }

            return jsonOk({ plans: data ?? [] });
          }
        } catch (err) {
          console.error("API List plans exception:", err);
          return jsonError(500, "server_error", `Server error: ${(err as Error).message}`);
        }
      },

      // POST /api/customer/plans — Create a plan
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (!body.name || !body.price) {
            return jsonError(400, "missing_fields", "Missing required fields: name, price");
          }

          const featuresJson = {
            features_list: body.features || [],
            actual_price: body.actual_price || body.price,
            discount_percent: Number(body.discount_percent || 0),
            guest_limit: Number(body.guest_limit || 1),
            host_limit: Number(body.host_limit || 1),
            free_trial_days: Number(body.free_trial_days || 0),
            badge_text: body.badge_text || null,
            is_featured: !!body.is_featured,
            billing_subtext: body.billing_subtext || null,
            package_name: body.package_name || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            extra_host_price: body.extra_host_price || "0.00",
            order: Number(body.order || 0),
          };

          // 1. Create plan in database
          const { data: plan, error: insertErr } = await supabaseAdmin
            .from("plans")
            .insert({
              name: body.name,
              description: body.description || null,
              price_cents: Math.round(Number(body.price) * 100),
              currency: "usd",
              interval: body.billing_interval || "month",
              trial_days: body.free_trial_days || 0,
              features: featuresJson as any,
              is_active: body.is_active !== false,
            })
            .select("*")
            .single();

          if (insertErr || !plan) {
            return jsonError(500, "database_error", `Failed to save plan: ${insertErr?.message}`);
          }

          // 2. Sync to Stripe
          const stripeKey = process.env.STRIPE_SECRET_KEY;
          if (stripeKey) {
            try {
              const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" as never });
              const product = await stripe.products.create({
                name: plan.name,
                description: plan.description ?? undefined,
                metadata: { plan_id: plan.id },
              });

              const price = await stripe.prices.create({
                product: product.id,
                unit_amount: plan.price_cents,
                currency: plan.currency,
                recurring: getStripeRecurring(plan.interval),
                metadata: { plan_id: plan.id },
              });

              await supabaseAdmin
                .from("plans")
                .update({
                  stripe_product_id: product.id,
                  stripe_price_id: price.id,
                })
                .eq("id", plan.id);

              plan.stripe_product_id = product.id;
              plan.stripe_price_id = price.id;
            } catch (err) {
              console.error("Stripe creation failed:", err);
            }
          }

          const featuresObj = plan.features as any;
          const djangoPayload = {
            id: plan.id,
            action: "create",
            package_name:
              featuresObj.package_name || plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            stripe_product_id: plan.stripe_product_id || null,
            stripe_default_price_id: plan.stripe_price_id || null,
            price: Number((plan.price_cents / 100).toFixed(2)),
            actual_price: Number(
              Number(featuresObj.actual_price || plan.price_cents / 100).toFixed(2),
            ),
            discount_percent: Number(featuresObj.discount_percent ?? 0),
            guest_limit: Number(featuresObj.guest_limit ?? 1),
            host_limit: Number(featuresObj.host_limit ?? 1),
            extra_host_price: Number(Number(featuresObj.extra_host_price ?? 0).toFixed(2)),
            free_trial_days: Number(featuresObj.free_trial_days ?? plan.trial_days ?? 0),
            order: Number(featuresObj.order ?? 0),
            badge_text: featuresObj.badge_text || null,
            is_featured: !!featuresObj.is_featured,
            description: plan.description || "",
            billing_interval: plan.interval,
            billing_subtext: featuresObj.billing_subtext || null,
            features: featuresObj.features_list || [],
            is_active: plan.is_active,
          };

          // Sync to Django
          await syncPlanToDjango("create", djangoPayload);

          return jsonOk(djangoPayload);
        } catch (err) {
          console.error("API Create plan exception:", err);
          return jsonError(500, "server_error", `Server error: ${(err as Error).message}`);
        }
      },

      // PATCH /api/customer/plans — Update a plan
      PATCH: async ({ request }) => {
        try {
          const body = await request.json();
          const planId = body.id;
          if (!planId) {
            return jsonError(400, "missing_id", "Missing required field: id");
          }

          const { data: existing, error: fetchErr } = await supabaseAdmin
            .from("plans")
            .select("*")
            .eq("id", planId)
            .single();

          if (fetchErr || !existing) {
            return jsonError(404, "not_found", "Plan not found");
          }

          const featuresObj =
            typeof existing.features === "object" && existing.features !== null
              ? (existing.features as any)
              : { features_list: [] };

          const featuresJson = {
            features_list: body.features || featuresObj.features_list || [],
            actual_price:
              body.actual_price ||
              featuresObj.actual_price ||
              (existing.price_cents / 100).toFixed(2),
            discount_percent:
              body.discount_percent !== undefined
                ? Number(body.discount_percent)
                : Number(featuresObj.discount_percent || 0),
            guest_limit:
              body.guest_limit !== undefined
                ? Number(body.guest_limit)
                : Number(featuresObj.guest_limit || 1),
            host_limit:
              body.host_limit !== undefined
                ? Number(body.host_limit)
                : Number(featuresObj.host_limit || 1),
            free_trial_days:
              body.free_trial_days !== undefined
                ? Number(body.free_trial_days)
                : Number(featuresObj.free_trial_days || existing.trial_days || 0),
            badge_text: body.badge_text !== undefined ? body.badge_text : featuresObj.badge_text,
            is_featured:
              body.is_featured !== undefined ? !!body.is_featured : !!featuresObj.is_featured,
            billing_subtext:
              body.billing_subtext !== undefined
                ? body.billing_subtext
                : featuresObj.billing_subtext,
            package_name:
              body.package_name ||
              (body.name
                ? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")
                : featuresObj.package_name) ||
              existing.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            extra_host_price: body.extra_host_price || featuresObj.extra_host_price || "0.00",
            order: body.order !== undefined ? Number(body.order) : Number(featuresObj.order || 0),
          };

          const updatePayload: any = {};
          if (body.name) updatePayload.name = body.name;
          if (body.description !== undefined) updatePayload.description = body.description;
          if (body.price !== undefined)
            updatePayload.price_cents = Math.round(Number(body.price) * 100);
          if (body.billing_interval) updatePayload.interval = body.billing_interval;
          if (body.free_trial_days !== undefined)
            updatePayload.trial_days = Number(body.free_trial_days);
          if (body.is_active !== undefined) updatePayload.is_active = !!body.is_active;
          updatePayload.features = featuresJson;

          const { data: plan, error: updErr } = await supabaseAdmin
            .from("plans")
            .update(updatePayload)
            .eq("id", planId)
            .select("*")
            .single();

          if (updErr || !plan) {
            return jsonError(500, "database_error", `Failed to update plan: ${updErr?.message}`);
          }

          const stripeKey = process.env.STRIPE_SECRET_KEY;
          if (stripeKey) {
            try {
              const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" as never });
              let prodId = plan.stripe_product_id;
              if (!prodId) {
                const product = await stripe.products.create({
                  name: plan.name,
                  description: plan.description ?? undefined,
                  metadata: { plan_id: plan.id },
                });
                prodId = product.id;
              } else {
                await stripe.products.update(prodId, {
                  name: plan.name,
                  description: plan.description ?? undefined,
                });
              }

              const price = await stripe.prices.create({
                product: prodId,
                unit_amount: plan.price_cents,
                currency: plan.currency,
                recurring: getStripeRecurring(plan.interval),
                metadata: { plan_id: plan.id },
              });

              if (plan.stripe_price_id && plan.stripe_price_id !== price.id) {
                try {
                  await stripe.prices.update(plan.stripe_price_id, { active: false });
                } catch (err) {
                  console.warn("Failed to archive old Stripe price:", err);
                }
              }

              await supabaseAdmin
                .from("plans")
                .update({
                  stripe_product_id: prodId,
                  stripe_price_id: price.id,
                })
                .eq("id", plan.id);

              plan.stripe_product_id = prodId;
              plan.stripe_price_id = price.id;
            } catch (err) {
              console.error("Stripe sync update failed:", err);
            }
          }

          const finalFeatures = plan.features as any;
          const djangoPayload = {
            id: plan.id,
            action: "update",
            package_name:
              finalFeatures.package_name || plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            stripe_product_id: plan.stripe_product_id || null,
            stripe_default_price_id: plan.stripe_price_id || null,
            price: Number((plan.price_cents / 100).toFixed(2)),
            actual_price: Number(
              Number(finalFeatures.actual_price || plan.price_cents / 100).toFixed(2),
            ),
            discount_percent: Number(finalFeatures.discount_percent ?? 0),
            guest_limit: Number(finalFeatures.guest_limit ?? 1),
            host_limit: Number(finalFeatures.host_limit ?? 1),
            extra_host_price: Number(Number(finalFeatures.extra_host_price ?? 0).toFixed(2)),
            free_trial_days: Number(finalFeatures.free_trial_days ?? plan.trial_days ?? 0),
            order: Number(finalFeatures.order ?? 0),
            badge_text: finalFeatures.badge_text || null,
            is_featured: !!finalFeatures.is_featured,
            description: plan.description || "",
            billing_interval: plan.interval,
            billing_subtext: finalFeatures.billing_subtext || null,
            features: finalFeatures.features_list || [],
            is_active: plan.is_active,
          };

          // Sync to Django
          await syncPlanToDjango("update", djangoPayload);

          return jsonOk(djangoPayload);
        } catch (err) {
          console.error("API Update plan exception:", err);
          return jsonError(500, "server_error", `Server error: ${(err as Error).message}`);
        }
      },

      // DELETE /api/customer/plans — Delete a plan
      DELETE: async ({ request }) => {
        try {
          const body = await request.json();
          const planId = body.id;
          if (!planId) {
            return jsonError(400, "missing_id", "Missing required field: id");
          }

          const { data: plan, error: fetchErr } = await supabaseAdmin
            .from("plans")
            .select("*")
            .eq("id", planId)
            .single();

          if (fetchErr || !plan) {
            return jsonError(404, "not_found", "Plan not found");
          }

          const { error: delErr } = await supabaseAdmin.from("plans").delete().eq("id", planId);

          if (delErr) {
            return jsonError(500, "database_error", `Failed to delete: ${delErr.message}`);
          }

          const stripeKey = process.env.STRIPE_SECRET_KEY;
          if (stripeKey) {
            try {
              const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" as never });
              if (plan.stripe_price_id) {
                await stripe.prices.update(plan.stripe_price_id, { active: false });
              }
              if (plan.stripe_product_id) {
                await stripe.products.update(plan.stripe_product_id, { active: false });
              }
            } catch (err) {
              console.error("Stripe archiving failed on delete API:", err);
            }
          }

          const djangoPayload = {
            action: "delete",
            stripe_product_id: plan.stripe_product_id || null,
            stripe_default_price_id: plan.stripe_price_id || null,
          };

          // Sync to Django
          await syncPlanToDjango("delete", djangoPayload);

          return jsonOk(djangoPayload);
        } catch (err) {
          console.error("API Delete plan exception:", err);
          return jsonError(500, "server_error", `Server error: ${(err as Error).message}`);
        }
      },
    },
  },
});
