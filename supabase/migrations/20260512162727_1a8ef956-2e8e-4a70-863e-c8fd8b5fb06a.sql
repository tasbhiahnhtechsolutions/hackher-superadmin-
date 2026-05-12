
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'notification_preferences' AND relnamespace = 'public'::regnamespace) THEN
    CREATE TABLE public.notification_preferences (
      user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
      email_payouts boolean NOT NULL DEFAULT true,
      email_commissions boolean NOT NULL DEFAULT true,
      email_subscription boolean NOT NULL DEFAULT true,
      email_security boolean NOT NULL DEFAULT true,
      email_admin_alerts boolean NOT NULL DEFAULT true,
      email_marketing boolean NOT NULL DEFAULT false,
      inapp_payouts boolean NOT NULL DEFAULT true,
      inapp_commissions boolean NOT NULL DEFAULT true,
      inapp_subscription boolean NOT NULL DEFAULT true,
      inapp_admin_alerts boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "view own prefs" ON public.notification_preferences FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY "update own prefs" ON public.notification_preferences FOR UPDATE USING (user_id = auth.uid());
    CREATE POLICY "insert own prefs" ON public.notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
    CREATE POLICY "super admin prefs" ON public.notification_preferences FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

INSERT INTO public.notification_preferences (user_id)
SELECT id FROM public.profiles ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_default_prefs ON public.profiles;
CREATE TRIGGER profiles_default_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_prefs();

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS subject text;

CREATE INDEX IF NOT EXISTS idx_email_log_retry ON public.email_send_log (status, next_retry_at) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_email_log_created ON public.email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, read_at, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_user_with_pref(
  _user_id uuid, _category text, _type text, _title text,
  _body text DEFAULT NULL, _link text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE allowed boolean := true; nid uuid;
BEGIN
  SELECT CASE _category
    WHEN 'payouts' THEN inapp_payouts
    WHEN 'commissions' THEN inapp_commissions
    WHEN 'subscription' THEN inapp_subscription
    WHEN 'admin_alerts' THEN inapp_admin_alerts
    ELSE true END
  INTO allowed FROM public.notification_preferences WHERE user_id = _user_id;
  IF allowed IS DISTINCT FROM false THEN
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (_user_id, _type, _title, _body, _link) RETURNING id INTO nid;
    RETURN nid;
  END IF;
  RETURN NULL;
END;
$$;
