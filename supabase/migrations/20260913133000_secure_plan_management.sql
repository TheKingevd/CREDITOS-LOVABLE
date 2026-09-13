CREATE OR REPLACE FUNCTION public.admin_save_plan_secure(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_credits integer,
  p_price_cents integer,
  p_promo_price_cents integer,
  p_promo_label text,
  p_features text[],
  p_highlight boolean,
  p_active boolean,
  p_sort_order integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF length(trim(coalesce(p_name, ''))) < 2 OR length(trim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Nome do plano inválido';
  END IF;
  IF p_credits < 0 OR p_price_cents < 0 OR p_sort_order < 0 OR p_sort_order > 999 THEN
    RAISE EXCEPTION 'Valores do plano inválidos';
  END IF;
  IF p_promo_price_cents IS NOT NULL AND (p_promo_price_cents < 0 OR p_promo_price_cents > p_price_cents) THEN
    RAISE EXCEPTION 'Preço promocional inválido';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 240 THEN
    RAISE EXCEPTION 'Descrição inválida';
  END IF;
  IF p_promo_label IS NOT NULL AND length(p_promo_label) > 40 THEN
    RAISE EXCEPTION 'Etiqueta promocional inválida';
  END IF;
  IF coalesce(array_length(p_features, 1), 0) > 30 THEN
    RAISE EXCEPTION 'Quantidade de recursos inválida';
  END IF;

  IF p_plan_id IS NULL THEN
    INSERT INTO public.plans (name, description, credits, price_cents, promo_price_cents, promo_label, features, highlight, active, sort_order, updated_at)
    VALUES (trim(p_name), NULLIF(trim(coalesce(p_description, '')), ''), p_credits, p_price_cents, p_promo_price_cents, NULLIF(trim(coalesce(p_promo_label, '')), ''), coalesce(p_features, ARRAY[]::text[]), coalesce(p_highlight, false), coalesce(p_active, true), p_sort_order, now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.plans
    SET name = trim(p_name),
        description = NULLIF(trim(coalesce(p_description, '')), ''),
        credits = p_credits,
        price_cents = p_price_cents,
        promo_price_cents = p_promo_price_cents,
        promo_label = NULLIF(trim(coalesce(p_promo_label, '')), ''),
        features = coalesce(p_features, ARRAY[]::text[]),
        highlight = coalesce(p_highlight, false),
        active = coalesce(p_active, true),
        sort_order = p_sort_order,
        updated_at = now()
    WHERE id = p_plan_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Plano não encontrado';
    END IF;
  END IF;

  INSERT INTO public.security_audit_log(actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_uid, CASE WHEN p_plan_id IS NULL THEN 'plan.create' ELSE 'plan.update' END, 'plan', v_id::text, jsonb_build_object('name', trim(p_name)));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_plan_secure(p_plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT name INTO v_name FROM public.plans WHERE id = p_plan_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;
  DELETE FROM public.plans WHERE id = p_plan_id;
  INSERT INTO public.security_audit_log(actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_uid, 'plan.delete', 'plan', p_plan_id::text, jsonb_build_object('name', v_name));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_plan_secure(uuid,text,text,integer,integer,integer,text,text[],boolean,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_plan_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_plan_secure(uuid,text,text,integer,integer,integer,text,text[],boolean,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_plan_secure(uuid) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.plans FROM authenticated;
