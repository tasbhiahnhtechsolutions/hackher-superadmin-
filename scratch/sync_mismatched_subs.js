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
  console.log("Fetching all subscriptions from Supabase...");
  const { data: dbSubs, error } = await supabase
    .from("subscriptions")
    .select("id, stripe_subscription_id, status");

  if (error) {
    console.error("Failed to fetch subscriptions from Supabase:", error.message);
    return;
  }

  console.log(`Found ${dbSubs.length} subscriptions in Supabase. Verifying status with Stripe...`);

  for (const sub of dbSubs) {
    if (!sub.stripe_subscription_id) continue;

    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      if (stripeSub.status !== sub.status) {
        console.log(`Mismatch found for ${sub.stripe_subscription_id}: DB=${sub.status} | Stripe=${stripeSub.status}`);
        
        // Update Supabase
        const { error: updErr } = await supabase
          .from("subscriptions")
          .update({ status: stripeSub.status })
          .eq("id", sub.id);
          
        if (updErr) {
          console.error(`Failed to update ${sub.stripe_subscription_id} in Supabase:`, updErr.message);
        } else {
          console.log(`Successfully updated ${sub.stripe_subscription_id} to ${stripeSub.status} in Supabase.`);
        }
      }
    } catch (err) {
      if (err.code === "resource_missing") {
        // Subscription not found on Stripe, or deleted. If deleted on Stripe, it's canceled.
        if (sub.status !== "canceled") {
          console.log(`Subscription ${sub.stripe_subscription_id} not found on Stripe. Updating DB status to canceled...`);
          const { error: updErr } = await supabase
            .from("subscriptions")
            .update({ status: "canceled" })
            .eq("id", sub.id);
          if (updErr) {
            console.error(`Failed to update deleted subscription:`, updErr.message);
          } else {
            console.log(`Successfully set ${sub.stripe_subscription_id} to canceled.`);
          }
        }
      } else {
        console.error(`Error retrieving subscription ${sub.stripe_subscription_id} from Stripe:`, err.message);
      }
    }
  }

  console.log("Sync complete!");
}

run().catch(console.error);
