
-- Fraud flags
CREATE TYPE public.fraud_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE public.fraud_status AS ENUM ('open','reviewing','dismissed','confirmed');

CREATE TABLE public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_type TEXT NOT NULL,
  severity public.fraud_severity NOT NULL DEFAULT 'medium',
  status public.fraud_status NOT NULL DEFAULT 'open',
  risk_score INTEGER NOT NULL DEFAULT 50,
  subject_user_id UUID,
  related_user_id UUID,
  subscription_id UUID,
  promo_code_id UUID,
  ip_address TEXT,
  device_fingerprint TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_status ON public.fraud_flags(status, created_at DESC);
CREATE INDEX idx_fraud_subject ON public.fraud_flags(subject_user_id);

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin fraud" ON public.fraud_flags FOR ALL
  USING (public.has_role(auth.uid(),'super_admin'));

-- Login attempts (brute force / suspicious login tracking)
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_email_time ON public.login_attempts(email, created_at DESC);
CREATE INDEX idx_login_ip_time ON public.login_attempts(ip_address, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin login attempts" ON public.login_attempts FOR ALL
  USING (public.has_role(auth.uid(),'super_admin'));

-- API request log (usage analytics + abuse signals)
CREATE TABLE public.api_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_log_created ON public.api_request_log(created_at DESC);
CREATE INDEX idx_api_log_key ON public.api_request_log(api_key_id, created_at DESC);

ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin api log" ON public.api_request_log FOR ALL
  USING (public.has_role(auth.uid(),'super_admin'));

-- Analytics RPCs

-- Monthly cohort retention: % of customers acquired in cohort month still active N months later
CREATE OR REPLACE FUNCTION public.report_cohort_retention(_months_back INTEGER DEFAULT 6)
RETURNS TABLE(cohort DATE, period_offset INTEGER, customers BIGINT, retained BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH cohorts AS (
    SELECT c.id AS customer_id,
           date_trunc('month', c.created_at)::date AS cohort
    FROM customers c
    WHERE c.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval
  ),
  active AS (
    SELECT s.customer_id,
           date_trunc('month', s.created_at)::date AS active_month
    FROM subscriptions s
    WHERE s.status IN ('active','trialing','past_due')
    GROUP BY s.customer_id, date_trunc('month', s.created_at)
  )
  SELECT co.cohort,
         (EXTRACT(YEAR FROM age(a.active_month, co.cohort))*12 + EXTRACT(MONTH FROM age(a.active_month, co.cohort)))::int AS period_offset,
         COUNT(DISTINCT co.customer_id) AS customers,
         COUNT(DISTINCT a.customer_id) AS retained
  FROM cohorts co
  LEFT JOIN active a ON a.customer_id = co.customer_id AND a.active_month >= co.cohort
  GROUP BY co.cohort, period_offset
  ORDER BY co.cohort, period_offset;
$$;

-- LTV: average lifetime spend per customer
CREATE OR REPLACE FUNCTION public.report_ltv()
RETURNS TABLE(total_customers BIGINT, avg_ltv_cents NUMERIC, total_revenue_cents BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH per_customer AS (
    SELECT s.customer_id, COALESCE(SUM(t.amount_cents) FILTER (WHERE t.amount_cents > 0),0) AS spent
    FROM subscriptions s
    LEFT JOIN transactions t ON t.subscription_id = s.id
    GROUP BY s.customer_id
  )
  SELECT COUNT(*)::bigint, COALESCE(AVG(spent),0)::numeric, COALESCE(SUM(spent),0)::bigint FROM per_customer;
$$;

-- Churn rate: subscriptions canceled in last 30 days / active 30 days ago
CREATE OR REPLACE FUNCTION public.report_churn(_days INTEGER DEFAULT 30)
RETURNS TABLE(active_start BIGINT, churned BIGINT, churn_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH baseline AS (
    SELECT COUNT(*) AS active_start
    FROM subscriptions
    WHERE created_at < now() - (_days || ' days')::interval
      AND (status NOT IN ('canceled') OR updated_at > now() - (_days || ' days')::interval)
  ),
  churned AS (
    SELECT COUNT(*) AS c FROM subscriptions
    WHERE status = 'canceled' AND updated_at >= now() - (_days || ' days')::interval
  )
  SELECT b.active_start::bigint, ch.c::bigint,
         CASE WHEN b.active_start > 0 THEN (ch.c::numeric / b.active_start::numeric) ELSE 0 END
  FROM baseline b CROSS JOIN churned ch;
$$;

-- System health snapshot
CREATE OR REPLACE FUNCTION public.system_health_snapshot()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'webhooks_24h', (SELECT COUNT(*) FROM webhook_logs WHERE created_at > now() - interval '24 hours'),
    'webhooks_failed_24h', (SELECT COUNT(*) FROM webhook_logs WHERE created_at > now() - interval '24 hours' AND error IS NOT NULL),
    'emails_24h', (SELECT COUNT(*) FROM email_send_log WHERE created_at > now() - interval '24 hours'),
    'emails_failed_24h', (SELECT COUNT(*) FROM email_send_log WHERE created_at > now() - interval '24 hours' AND status = 'failed'),
    'emails_pending_retry', (SELECT COUNT(*) FROM email_send_log WHERE status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at < now() + interval '1 hour'),
    'open_fraud_flags', (SELECT COUNT(*) FROM fraud_flags WHERE status IN ('open','reviewing')),
    'failed_logins_1h', (SELECT COUNT(*) FROM login_attempts WHERE created_at > now() - interval '1 hour' AND success = false),
    'api_calls_24h', (SELECT COUNT(*) FROM api_request_log WHERE created_at > now() - interval '24 hours'),
    'commissions_pending_cents', (SELECT COALESCE(SUM(amount_cents),0) FROM commissions WHERE status = 'pending'),
    'commissions_cleared_cents', (SELECT COALESCE(SUM(amount_cents),0) FROM commissions WHERE status = 'cleared')
  );
$$;

-- Self-referral: customer with affiliate_id where the affiliate's profile email matches
-- Helper function callable from server fn
CREATE OR REPLACE FUNCTION public.flag_fraud(
  _flag_type TEXT, _severity public.fraud_severity, _risk INTEGER,
  _subject UUID, _related UUID, _details JSONB
) RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.fraud_flags(flag_type, severity, risk_score, subject_user_id, related_user_id, details)
  VALUES (_flag_type, _severity, _risk, _subject, _related, COALESCE(_details,'{}'::jsonb))
  RETURNING id;
$$;
