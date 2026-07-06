import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    realtime: {
      transport: ws
    }
  }
);

async function run() {
  const { data: webhookLogs, error: logErr } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  console.log("--- LATEST WEBHOOK LOGS ---");
  if (logErr) {
    console.error("logErr:", logErr);
  } else {
    webhookLogs.forEach(log => {
      console.log(`ID: ${log.event_id} | Type: ${log.event_type} | Processed: ${log.processed} | Error: ${log.error || 'None'} | Created: ${log.created_at}`);
    });
  }

  const { data: subs, error: subErr } = await supabase
    .from("subscriptions")
    .select("id, stripe_subscription_id, status, current_period_end, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("--- LATEST SUBSCRIPTIONS ---");
  if (subErr) {
    console.error("subErr:", subErr);
  } else {
    subs.forEach(sub => {
      console.log(`ID: ${sub.id} | Stripe Sub ID: ${sub.stripe_subscription_id} | Status: ${sub.status} | Period End: ${sub.current_period_end} | Created: ${sub.created_at}`);
    });
  }
}

run().catch(console.error);
