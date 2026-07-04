import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: { persistSession: false },
    realtime: { transport: ws }
  }
);

async function run() {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("role", "super_admin");

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Super admins:", roles);
  for (const r of roles) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", r.user_id)
      .single();
    console.log("User:", profile);
  }
}

run().catch(console.error);
