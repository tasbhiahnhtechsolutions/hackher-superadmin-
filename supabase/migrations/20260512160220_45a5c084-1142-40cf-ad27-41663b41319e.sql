
-- App settings (single-row config)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  platform_name TEXT NOT NULL DEFAULT 'HackHer.ai',
  support_email TEXT NOT NULL DEFAULT 'support@hackher.ai',
  commission_hold_days INTEGER NOT NULL DEFAULT 30,
  default_affiliate_rate NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  default_manager_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  default_sam_rate NUMERIC(5,4) NOT NULL DEFAULT 0.02,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "any authed reads settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "super admin manages settings" ON public.app_settings
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: clear commissions whose hold period has passed
CREATE OR REPLACE FUNCTION public.clear_due_commissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n INTEGER;
BEGIN
  WITH cleared AS (
    UPDATE public.commissions
    SET status = 'cleared', cleared_at = now()
    WHERE status = 'pending'
      AND hold_until IS NOT NULL
      AND hold_until <= now()
    RETURNING id
  )
  SELECT COUNT(*) INTO n FROM cleared;
  RETURN n;
END;
$$;

-- Helper: get ancestor chain (up to 3 levels: affiliate -> manager -> sam)
CREATE OR REPLACE FUNCTION public.get_ancestor_chain(_user_id UUID)
RETURNS TABLE(user_id UUID, role app_role, commission_rate NUMERIC, depth INT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_id UUID := _user_id;
  d INT := 0;
  parent UUID;
  r app_role;
  cr NUMERIC;
BEGIN
  WHILE current_id IS NOT NULL AND d < 5 LOOP
    SELECT p.parent_user_id, p.commission_rate INTO parent, cr
    FROM public.profiles p WHERE p.id = current_id;
    SELECT role INTO r FROM public.user_roles ur WHERE ur.user_id = current_id LIMIT 1;
    user_id := current_id;
    role := r;
    commission_rate := cr;
    depth := d;
    RETURN NEXT;
    current_id := parent;
    d := d + 1;
  END LOOP;
  RETURN;
END;
$$;
