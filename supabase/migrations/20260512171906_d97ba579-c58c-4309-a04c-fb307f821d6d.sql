CREATE POLICY "view descendant roles"
ON public.user_roles
FOR SELECT
USING (public.is_ancestor_of(auth.uid(), user_id));