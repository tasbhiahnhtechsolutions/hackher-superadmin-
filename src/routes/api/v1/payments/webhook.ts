import { createFileRoute } from "@tanstack/react-router";
import { jsonError } from "@/lib/api-cors.server";

export const Route = createFileRoute("/api/v1/payments/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          },
        });
      },
      POST: async ({ request }) => {
        const djangoApiUrl = process.env.DJANGO_API_URL;
        if (!djangoApiUrl) {
          console.error("[Proxy] DJANGO_API_URL is not configured in .env");
          return jsonError(500, "django_api_url_not_configured");
        }

        const targetUrl = `${djangoApiUrl.replace(/\/$/, "")}/api/v1/payments/webhook/`;

        try {
          const bodyText = await request.text();
          console.log(`[Proxy] Forwarding Stripe webhook to Django: ${targetUrl}`);

          // Clone headers to pass along, especially stripe-signature
          const headers = new Headers();
          request.headers.forEach((value, key) => {
            if (
              key.toLowerCase() === "content-type" ||
              key.toLowerCase().startsWith("stripe-") ||
              key.toLowerCase() === "user-agent"
            ) {
              headers.set(key, value);
            }
          });

          const djangoRes = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: bodyText,
          });

          const resText = await djangoRes.text();
          console.log(`[Proxy] Django responded with status: ${djangoRes.status}`);

          return new Response(resText, {
            status: djangoRes.status,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": djangoRes.headers.get("Content-Type") || "application/json",
            },
          });
        } catch (error) {
          console.error("[Proxy] Failed to forward webhook to Django:", error);
          return jsonError(502, "django_proxy_failed", (error as Error).message);
        }
      },
    },
  },
});
