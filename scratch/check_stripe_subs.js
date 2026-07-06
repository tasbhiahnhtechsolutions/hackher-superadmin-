import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import ws from "ws";
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

const supabase = createClient(env.VITE_SUPABASE_URL || "", env.SUPABASE_SERVICE_ROLE_KEY || "", {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

const stripe = new Stripe(env.STRIPE_SECRET_KEY || "", { apiVersion: "2025-03-31.basil" });

async function run() {
  console.log("=== STRIPE WEBHOOK ENDPOINTS ===");
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
    endpoints.data.forEach(ep => {
      console.log(`ID: ${ep.id} | URL: ${ep.url} | Status: ${ep.status} | Enabled Events: ${ep.enabled_events.join(', ')}`);
    });
  } catch (err) {
    console.error("Failed to list webhook endpoints:", err.message);
  }

  console.log("\n=== LATEST STRIPE SUBSCRIPTIONS ===");
  try {
    const stripeSubs = await stripe.subscriptions.list({ limit: 10 });
    for (const sub of stripeSubs.data) {
      console.log(`Stripe Sub: ${sub.id} | Status: ${sub.status} | Customer: ${sub.customer} | Cancel At Period End: ${sub.cancel_at_period_end}`);
      // Find in Supabase
      const { data: dbSub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      if (dbSub) {
        console.log(`   -> Supabase Status: ${dbSub.status}`);
      } else {
        console.log(`   -> Supabase Status: NOT FOUND`);
      }
    }
  } catch (err) {
    console.error("Failed to list Stripe subscriptions:", err.message);
  }
}

run().catch(console.error);
