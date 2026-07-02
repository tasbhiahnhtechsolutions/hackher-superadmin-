-- Migration: Add Django synchronization fields to customers and subscriptions tables

ALTER TABLE public.customers
ADD COLUMN django_user_id UUID;

ALTER TABLE public.subscriptions
ADD COLUMN django_package_id UUID,
ADD COLUMN django_package_name TEXT;

-- Comments for documentation
COMMENT ON COLUMN public.customers.django_user_id IS 'Associated User ID from Django system';
COMMENT ON COLUMN public.subscriptions.django_package_id IS 'Associated Package ID from Django system';
COMMENT ON COLUMN public.subscriptions.django_package_name IS 'Associated Package Name/Key from Django system (e.g. squad_plan)';
