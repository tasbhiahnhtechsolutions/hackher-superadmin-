
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'sam', 'manager', 'affiliate', 'customer');
CREATE TYPE public.account_status AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE public.plan_interval AS ENUM ('month', 'quarter', 'year');
CREATE TYPE public.promo_status AS ENUM ('active', 'inactive', 'expired');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE public.commission_status AS ENUM ('pending', 'hold', 'cleared', 'paid', 'refunded', 'failed');
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'paid', 'failed');

-- ============================================================
-- PROFILES (no role here - roles live in user_roles)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  status public.account_status NOT NULL DEFAULT 'active',
  parent_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  commission_rate NUMERIC(5,2),
  stripe_customer_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_parent ON public.profiles(parent_user_id);

-- ============================================================
-- USER ROLES
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Security definer to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'super_admin' THEN 1 WHEN 'sam' THEN 2
    WHEN 'manager' THEN 3 WHEN 'affiliate' THEN 4 ELSE 5
  END LIMIT 1;
$$;

-- True if checker is ancestor of target (SAM->Manager->Affiliate)
CREATE OR REPLACE FUNCTION public.is_ancestor_of(_ancestor UUID, _descendant UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE current UUID := _descendant;
BEGIN
  FOR i IN 1..10 LOOP
    SELECT parent_user_id INTO current FROM public.profiles WHERE id = current;
    IF current IS NULL THEN RETURN FALSE; END IF;
    IF current = _ancestor THEN RETURN TRUE; END IF;
  END LOOP;
  RETURN FALSE;
END; $$;

-- ============================================================
-- PLANS
-- ============================================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  interval public.plan_interval NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]',
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROMO CODES
-- ============================================================
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  affiliate_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  discount_percent NUMERIC(5,2) NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  status public.promo_status NOT NULL DEFAULT 'active',
  stripe_coupon_id TEXT,
  stripe_promo_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_promo_affiliate ON public.promo_codes(affiliate_id);

-- Validation trigger: code 3-30 chars alphanumeric; discount + commissions <= 30%
CREATE OR REPLACE FUNCTION public.validate_promo_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code !~ '^[A-Za-z0-9]{3,30}$' THEN
    RAISE EXCEPTION 'Promo code must be 3-30 alphanumeric characters';
  END IF;
  IF NEW.discount_percent < 0 OR NEW.discount_percent > 30 THEN
    RAISE EXCEPTION 'Discount must be between 0 and 30 percent';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_promo BEFORE INSERT OR UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.validate_promo_code();

-- ============================================================
-- CUSTOMERS / SUBSCRIPTIONS / COMMISSIONS / PAYOUTS
-- ============================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT,
  stripe_customer_id TEXT UNIQUE,
  affiliate_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  promo_code_id UUID REFERENCES public.promo_codes(id),
  status public.subscription_status NOT NULL DEFAULT 'incomplete',
  stripe_subscription_id TEXT UNIQUE,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_customer ON public.subscriptions(customer_id);

CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  beneficiary_id UUID NOT NULL REFERENCES public.profiles(id),
  beneficiary_role public.app_role NOT NULL,
  amount_cents INTEGER NOT NULL,
  rate NUMERIC(5,2) NOT NULL,
  status public.commission_status NOT NULL DEFAULT 'pending',
  hold_until TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commissions_beneficiary ON public.commissions(beneficiary_id);

CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID NOT NULL REFERENCES public.profiles(id),
  amount_cents INTEGER NOT NULL,
  status public.payout_status NOT NULL DEFAULT 'pending',
  period_start DATE,
  period_end DATE,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  stripe_event_id TEXT UNIQUE,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  payload JSONB,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRIGGERS: updated_at + auto profile + first user = super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_promos_updated BEFORE UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + assign role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER; assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'super_admin';
  ELSE
    assigned_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'affiliate');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "super admin full profiles" ON public.profiles FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "view descendants" ON public.profiles FOR SELECT USING (public.is_ancestor_of(auth.uid(), id));

-- User roles
CREATE POLICY "view own role" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "super admin manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'super_admin'));

-- Plans: all authenticated read; only super admin writes
CREATE POLICY "anyone authed reads plans" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manages plans" ON public.plans FOR ALL USING (public.has_role(auth.uid(),'super_admin'));

-- Promo codes: affiliate sees own; ancestors see; super admin all
CREATE POLICY "view own promos" ON public.promo_codes FOR SELECT USING (affiliate_id = auth.uid());
CREATE POLICY "view descendant promos" ON public.promo_codes FOR SELECT USING (public.is_ancestor_of(auth.uid(), affiliate_id));
CREATE POLICY "super admin promos" ON public.promo_codes FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "affiliate manages own promos" ON public.promo_codes FOR ALL USING (affiliate_id = auth.uid()) WITH CHECK (affiliate_id = auth.uid());

-- Customers / subscriptions: super admin all; affiliate sees own attributed
CREATE POLICY "super admin customers" ON public.customers FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "view own attributed customers" ON public.customers FOR SELECT USING (affiliate_id = auth.uid() OR public.is_ancestor_of(auth.uid(), affiliate_id));
CREATE POLICY "super admin subscriptions" ON public.subscriptions FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "view subs of own customers" ON public.subscriptions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.customers c WHERE c.id = subscriptions.customer_id
    AND (c.affiliate_id = auth.uid() OR public.is_ancestor_of(auth.uid(), c.affiliate_id)))
);

-- Commissions: own + descendants + super admin
CREATE POLICY "view own commissions" ON public.commissions FOR SELECT USING (beneficiary_id = auth.uid());
CREATE POLICY "view descendant commissions" ON public.commissions FOR SELECT USING (public.is_ancestor_of(auth.uid(), beneficiary_id));
CREATE POLICY "super admin commissions" ON public.commissions FOR ALL USING (public.has_role(auth.uid(),'super_admin'));

-- Payouts
CREATE POLICY "view own payouts" ON public.payouts FOR SELECT USING (beneficiary_id = auth.uid());
CREATE POLICY "view descendant payouts" ON public.payouts FOR SELECT USING (public.is_ancestor_of(auth.uid(), beneficiary_id));
CREATE POLICY "super admin payouts" ON public.payouts FOR ALL USING (public.has_role(auth.uid(),'super_admin'));

-- Transactions / audit / api_keys / webhook_logs: super admin only
CREATE POLICY "super admin transactions" ON public.transactions FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "super admin audit read" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "any authed inserts audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
CREATE POLICY "super admin api_keys" ON public.api_keys FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "super admin webhook_logs" ON public.webhook_logs FOR ALL USING (public.has_role(auth.uid(),'super_admin'));
