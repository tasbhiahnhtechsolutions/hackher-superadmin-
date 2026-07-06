-- Affiliate Analytics View
CREATE OR REPLACE VIEW public.affiliate_analytics_view AS
SELECT
    p.id,
    p.full_name,
    p.email,
    p.commission_rate,
    p.created_at,
    p.status,
    p.metadata,
    p.parent_user_id AS manager_id,
    
    (SELECT parent_user_id FROM public.profiles WHERE id = p.parent_user_id) AS sam_id,
    
    (SELECT count(pc.id) FROM public.promo_codes pc WHERE pc.affiliate_id = p.id AND pc.status = 'active') AS active_promo_codes,
    
    (SELECT count(s.id) 
     FROM public.subscriptions s 
     JOIN public.customers c ON c.stripe_customer_id = s.customer_id OR c.id::text = s.customer_id::text 
     WHERE c.affiliate_id = p.id AND s.status = 'active') AS active_subscribers,
     
    (SELECT count(s.id) 
     FROM public.subscriptions s 
     JOIN public.customers c ON c.stripe_customer_id = s.customer_id OR c.id::text = s.customer_id::text 
     WHERE c.affiliate_id = p.id AND s.status = 'trialing') AS total_trial_users,
     
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status = 'pending') AS pending_commission_cents,
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status = 'paid') AS total_paid_commission_cents,
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status IN ('paid', 'cleared', 'pending')) AS total_earned_cents

FROM public.profiles p
JOIN public.user_roles ur ON p.id = ur.user_id
WHERE ur.role = 'affiliate';


-- Manager Analytics View
CREATE OR REPLACE VIEW public.manager_analytics_view AS
SELECT
    p.id,
    p.full_name,
    p.email,
    p.commission_rate,
    p.created_at,
    p.status,
    p.metadata,
    p.parent_user_id AS sam_id,
    
    (SELECT count(child.id) FROM public.profiles child JOIN public.user_roles ur2 ON child.id = ur2.user_id WHERE child.parent_user_id = p.id AND ur2.role = 'affiliate' AND child.status = 'active') AS active_affiliates,
    
    (SELECT count(s.id) 
     FROM public.subscriptions s 
     JOIN public.customers c ON c.stripe_customer_id = s.customer_id OR c.id::text = s.customer_id::text
     JOIN public.profiles aff ON c.affiliate_id = aff.id
     WHERE aff.parent_user_id = p.id AND s.status = 'active') AS total_subscribers,
     
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status = 'pending') AS pending_commission_cents,
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status = 'paid') AS total_paid_commission_cents,
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status IN ('paid', 'cleared', 'pending')) AS total_earned_cents

FROM public.profiles p
JOIN public.user_roles ur ON p.id = ur.user_id
WHERE ur.role = 'manager';


-- SAM Analytics View
CREATE OR REPLACE VIEW public.sam_analytics_view AS
SELECT
    p.id,
    p.full_name,
    p.email,
    p.commission_rate,
    p.created_at,
    p.status,
    p.metadata,
    
    (SELECT count(child.id) FROM public.profiles child JOIN public.user_roles ur2 ON child.id = ur2.user_id WHERE child.parent_user_id = p.id AND ur2.role = 'manager' AND child.status = 'active') AS active_managers,
    
    (SELECT count(aff.id) 
     FROM public.profiles aff JOIN public.user_roles ur2 ON aff.id = ur2.user_id 
     JOIN public.profiles mgr ON aff.parent_user_id = mgr.id 
     WHERE mgr.parent_user_id = p.id AND ur2.role = 'affiliate' AND aff.status = 'active') AS total_affiliates,
    
    (SELECT count(s.id) 
     FROM public.subscriptions s 
     JOIN public.customers c ON c.stripe_customer_id = s.customer_id OR c.id::text = s.customer_id::text
     JOIN public.profiles aff ON c.affiliate_id = aff.id
     JOIN public.profiles mgr ON aff.parent_user_id = mgr.id
     WHERE mgr.parent_user_id = p.id AND s.status = 'active') AS total_subscribers,
     
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status = 'pending') AS pending_commission_cents,
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status = 'paid') AS total_paid_commission_cents,
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions WHERE beneficiary_id = p.id AND status IN ('paid', 'cleared', 'pending')) AS total_earned_cents

FROM public.profiles p
JOIN public.user_roles ur ON p.id = ur.user_id
WHERE ur.role = 'sam';

-- Grant access to authenticated users to read from the view
GRANT SELECT ON public.affiliate_analytics_view TO anon, authenticated;
GRANT SELECT ON public.manager_analytics_view TO anon, authenticated;
GRANT SELECT ON public.sam_analytics_view TO anon, authenticated;
