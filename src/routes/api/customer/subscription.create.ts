// POST /api/customer/subscription/create
// Django sends a signed JWT in the Authorization header.
// Token payload includes: id, email (role is inferred from which secret verifies the token)
// Body (required): { stripePriceId, packageId, packageName, role? }
// Also accepts snake_case: { stripe_price_id, package_id, package_name, role? }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import * as jose from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

const SUCCESS_URL = "https://hackherapp.ai/checkout/success";
const CANCEL_URL = "https://hackherapp.ai/checkout/cancel";

const BodySchema = z
  .object({
    // camelCase (client payload)
    stripePriceId: z.string().min(1).optional(),
    packageId: z.string().uuid().optional(),
    packageName: z.string().min(1).max(50).optional(),
    // snake_case (optional alternate)
    stripe_price_id: z.string().min(1).optional(),
    package_id: z.string().uuid().optional(),
    package_name: z.string().min(1).max(50).optional(),
    role: z.enum(["host", "guest"]).optional(),
  })
  .transform((data) => ({
    stripe_price_id: data.stripe_price_id ?? data.stripePriceId,
    package_id: data.package_id ?? data.packageId,
    package_name: data.package_name ?? data.packageName,
    role: data.role,
  }))
  .superRefine((data, ctx) => {
    if (!data.stripe_price_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stripePriceId"],
        message: "stripePriceId is required",
      });
    }
    if (!data.package_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packageId"],
        message: "packageId is required",
      });
    }
    if (!data.package_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packageName"],
        message: "packageName is required",
      });
    }
  });

export type DjangoTokenPayload = {
  id: string;
  email: string;
  role: "host" | "guest";
  exp?: number;
  iat?: number;
};

type VerifiedPayload = {
  id: string;
  email: string;
  exp?: number;
  iat?: number;
};

function normalizeToken(token: string): string {
  return token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
}

export async function verifyAndDecodeToken(
  token: string,
): Promise<DjangoTokenPayload> {
  const rawToken = normalizeToken(token);

  if (!rawToken) {
    throw new Error("Token is required");
  }

  console.log("========== JWT VERIFY START ==========");
  console.log("Raw token (first 40 chars):", rawToken.slice(0, 40) + "...");

  const secretConfigs: Array<{
    role: "host" | "guest";
    secret?: string;
  }> = [
      { role: "host", secret: process.env.DJANGO_HOST_JWT_SECRET },
      { role: "guest", secret: process.env.DJANGO_GUEST_JWT_SECRET },
    ];

  const configuredSecrets = secretConfigs.filter((item) => item.secret);

  console.log(
    "Configured secrets:",
    configuredSecrets.map((s) => s.role),
  );

  if (!configuredSecrets.length) {
    throw new Error("No JWT secrets configured");
  }

  let lastError: Error | null = null;

  for (const { role, secret } of configuredSecrets) {
    try {
      const encodedSecret = new TextEncoder().encode(secret!);
      const { payload } = await jose.jwtVerify(rawToken, encodedSecret, {
        algorithms: ["HS256"],
      });

      const verified = payload as VerifiedPayload;

      console.log("JWT verified with role secret:", role);
      console.log("Token payload from Django:", {
        id: verified.id,
        email: verified.email,
        exp: verified.exp,
        iat: verified.iat,
        full_payload: verified,
      });

      if (!verified.id || !verified.email) {
        throw new Error("Token payload is missing required fields: id, email");
      }

      const decoded: DjangoTokenPayload = {
        id: String(verified.id),
        email: String(verified.email),
        role,
        exp: verified.exp,
        iat: verified.iat,
      };

      console.log("Final decoded token values:", decoded);
      console.log("========== JWT VERIFY SUCCESS ==========");

      return decoded;
    } catch (err) {
      console.error(`JWT verify failed with ${role} secret:`, err);
      lastError = err as Error;
    }
  }

  console.error("JWT validation failed:", lastError);
  console.log("========== JWT VERIFY FAILED ==========");
  throw new Error("Invalid or expired authentication token");
}

export const Route = createFileRoute("/api/customer/subscription/create")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      POST: async ({ request }) => {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return jsonError(503, "stripe_not_configured");

        // ── 1. Extract token from Authorization header ──────────────────────
        const authHeader =
          request.headers.get("Authorization") ||
          request.headers.get("authorization");

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return jsonError(
            401,
            "missing_token",
            "Authorization: Bearer <token> header is required",
          );
        }

        const token = authHeader.slice(7).trim();
        console.log("Authorization header received: Bearer <token>");

        // ── 2. Decode & verify token — user identity only ───────────────────
        let decoded: DjangoTokenPayload;
        try {
          decoded = await verifyAndDecodeToken(token);
        } catch (err) {
          return jsonError(401, "unauthorized", (err as Error).message);
        }

        const { id: djangoUserId, email, role: tokenRole } = decoded;

        console.log("Token values used in request:", {
          djangoUserId,
          email,
          tokenRole,
        });

        // ── 3. Parse body (plan details & optional role) ─────────────────────
        let body: unknown = {};
        try {
          const text = await request.text();
          if (text.trim()) body = JSON.parse(text);
        } catch {
          return jsonError(400, "invalid_json");
        }

        console.log("Request body received:", body);

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          console.error("Body validation failed:", parsed.error.message);
          return jsonError(400, "invalid_input", parsed.error.message);
        }

        const {
          stripe_price_id: stripePriceId,
          package_id: packageId,
          package_name: packageName,
          role: bodyRole,
        } = parsed.data;

        const finalRole = bodyRole || tokenRole;

        console.log("Normalized body values:", {
          stripePriceId,
          packageId,
          packageName,
          bodyRole,
          finalRole,
        });

        // ── 4. Find or create Supabase customer ───────────────────────────────
        let { data: customer } = await supabaseAdmin
          .from("customers")
          .select("*")
          .or(`django_user_id.eq.${djangoUserId},email.eq.${email}`)
          .maybeSingle();

        if (!customer) {
          const { data: created } = await supabaseAdmin
            .from("customers")
            .insert({
              email,
              django_user_id: djangoUserId,
            } as never)
            .select("*")
            .single();
          customer = created;
        } else if (!customer.django_user_id) {
          const { data: updated } = await supabaseAdmin
            .from("customers")
            .update({
              django_user_id: djangoUserId,
            } as never)
            .eq("id", customer.id)
            .select("*")
            .single();
          customer = updated;
        }

        if (!customer) return jsonError(500, "customer_create_failed");

        console.log("Supabase customer:", {
          id: customer.id,
          email: customer.email,
          django_user_id: customer.django_user_id,
          stripe_customer_id: customer.stripe_customer_id,
        });

        // ── 4.5 Check for existing active/trialing subscription for this specific plan ──
        const { data: existingActiveSubs } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("customer_id", customer.id)
          .eq("plan_id", packageId)
          .in("status", ["active", "trialing"])
          .limit(1);

        if (existingActiveSubs && existingActiveSubs.length > 0) {
          console.warn(`Customer ${customer.id} already has an active subscription for plan ${packageId}`);
          return jsonOk({
            success: false,
            message: "You already have an active subscription for this plan.",
          });
        }



        // ── 5. Find or create Stripe customer ─────────────────────────────────
        const stripe = new Stripe(stripeKey, {
          apiVersion: "2025-03-31.basil" as never,
        });

        let stripeCustomerId = customer.stripe_customer_id;
        try {
          if (!stripeCustomerId) {
            const sc = await stripe.customers.create({
              email,
              metadata: {
                customer_id: customer.id,
                django_user_id: djangoUserId,
              },
            });
            stripeCustomerId = sc.id;
            await supabaseAdmin
              .from("customers")
              .update({ stripe_customer_id: stripeCustomerId } as never)
              .eq("id", customer.id);
          }

          console.log("Stripe customer id:", stripeCustomerId);

          // Retrieve plan details to check if it has a free trial
          let trialPeriodDays: number | undefined = undefined;
          if (packageId) {
            const { data: plan } = await supabaseAdmin
              .from("plans")
              .select("trial_days")
              .eq("id", packageId)
              .maybeSingle();
            if (plan && plan.trial_days > 0) {
              trialPeriodDays = plan.trial_days;
              console.log(`Setting trial_period_days to ${trialPeriodDays} for checkout session`);
            }
          }

          // ── 6. Create Stripe Checkout Session ─────────────────────────────────
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: stripeCustomerId,
            line_items: [{ price: stripePriceId, quantity: 1 }],
            allow_promotion_codes: true,
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: {
              user_id: djangoUserId,
              email,
              role: finalRole,
              package_name: packageName,
              package_id: packageId,
            },
            subscription_data: {
              metadata: {
                user_id: djangoUserId,
                email,
                role: finalRole,
                package_name: packageName,
                package_id: packageId,
              },
              ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
            },
          });

          console.log("Checkout session created:", {
            session_id: session.id,
            checkout_url: session.url,
          });

          // ── 7. Return checkout URL ─────────────────────────────────────────────
          return jsonOk({
            success: true,
            checkout_url: session.url,
            customer_id: customer.id,
            session_id: session.id,
          });
        } catch (err: any) {
          console.error("Stripe Checkout creation error:", err);
          if (err.type === "StripeInvalidRequestError" || err.statusCode === 400) {
            const msg = err.message || "";
            if (msg.includes("Price") || msg.includes("product") || msg.includes("not available")) {
              return jsonError(404, "package_not_found", "The requested subscription package price or product is not available in Stripe.");
            }
            return jsonError(400, "invalid_checkout_request", msg);
          }
          return jsonError(500, "checkout_failed", err.message || "Failed to initiate checkout session.");
        }
      },
    },
  },
});