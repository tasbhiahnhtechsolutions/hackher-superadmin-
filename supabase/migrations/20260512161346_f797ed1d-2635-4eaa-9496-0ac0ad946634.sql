
-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "super admin notifications" ON public.notifications FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Email send log + suppression
CREATE TABLE public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_log_recipient ON public.email_send_log(recipient_email, created_at DESC);
CREATE INDEX idx_email_log_msgid ON public.email_send_log(message_id);
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin email log" ON public.email_send_log FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.suppressed_emails (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin suppressed" ON public.suppressed_emails FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_created ON public.transactions(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary_status ON public.commissions(beneficiary_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_created ON public.commissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_affiliate ON public.customers(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON public.subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON public.profiles(parent_user_id);

-- Helper RPC: revenue timeseries
CREATE OR REPLACE FUNCTION public.report_revenue_timeseries(
  _start TIMESTAMPTZ, _end TIMESTAMPTZ, _bucket TEXT DEFAULT 'day'
) RETURNS TABLE(bucket TIMESTAMPTZ, gross_cents BIGINT, refunds_cents BIGINT, net_cents BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc(_bucket, created_at) AS bucket,
    SUM(CASE WHEN type IN ('payment','invoice.paid') THEN amount_cents ELSE 0 END)::BIGINT AS gross_cents,
    SUM(CASE WHEN type IN ('refund','refunded') THEN amount_cents ELSE 0 END)::BIGINT AS refunds_cents,
    (SUM(CASE WHEN type IN ('payment','invoice.paid') THEN amount_cents ELSE 0 END)
     - SUM(CASE WHEN type IN ('refund','refunded') THEN amount_cents ELSE 0 END))::BIGINT AS net_cents
  FROM public.transactions
  WHERE created_at BETWEEN _start AND _end
  GROUP BY 1 ORDER BY 1;
$$;

-- Notify helper
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id UUID, _type TEXT, _title TEXT, _body TEXT DEFAULT NULL, _link TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (_user_id, _type, _title, _body, _link) RETURNING id;
$$;
