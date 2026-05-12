import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requireAdmin = async (supabase: any, userId: string) => {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: { role: string }) => r.role === "super_admin")) {
    throw new Response("Forbidden", { status: 403 });
  }
};

export const getCohortRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase.rpc("report_cohort_retention" as never, { _months_back: 6 } as never);
    if (error) throw error;
    return data as Array<{ cohort: string; period_offset: number; customers: number; retained: number }>;
  });

export const getLtv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase.rpc("report_ltv" as never, {} as never);
    if (error) throw error;
    return (data as Array<{ total_customers: number; avg_ltv_cents: number; total_revenue_cents: number }>)?.[0] ?? null;
  });

export const getChurn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase.rpc("report_churn" as never, { _days: 30 } as never);
    if (error) throw error;
    return (data as Array<{ active_start: number; churned: number; churn_rate: number }>)?.[0] ?? null;
  });

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase.rpc("system_health_snapshot" as never, {} as never);
    if (error) throw error;
    return data as Record<string, number>;
  });

export const getRevenueTimeseries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase.rpc("report_revenue_timeseries" as never, {
      _start: start.toISOString(), _end: end.toISOString(), _bucket: "day",
    } as never);
    if (error) throw error;
    return data as Array<{ bucket: string; gross_cents: number; refunds_cents: number; net_cents: number }>;
  });
