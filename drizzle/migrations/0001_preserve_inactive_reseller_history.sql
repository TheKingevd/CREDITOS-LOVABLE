CREATE OR REPLACE FUNCTION public.current_reseller_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.resellers
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;