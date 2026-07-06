import fs from "fs";
import path from "path";
import Stripe from "stripe";

// Parse .env
const envPath = path.resolve(".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const parts = line.split("=");
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }
});

const stripe = new Stripe(env.STRIPE_SECRET_KEY || "", { apiVersion: "2025-03-31.basil" });

async function run() {
  const webhookEndpointId = "we_1ToQKg9eH8hPknRDRdN2mshK";
  console.log(`Updating Stripe Webhook Endpoint: ${webhookEndpointId}`);

  const requiredEvents = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "invoice.created",
    "invoice.finalized"
  ];

  try {
    const updatedEndpoint = await stripe.webhookEndpoints.update(webhookEndpointId, {
      enabled_events: requiredEvents
    });
    console.log("Successfully updated webhook endpoint!");
    console.log("New Enabled Events:", updatedEndpoint.enabled_events.join(', '));
  } catch (err) {
    console.error("Failed to update webhook endpoint:", err.message);
  }
}

run().catch(console.error);
