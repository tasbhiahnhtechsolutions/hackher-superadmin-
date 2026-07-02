import * as jose from "jose";

const GUEST_SECRET = "zikhfc@razhik0guest8@@jsddfhwgf!baig!hwgfh33@@@@@@@76&cxcx&&&&khizar!!!!!b";

async function run() {
  console.log("--------------------------------------------------");
  console.log("Generating Test JWT Token & Curl Command");
  console.log("--------------------------------------------------");

  const payload = {
    id: "63b774a7-4046-4db1-9168-7bb92e6c2534", // Dummy Django User ID
    email: "paweg52376@cexch.com", // Dummy Email
  };

  const secret = new TextEncoder().encode(GUEST_SECRET);
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);

  console.log("Generated Token (Role: guest):");
  console.log(token);
  console.log("\nPayload contained inside:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("--------------------------------------------------");

  console.log("\nTo test, make sure your dev server is running (npm run dev).");
  console.log("Then run the following curl command in your terminal:\n");

  const packageId = "63b774a7-4046-4db1-9168-7bb92e6c2534";

  console.log(`curl -X POST http://localhost:8080/api/customer/subscription/create \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "${token}",
    "role": "guest",
    "stripePriceId": "YOUR_STRIPE_PRICE_ID_HERE",
    "packageName": "squad_plan",
    "packageId": "${packageId}",
    "success_url": "https://hackherapp.ai/success",
    "cancel_url": "https://hackherapp.ai/cancel"
  }'`);
  console.log(
    "\nNote: Replace 'YOUR_STRIPE_PRICE_ID_HERE' with a valid Stripe Price ID from your test Stripe account.",
  );
  console.log("--------------------------------------------------");
}

run().catch(console.error);
