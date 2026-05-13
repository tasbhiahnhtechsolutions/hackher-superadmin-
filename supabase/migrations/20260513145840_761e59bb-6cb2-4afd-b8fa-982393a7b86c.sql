ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS campaign_label text,
  ADD COLUMN IF NOT EXISTS plan_id uuid;

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS first_paid_invoice_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_profile_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_role public.app_role;
  parent_role public.app_role;
BEGIN
  IF NEW.parent_user_id IS NULL THEN RETURN NEW; END IF;
  SELECT role INTO my_role FROM public.user_roles WHERE user_id = NEW.id LIMIT 1;
  SELECT role INTO parent_role FROM public.user_roles WHERE user_id = NEW.parent_user_id LIMIT 1;
  IF my_role IS NULL OR parent_role IS NULL THEN RETURN NEW; END IF;
  IF my_role = 'sam' AND parent_role <> 'super_admin' THEN
    RAISE EXCEPTION 'A SAM must report to the Super Admin';
  ELSIF my_role = 'manager' AND parent_role <> 'sam' THEN
    RAISE EXCEPTION 'A Manager must report to a SAM';
  ELSIF my_role = 'affiliate' AND parent_role <> 'manager' THEN
    RAISE EXCEPTION 'An Affiliate must report to a Manager';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_profile_hierarchy ON public.profiles;
CREATE TRIGGER trg_validate_profile_hierarchy
  BEFORE INSERT OR UPDATE OF parent_user_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_hierarchy();

CREATE OR REPLACE FUNCTION public.check_promo_30_rule(_affiliate_id uuid, _discount numeric)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_commission numeric := 0;
  rec record;
  d numeric := COALESCE(_discount, 0);
BEGIN
  IF _affiliate_id IS NULL THEN RETURN; END IF;
  FOR rec IN SELECT role, commission_rate FROM public.get_ancestor_chain(_affiliate_id) LOOP
    IF rec.role IN ('affiliate','manager','sam') AND rec.commission_rate IS NOT NULL THEN
      total_commission := total_commission + (rec.commission_rate * 100);
    END IF;
  END LOOP;
  IF (d + total_commission) > 30 THEN
    RAISE EXCEPTION 'Discount % plus chain commissions % exceeds the 30 percent cap', d, total_commission USING ERRCODE = '23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_promo_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code !~ '^[A-Za-z0-9]{3,30}$' THEN
    RAISE EXCEPTION 'Promo code must be 3-30 alphanumeric characters';
  END IF;
  IF NEW.discount_percent < 0 OR NEW.discount_percent > 30 THEN
    RAISE EXCEPTION 'Discount must be between 0 and 30 percent';
  END IF;
  PERFORM public.check_promo_30_rule(NEW.affiliate_id, NEW.discount_percent);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_promo_code ON public.promo_codes;
CREATE TRIGGER trg_validate_promo_code
  BEFORE INSERT OR UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.validate_promo_code();