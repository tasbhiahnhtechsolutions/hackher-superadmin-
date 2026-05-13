-- Lock affiliates out of mutating promo_codes; they keep read access via "view own promos"
DROP POLICY IF EXISTS "affiliate manages own promos" ON public.promo_codes;

-- SAM/Manager can manage codes for affiliates in their hierarchy via has_role/is_ancestor_of
CREATE POLICY "sam manager manage descendant promos"
ON public.promo_codes FOR ALL
USING (
  affiliate_id IS NOT NULL
  AND is_ancestor_of(auth.uid(), affiliate_id)
  AND (has_role(auth.uid(), 'sam'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  affiliate_id IS NOT NULL
  AND is_ancestor_of(auth.uid(), affiliate_id)
  AND (has_role(auth.uid(), 'sam'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);