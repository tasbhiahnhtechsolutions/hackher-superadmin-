-- Alter transactions subscription_id foreign key constraint to ON DELETE CASCADE
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS transactions_subscription_id_fkey;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_subscription_id_fkey
FOREIGN KEY (subscription_id)
REFERENCES public.subscriptions(id)
ON DELETE CASCADE;
