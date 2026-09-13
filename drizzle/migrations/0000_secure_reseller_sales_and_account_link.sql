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
    AND active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.link_reseller_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  mail text;
  rid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO rid
  FROM public.resellers
  WHERE user_id = uid
  LIMIT 1;

  IF rid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, 'reseller')
    ON CONFLICT DO NOTHING;
    RETURN rid;
  END IF;

  SELECT email INTO mail
  FROM auth.users
  WHERE id = uid;

  IF mail IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.resellers
  SET user_id = uid,
      updated_at = now()
  WHERE user_id IS NULL
    AND lower(btrim(email)) = lower(btrim(mail))
  RETURNING id INTO rid;

  IF rid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, 'reseller')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_reseller_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reseller_record public.resellers%ROWTYPE;
  plan_record public.plans%ROWTYPE;
BEGIN
  SELECT * INTO reseller_record
  FROM public.resellers
  WHERE id = NEW.reseller_id
  FOR UPDATE;

  IF reseller_record.id IS NULL THEN
    RAISE EXCEPTION 'Revenda nao encontrada';
  END IF;

  IF NOT reseller_record.active THEN
    RAISE EXCEPTION 'Revenda inativa';
  END IF;

  IF NEW.plan_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um plano';
  END IF;

  SELECT * INTO plan_record
  FROM public.plans
  WHERE id = NEW.plan_id
    AND active = true;

  IF plan_record.id IS NULL THEN
    RAISE EXCEPTION 'Plano indisponivel';
  END IF;

  NEW.plan_name := plan_record.name;
  NEW.credits := plan_record.credits;
  NEW.amount_cents := COALESCE(plan_record.promo_price_cents, plan_record.price_cents);
  NEW.commission_cents := round(NEW.amount_cents * reseller_record.commission_pct / 100.0);
  NEW.created_by := auth.uid();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_reseller_sale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_reseller_sale() TO service_role;

CREATE TRIGGER sales_prepare_reseller_values
BEFORE INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.prepare_reseller_sale();