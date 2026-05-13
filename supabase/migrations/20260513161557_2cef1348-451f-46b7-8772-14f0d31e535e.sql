CREATE OR REPLACE FUNCTION public.get_ancestor_chain(_user_id uuid)
 RETURNS TABLE(user_id uuid, role app_role, commission_rate numeric, depth integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT ur.role INTO r FROM public.user_roles ur WHERE ur.user_id = current_id LIMIT 1;
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
$function$;