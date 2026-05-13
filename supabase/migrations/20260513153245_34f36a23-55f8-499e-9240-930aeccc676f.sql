
CREATE OR REPLACE FUNCTION public.in_scope_for(_scope_user uuid, _affiliate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_scope_user, 'super_admin')
    OR _scope_user = _affiliate
    OR public.is_ancestor_of(_scope_user, _affiliate);
$$;

CREATE OR REPLACE FUNCTION public.report_campaign_performance(
  _scope_user uuid,
  _start timestamptz DEFAULT (now() - interval '90 days'),
  _end timestamptz DEFAULT now()
) RETURNS TABLE(
  campaign text,
  promo_codes bigint,
  subscriptions bigint,
  gross_revenue_cents bigint,
  commissions_cents bigint,
  avg_discount numeric,
  total_uses bigint,
  conversion_rate numeric,
  top_promo_code text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scoped_codes AS (
    SELECT pc.* FROM promo_codes pc
    WHERE public.in_scope_for(_scope_user, pc.affiliate_id)
  ),
  subs AS (
    SELECT s.id, s.created_at, sc.campaign_label, sc.code AS promo_code
    FROM subscriptions s
    JOIN scoped_codes sc ON sc.id = s.promo_code_id
    WHERE s.created_at BETWEEN _start AND _end
  ),
  rev AS (
    SELECT su.campaign_label,
           COUNT(*) AS subs_count,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.amount_cents > 0), 0) AS gross
    FROM subs su
    LEFT JOIN transactions t ON t.subscription_id = su.id AND t.type IN ('payment','invoice.paid')
    GROUP BY su.campaign_label
  ),
  comm AS (
    SELECT su.campaign_label,
           COALESCE(SUM(c.amount_cents), 0) AS comm_cents
    FROM subs su
    LEFT JOIN commissions c ON c.subscription_id = su.id
    GROUP BY su.campaign_label
  ),
  code_agg AS (
    SELECT campaign_label,
           COUNT(*) AS code_count,
           COALESCE(SUM(usage_count), 0) AS uses,
           AVG(discount_percent) AS avg_disc
    FROM scoped_codes GROUP BY campaign_label
  ),
  top_code AS (
    SELECT DISTINCT ON (su.campaign_label)
      su.campaign_label, su.promo_code,
      COUNT(*) OVER (PARTITION BY su.campaign_label, su.promo_code) AS uses_in_period
    FROM subs su
    ORDER BY su.campaign_label, uses_in_period DESC, su.promo_code
  )
  SELECT
    COALESCE(ca.campaign_label, '(no campaign)'),
    ca.code_count::bigint,
    COALESCE(rev.subs_count, 0)::bigint,
    COALESCE(rev.gross, 0)::bigint,
    COALESCE(comm.comm_cents, 0)::bigint,
    COALESCE(ca.avg_disc, 0)::numeric,
    COALESCE(ca.uses, 0)::bigint,
    CASE WHEN COALESCE(ca.uses, 0) > 0
      THEN (COALESCE(rev.subs_count, 0)::numeric / ca.uses::numeric)
      ELSE 0 END,
    tc.promo_code
  FROM code_agg ca
  LEFT JOIN rev ON rev.campaign_label IS NOT DISTINCT FROM ca.campaign_label
  LEFT JOIN comm ON comm.campaign_label IS NOT DISTINCT FROM ca.campaign_label
  LEFT JOIN top_code tc ON tc.campaign_label IS NOT DISTINCT FROM ca.campaign_label
  ORDER BY 4 DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.report_campaign_timeseries(
  _scope_user uuid,
  _start timestamptz DEFAULT (now() - interval '90 days'),
  _end timestamptz DEFAULT now(),
  _bucket text DEFAULT 'day'
) RETURNS TABLE(
  bucket timestamptz,
  campaign text,
  subscriptions bigint,
  gross_revenue_cents bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scoped_codes AS (
    SELECT pc.id, pc.campaign_label FROM promo_codes pc
    WHERE public.in_scope_for(_scope_user, pc.affiliate_id)
  ),
  subs AS (
    SELECT s.id, s.created_at, sc.campaign_label
    FROM subscriptions s JOIN scoped_codes sc ON sc.id = s.promo_code_id
    WHERE s.created_at BETWEEN _start AND _end
  )
  SELECT date_trunc(_bucket, su.created_at),
         COALESCE(su.campaign_label, '(no campaign)'),
         COUNT(*)::bigint,
         COALESCE(SUM(t.amount_cents) FILTER (WHERE t.amount_cents > 0), 0)::bigint
  FROM subs su
  LEFT JOIN transactions t ON t.subscription_id = su.id AND t.type IN ('payment','invoice.paid')
  GROUP BY 1, 2 ORDER BY 1, 2;
$$;

CREATE OR REPLACE FUNCTION public.report_top_promo_codes(
  _scope_user uuid,
  _start timestamptz DEFAULT (now() - interval '90 days'),
  _end timestamptz DEFAULT now(),
  _limit int DEFAULT 10
) RETURNS TABLE(
  code text,
  campaign text,
  affiliate_id uuid,
  affiliate_name text,
  uses bigint,
  subscriptions bigint,
  gross_revenue_cents bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scoped_codes AS (
    SELECT pc.* FROM promo_codes pc
    WHERE public.in_scope_for(_scope_user, pc.affiliate_id)
  )
  SELECT pc.code,
         COALESCE(pc.campaign_label, '(no campaign)'),
         pc.affiliate_id,
         p.full_name,
         pc.usage_count::bigint,
         COUNT(s.id)::bigint,
         COALESCE(SUM(t.amount_cents) FILTER (WHERE t.amount_cents > 0), 0)::bigint
  FROM scoped_codes pc
  LEFT JOIN profiles p ON p.id = pc.affiliate_id
  LEFT JOIN subscriptions s ON s.promo_code_id = pc.id AND s.created_at BETWEEN _start AND _end
  LEFT JOIN transactions t ON t.subscription_id = s.id AND t.type IN ('payment','invoice.paid')
  GROUP BY pc.code, pc.campaign_label, pc.affiliate_id, p.full_name, pc.usage_count
  ORDER BY 7 DESC NULLS LAST
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.report_plan_conversion_by_campaign(
  _scope_user uuid,
  _start timestamptz DEFAULT (now() - interval '90 days'),
  _end timestamptz DEFAULT now()
) RETURNS TABLE(
  campaign text,
  plan_name text,
  subscriptions bigint,
  gross_revenue_cents bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scoped_codes AS (
    SELECT pc.id, pc.campaign_label FROM promo_codes pc
    WHERE public.in_scope_for(_scope_user, pc.affiliate_id)
  )
  SELECT COALESCE(sc.campaign_label, '(no campaign)'),
         pl.name,
         COUNT(s.id)::bigint,
         COALESCE(SUM(t.amount_cents) FILTER (WHERE t.amount_cents > 0), 0)::bigint
  FROM subscriptions s
  JOIN scoped_codes sc ON sc.id = s.promo_code_id
  JOIN plans pl ON pl.id = s.plan_id
  LEFT JOIN transactions t ON t.subscription_id = s.id AND t.type IN ('payment','invoice.paid')
  WHERE s.created_at BETWEEN _start AND _end
  GROUP BY 1, 2
  ORDER BY 1, 4 DESC;
$$;
