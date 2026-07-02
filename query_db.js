import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function run() {
  const { data: webhookLogs, error: logErr } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("--- LATEST WEBHOOK LOGS ---");
  console.log(JSON.stringify(webhookLogs, null, 2));
  if (logErr) console.error("logErr:", logErr);

  const { data: subs, error: subErr } = await supabase
    .from("subscriptions")
    .select("*, plans(*), customers(*)")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("--- LATEST SUBSCRIPTIONS ---");
  console.log(JSON.stringify(subs, null, 2));
  if (subErr) console.error("subErr:", subErr);
}

run().catch(console.error);
