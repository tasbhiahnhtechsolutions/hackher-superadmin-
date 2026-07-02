// GET /api/customer/invoices/:customerId => { invoices: [...] }
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, corsPreflight } from "@/lib/api-cors.server";

export const Route = createFileRoute("/api/customer/invoices/$customerId")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ params }) => {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) return jsonError(503, "stripe_not_configured");

        const { data: cust } = await supabaseAdmin
          .from("customers")
          .select("stripe_customer_id")
          .or(`id.eq.${params.customerId},email.eq.${params.customerId}`)
          .maybeSingle();
        if (!cust?.stripe_customer_id) return jsonError(404, "customer_not_found");

        const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as never });
        const list = await stripe.invoices.list({ customer: cust.stripe_customer_id, limit: 50 });
        return jsonOk({
          invoices: list.data.map((i) => ({
            id: i.id,
            number: i.number,
            status: i.status,
            amount_paid: i.amount_paid,
            amount_due: i.amount_due,
            currency: i.currency,
            created: i.created,
            hosted_invoice_url: i.hosted_invoice_url,
            invoice_pdf: i.invoice_pdf,
          })),
        });
      },
    },
  },
});
