const base64FnId = Buffer.from(
  JSON.stringify({
    file: "/src/lib/stripe.functions.ts",
    function: "syncPlanToStripe"
  })
).toString("base64");

// Encode without padding or using URL-safe base64 if needed, but standard is usually fine.
const url = `http://localhost:8084/_server?_server_fn_id=${base64FnId}`;

async function testWrapped() {
  console.log("--- Testing Wrapped Payload ---");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { planId: "2e31df24-db8c-4900-a521-7299a9b2c892" }
    })
  });
  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}

async function testUnwrapped() {
  console.log("--- Testing Unwrapped Payload ---");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: "2e31df24-db8c-4900-a521-7299a9b2c892"
    })
  });
  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}

async function run() {
  await testWrapped();
  await testUnwrapped();
}

run().catch(console.error);
