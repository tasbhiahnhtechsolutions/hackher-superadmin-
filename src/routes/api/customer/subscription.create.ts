// POST /api/customer/subscription/create
// Django sends a signed JWT in the Authorization header.
// Token payload must include: id, email, role, stripe_price_id, package_id, package_name
// Body (optional): { coupon?, success_url, cancel_url }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import * as jose from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

// Only optional/redirect fields come from body — everything else is in the token
const BodySchema = z.object({
  coupon: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9]+$/)
    .optional(),
  success_url: z.string().url().max(500),
  cancel_url: z.string().url().max(500),
});

// Shape of the JWT payload Django encodes
interface DjangoTokenPayload {
  id: string; // Django user UUID
  email: string;
  role: "host" | "guest";
  stripe_price_id: string; // Stripe Price ID for the chosen plan
  package_id: string; // Django Package UUID
  package_name: string; // e.g. "founders_circle"
}

async function verifyAndDecodeToken(token: string): Promise<DjangoTokenPayload> {
  // Try host secret first, then guest secret
  const secrets = [
    process.env.DJANGO_HOST_JWT_SECRET,
    process.env.DJANGO_GUEST_JWT_SECRET,
  ].filter(Boolean) as string[];

  if (!secrets.length) throw new Error("No JWT secrets configured");

  let lastError: Error | null = null;
  for (const secret of secrets) {
    try {
      const encodedSecret = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, encodedSecret, {
        algorithms: ["HS256"],
      });

      // Validate required fields inside token
      const { id, email, role, stripe_price_id, package_id, package_name } =
        payload as Record<string, unknown>;

      if (!id || !email || !role || !stripe_price_id || !package_id || !package_name) {
        throw new Error(
          "Token payload is missing required fields: id, email, role, stripe_price_id, package_id, package_name",
        );
      }

      if (role !== "host" && role !== "guest") {
        throw new Error(`Invalid role in token: ${role}`);
      }

      return {
        id: id as string,
        email: email as string,
        role: role as "host" | "guest",
        stripe_price_id: stripe_price_id as string,
        package_id: package_id as string,
        package_name: package_name as string,
      };
    } catch (err) {
      lastError = err as Error;
    }
  }

  console.error("JWT validation failed:", lastError);
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
        const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return jsonError(401, "missing_token", "Authorization: Bearer <token> header is required");
        }
        const token = authHeader.slice(7).trim();

        // ── 2. Decode & verify token — all plan details come from here ───────
        let decoded: DjangoTokenPayload;
        try {
          decoded = await verifyAndDecodeToken(token);
        } catch (err) {
          return jsonError(401, "unauthorized", (err as Error).message);
        }

        const { id: djangoUserId, email, role, stripe_price_id: stripePriceId, package_id: packageId, package_name: packageName } = decoded;

        // ── 3. Parse optional body fields ────────────────────────────────────
        let body: unknown = {};
        try {
          const text = await request.text();
          if (text.trim()) body = JSON.parse(text);
        } catch {
          return jsonError(400, "invalid_json");
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return jsonError(400, "invalid_input", parsed.error.message);
        const { coupon, success_url, cancel_url } = parsed.data;

        // ── 4. Resolve coupon / affiliate attribution ─────────────────────────
        let affiliateId: string | null = null;
        let stripePromoId: string | null = null;
        if (coupon) {
          const { data: promo } = await supabaseAdmin
            .from("promo_codes")
            .select("*")
            .ilike("code", coupon)
            .maybeSingle();

          if (
            promo &&
            promo.status === "active" &&
            (!promo.usage_limit || promo.usage_count < promo.usage_limit)
          ) {
            affiliateId = promo.affiliate_id;
            stripePromoId = promo.stripe_promo_id;
          } else {
            return jsonError(400, "invalid_coupon", "Coupon is invalid or expired");
          }
        }

        // ── 5. Find or create Supabase customer ───────────────────────────────
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
              affiliate_id: affiliateId,
            } as never)
            .select("*")
            .single();
          customer = created;
        } else if (!customer.django_user_id) {
          const { data: updated } = await supabaseAdmin
            .from("customers")
            .update({
              django_user_id: djangoUserId,
              ...(affiliateId ? { affiliate_id: affiliateId } : {}),
            } as never)
            .eq("id", customer.id)
            .select("*")
            .single();
          customer = updated;
        }

        if (!customer) return jsonError(500, "customer_create_failed");

        // ── 6. Find or create Stripe customer ─────────────────────────────────
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" as never });

        let stripeCustomerId = customer.stripe_customer_id;
        if (!stripeCustomerId) {
          const sc = await stripe.customers.create({
            email,
            metadata: {
              customer_id: customer.id,
              django_user_id: djangoUserId,
              affiliate_id: affiliateId ?? "",
            },
          });
          stripeCustomerId = sc.id;
          await supabaseAdmin
            .from("customers")
            .update({ stripe_customer_id: stripeCustomerId } as never)
            .eq("id", customer.id);
        }

        // ── 7. Create Stripe Checkout Session ─────────────────────────────────
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: stripeCustomerId,
          line_items: [{ price: stripePriceId, quantity: 1 }],
          discounts: stripePromoId ? [{ promotion_code: stripePromoId }] : undefined,
          success_url,
          cancel_url,
          metadata: {
            user_id: djangoUserId,
            email,
            role,
            package_name: packageName,
            package_id: packageId,
            affiliate_id: affiliateId ?? "",
          },
          subscription_data: {
            metadata: {
              user_id: djangoUserId,
              email,
              role,
              package_name: packageName,
              package_id: packageId,
              affiliate_id: affiliateId ?? "",
            },
          },
        });

        // ── 8. Return checkout URL ─────────────────────────────────────────────
        return jsonOk({
          checkout_url: session.url,
          customer_id: customer.id,
          session_id: session.id,
        });
      },
    },
  },
});
