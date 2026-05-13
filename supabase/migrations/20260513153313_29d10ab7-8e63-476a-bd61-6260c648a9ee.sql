
REVOKE EXECUTE ON FUNCTION public.in_scope_for(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_campaign_performance(uuid, timestamptz, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_campaign_timeseries(uuid, timestamptz, timestamptz, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_top_promo_codes(uuid, timestamptz, timestamptz, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_plan_conversion_by_campaign(uuid, timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.in_scope_for(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_campaign_performance(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_campaign_timeseries(uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_top_promo_codes(uuid, timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_plan_conversion_by_campaign(uuid, timestamptz, timestamptz) TO authenticated;
