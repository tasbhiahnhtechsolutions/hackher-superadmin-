import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import ws from "ws";
import Stripe from "stripe";
import readline from "readline";

// Manually parse .env file
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

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-03-31.basil" });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function syncSubscriptionToDjango(opts) {
  const djangoApiUrl = env.DJANGO_API_URL;
  const s2sSecret = env.SUPABASE_S2S_API_KEY || env.DJANGO_S2S_SECRET;

  if (!djangoApiUrl) {
    console.error("syncSubscriptionToDjango: DJANGO_API_URL is not configured in .env");
    return;
  }

  const payload = {
    user_id: opts.djangoUserId,
    email: opts.email,
    role: opts.role,
    package_id: opts.packageId,
    package_name: opts.packageName,
    stripe_subscription_id: opts.stripeSubscriptionId,
    status: opts.status,
    start_date: opts.startDate || new Date().toISOString(),
    end_date: opts.endDate,
    cancel_at_period_end: opts.cancelAtPeriodEnd,
    stripe_raw: opts.stripeRaw || null,
  };

  try {
    const url = `${djangoApiUrl.replace(/\/$/, "")}/internal/v1/sync-subscription/`;
    console.log("\n==================================================");
    console.log("🚀 [Django S2S Sync] STARTING SYNC TO DJANGO");
    console.log(`🔗 Target URL: ${url}`);
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s2sSecret}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ [Django S2S Sync] FAILED ❌");
      console.error(`Status: ${response.status}`);
      console.error(`Response details: ${text}`);
    } else {
      const text = await response.text();
      console.log("✅ [Django S2S Sync] SUCCESS ✅");
      console.log(`Status: ${response.status}`);
      console.log(`Response details: ${text}`);
    }
    console.log("==================================================");
  } catch (error) {
    console.error("❌ [Django S2S Sync] ERROR OCCURRED ❌");
    console.error("Error details:", error);
    console.log("==================================================");
  }
}

async function attributeCommissions(opts) {
  console.log("\n--- [Commission Attribution Check] ---");
  if (!opts.promoCodeId) {
    console.log("🔍 Result: No active promo code for this invoice payment. Skipping commission.");
    return;
  }
  if (!opts.affiliateId || opts.amountCents <= 0) {
    console.log("🔍 Result: No affiliate ID or amount <= 0. Skipping commission.");
    return;
  }
  console.log(`🔍 Result: Promo code ID ${opts.promoCodeId} is present. Commissions would be generated!`);
}

async function main() {
  try {
    console.log("=== Fetching latest subscriptions from database... ===");
    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")
      .select(`
        id,
        stripe_subscription_id,
        status,
        current_period_end,
        trial_ends_at,
        promo_code_id,
        django_package_id,
        django_package_name,
        customer:customer_id (
          id,
          email,
          stripe_customer_id,
          django_user_id,
          affiliate_id
        )
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    if (subErr || !subs || subs.length === 0) {
      console.error("No subscriptions found in the database.");
      rl.close();
      return;
    }

    console.log("\nLatest Subscriptions:");
    subs.forEach((sub, index) => {
      console.log(`${index + 1}. Sub ID: ${sub.stripe_subscription_id} | Email: ${sub.customer?.email} | Status: ${sub.status} | Package: ${sub.django_package_name}`);
    });

    const choice = await askQuestion("\nSelect subscription index (1-5) or enter a custom stripe subscription ID (e.g. sub_...): ");
    
    let selectedSub = null;
    const choiceInt = parseInt(choice, 10);
    if (choiceInt >= 1 && choiceInt <= subs.length) {
      selectedSub = subs[choiceInt - 1];
    } else if (choice.startsWith("sub_")) {
      // Find sub in DB first
      const { data: foundSub } = await supabase
        .from("subscriptions")
        .select(`
          id,
          stripe_subscription_id,
          status,
          current_period_end,
          trial_ends_at,
          promo_code_id,
          django_package_id,
          django_package_name,
          customer:customer_id (
            id,
            email,
            stripe_customer_id,
            django_user_id,
            affiliate_id
          )
        `)
        .eq("stripe_subscription_id", choice.trim())
        .maybeSingle();

      if (foundSub) {
        selectedSub = foundSub;
      } else {
        console.log("Subscription not found in local DB. We will attempt to fetch it from Stripe.");
        selectedSub = {
          stripe_subscription_id: choice.trim(),
          django_package_id: null,
          django_package_name: "Annual Plan",
          customer: {
            email: "manual_test@example.com",
            stripe_customer_id: "cus_mocked",
            django_user_id: "django_user_mocked",
            affiliate_id: null
          }
        };
      }
    } else {
      console.log("Invalid selection. Exiting.");
      rl.close();
      return;
    }

    console.log(`\nSelected Subscription: ${selectedSub.stripe_subscription_id}`);

    // Fetch stripe details
    console.log("Fetching details from Stripe...");
    let stripeSub = null;
    try {
      stripeSub = await stripe.subscriptions.retrieve(selectedSub.stripe_subscription_id);
      console.log("Stripe Status:", stripeSub.status);
    } catch (err) {
      console.error(`Stripe Error: ${err.message}. Using mock fallback.`);
      stripeSub = {
        id: selectedSub.stripe_subscription_id,
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        currency: "usd",
        items: { data: [{ price: { unit_amount: 19900 } }] }
      };
    }

    const billingReasonChoice = await askQuestion("\nEnter Billing Reason (1 for Renewal 'subscription_cycle', 2 for Checkout 'subscription_create') [Default: 1]: ");
    const billingReason = (billingReasonChoice === "2") ? "subscription_create" : "subscription_cycle";

    const promoChoice = await askQuestion("\nSimulate coupon/promo code active on this invoice? (y/n) [Default: n]: ");
    const hasPromo = (promoChoice.toLowerCase() === "y");

    let resolvedPromoCodeId = null;
    let mockInvoiceDiscounts = [];

    if (hasPromo) {
      // Find a promo code in DB
      const { data: promo } = await supabase
        .from("promo_codes")
        .select("id, stripe_promo_id")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (promo) {
        resolvedPromoCodeId = promo.id;
        mockInvoiceDiscounts = [{
          promotion_code: promo.stripe_promo_id || "promo_mock_id"
        }];
        console.log(`Simulating Promo Code applied: ${promo.stripe_promo_id}`);
      } else {
        console.log("No active promo code found in database. Using mock promo ID.");
        mockInvoiceDiscounts = [{
          promotion_code: "promo_mock_id"
        }];
      }
    }

    const mockInvoice = {
      id: "in_manual_test_invoice",
      customer: selectedSub.customer?.stripe_customer_id,
      customer_email: selectedSub.customer?.email,
      subscription: selectedSub.stripe_subscription_id,
      billing_reason: billingReason,
      amount_paid: stripeSub.items.data[0]?.price?.unit_amount || 19900,
      currency: stripeSub.currency || "usd",
      discounts: mockInvoiceDiscounts,
    };

    console.log("\n==============================================");
    console.log("🔧 [SIMULATION STARTED]");
    console.log(`Billing Reason: ${mockInvoice.billing_reason}`);
    console.log(`Discounts: ${JSON.stringify(mockInvoice.discounts, null, 2)}`);
    console.log("==============================================");

    // Run commission check
    await attributeCommissions({
      stripe,
      subscriptionId: selectedSub.stripe_subscription_id,
      invoiceId: mockInvoice.id,
      amountCents: mockInvoice.amount_paid,
      affiliateId: selectedSub.customer?.affiliate_id || null,
      promoCodeId: resolvedPromoCodeId,
    });

    // Run Django S2S Sync
    const newPeriodEnd = new Date();
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    const startDateVal = stripeSub.current_period_start || stripeSub.start_date || stripeSub.created;

    await syncSubscriptionToDjango({
      djangoUserId: selectedSub.customer?.django_user_id,
      email: selectedSub.customer?.email,
      role: stripeSub.metadata?.role || "host",
      packageId: selectedSub.django_package_id || stripeSub.metadata?.package_id,
      packageName: selectedSub.django_package_name || stripeSub.metadata?.package_name || "annual_plan",
      stripeSubscriptionId: selectedSub.stripe_subscription_id,
      status: billingReason === "subscription_cycle" ? "active" : stripeSub.status,
      startDate: startDateVal ? new Date(startDateVal * 1000).toISOString() : new Date().toISOString(),
      endDate: newPeriodEnd.toISOString(),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
      stripeRaw: { subscription: stripeSub, invoice: mockInvoice },
    });

    console.log("\n🎉 Test run complete!");
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    rl.close();
  }
}

main();
