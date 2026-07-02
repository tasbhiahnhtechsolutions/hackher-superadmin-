/**
 * generate_tokens.js
 * -------------------
 * JWT tokens generate karne ki script — multiple test scenarios k sath.
 * Run: node generate_tokens.js
 *
 * Requirement: npm run dev chal raha hona chahiye (localhost:8080)
 */

import * as jose from "jose";

// ─── Secrets (.env se match karte hain) ──────────────────────────────────────
const HOST_SECRET =
  "zikhfc@razhik088888c@@jsddfhwgf!baig!hwgfh33@@@@@@@76&cxcx&&&&khizar!!!!!";
const GUEST_SECRET =
  "zikhfc@razhik0guest8@@jsddfhwgf!baig!hwgfh33@@@@@@@76&cxcx&&&&khizar!!!!!b";

const BASE_URL = "http://localhost:8080";

// ─── Helper: Token Generate ───────────────────────────────────────────────────
async function generateToken(payload, role) {
  const secret = new TextEncoder().encode(role === "host" ? HOST_SECRET : GUEST_SECRET);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}

// ─── Helper: Curl command print ───────────────────────────────────────────────
function printCurl(label, token, body = {}) {
  const bodyStr = JSON.stringify(
    {
      success_url: "https://hackherapp.ai/checkout/success",
      cancel_url: "https://hackherapp.ai/checkout/cancel",
      ...body,
    },
    null,
    2,
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📌 SCENARIO: ${label}`);
  console.log("=".repeat(60));
  console.log("\n🔑 TOKEN:");
  console.log(token);
  console.log("\n📦 CURL COMMAND:");
  console.log(`curl -X POST ${BASE_URL}/api/customer/subscription/create \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '${bodyStr}'`);
}

// ─── Test Scenarios ───────────────────────────────────────────────────────────
async function run() {
  console.log("=".repeat(60));
  console.log("  JWT Token Generator — Checkout Flow Testing");
  console.log("=".repeat(60));
  console.log(
    "\n⚠️  Pehle run karo: GET http://localhost:8080/api/customer/plans",
  );
  console.log(
    "   aur neeche wale 'YOUR_STRIPE_PRICE_ID' ko real price ID se replace karo.\n",
  );

  // ── Scenario 1: Host User — Basic checkout ──────────────────────────────────
  const hostPayload = {
    id: "108fa798-4d2d-4dea-8326-b2f20566eada", // Django host user UUID
    email: "host@example.com",
    role: "host",
    stripe_price_id: "price_1TojuA9eH8hPknRDUcEd1OEY", // ← GET /api/customer/plans se lo
    package_id: "a7f22ccf-2a7c-4de5-a974-1a5b976f2f17", // Django package UUID
    package_name: "test_circle",
  };
  const hostToken = await generateToken(hostPayload, "host");
  printCurl("Host User — Founders Circle (No Coupon)", hostToken);

  // ── Scenario 2: Guest User — Basic checkout ─────────────────────────────────
  const guestPayload = {
    id: "63b774a7-4046-4db1-9168-7bb92e6c2534", // Django guest user UUID
    email: "guest@example.com",
    role: "guest",
    stripe_price_id: "YOUR_STRIPE_PRICE_ID", // ← GET /api/customer/plans se lo
    package_id: "bbb00000-0000-0000-0000-000000000002", // Django package UUID
    package_name: "squad_plan",
  };
  const guestToken = await generateToken(guestPayload, "guest");
  printCurl("Guest User — Squad Plan (No Coupon)", guestToken);

  // ── Scenario 3: Host User — With Coupon ─────────────────────────────────────
  const hostWithCouponPayload = {
    id: "108fa798-4d2d-4dea-8326-b2f20566eada",
    email: "host@example.com",
    role: "host",
    stripe_price_id: "YOUR_STRIPE_PRICE_ID",
    package_id: "aaa00000-0000-0000-0000-000000000001",
    package_name: "founders_circle",
  };
  const hostCouponToken = await generateToken(hostWithCouponPayload, "host");
  printCurl("Host User — With Coupon Code", hostCouponToken, {
    coupon: "SAVE20", // ← Apna active coupon code dalo
  });

  // ── Scenario 4: Expired / Tampered Token Test (manual) ──────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("📌 SCENARIO: Invalid Token Test (Manually Tamper)");
  console.log("=".repeat(60));
  console.log("\nYeh token deliberately galat hai — 401 Unauthorized aana chahiye:");
  console.log(`curl -X POST ${BASE_URL}/api/customer/subscription/create \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer INVALID_TOKEN_HERE" \\
  -d '{"success_url":"https://hackherapp.ai/success","cancel_url":"https://hackherapp.ai/cancel"}'`);

  // ── Scenario 5: Missing Authorization Header ─────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("📌 SCENARIO: Missing Authorization Header Test");
  console.log("=".repeat(60));
  console.log("\nHeader nahi bheja — 401 missing_token aana chahiye:");
  console.log(`curl -X POST ${BASE_URL}/api/customer/subscription/create \\
  -H "Content-Type: application/json" \\
  -d '{"success_url":"https://hackherapp.ai/success","cancel_url":"https://hackherapp.ai/cancel"}'`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ Stripe Test Cards:");
  console.log("   Success:  4242 4242 4242 4242  |  Exp: 12/34  |  CVC: 123");
  console.log("   Declined: 4000 0000 0000 9995  |  Exp: 12/34  |  CVC: 123");
  console.log("=".repeat(60));
  console.log(
    "\n💡 Checkout URL browser mein kholo aur payment complete karo.",
  );
  console.log(
    "   Server logs mein dekhna: 'Django S2S sync succeeded: 200'\n",
  );
}

run().catch(console.error);
