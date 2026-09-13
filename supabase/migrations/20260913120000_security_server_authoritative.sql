-- Hardening: nunca confie em valores enviados pelo navegador.
-- O cliente pode apenas solicitar uma operação; o banco calcula preço,
-- créditos, comissão, revenda e status a partir dos registros confiáveis.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  asaas_environment text NOT NULL DEFAULT 'sandbox' CHECK (asaas_environment IN ('sandbox', 'production')),
  asaas_webhook_enabled boolean NOT NULL DEFAULT false,
  asaas_webhook_url text,
  asaas_webhook_events text[] NOT NULL DEFAULT ARRAY['PAYMENT_RECEIVED','PAYMENT_CONFIRMED','PAYMENT_OVERDUE','PAYMENT_REFUNDED'],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
GRANT SELECT ON public.platform_settings TO authenticated;
CREATE POLICY "platform_settings_admin_read" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.has_role((select auth.uid()), 'admin'));

-- Credenciais do Asaas NUNCA ficam nesta tabela. A API key deve continuar em
-- Supabase Edge Function Secrets. O painel administra somente configurações
-- não secretas e usa backend para qualquer operação privilegiada.

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_log FROM anon, authenticated;
GRANT SELECT ON public.security_audit_log TO authenticated;
CREATE POLICY "security_audit_admin_read" ON public.security_audit_log
  FOR SELECT TO authenticated USING (public.has_role((select auth.uid()), 'admin'));
GRANT ALL ON public.security_audit_log TO service_role;

-- Remove caminhos de escrita direta do navegador para vendas e movimentações.
REVOKE INSERT, UPDATE, DELETE ON public.sales FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_movements FROM authenticated;

-- Criação de venda: todos os valores financeiros são recalculados no banco.
CREATE OR REPLACE FUNCTION public.create_sale_secure(
  p_plan_id uuid,
  p_customer_name text,
  p_customer_email text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_customer_document text DEFAULT NULL,
  p_payment_method text DEFAULT 'pix',
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reseller public.resellers%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_id uuid;
  v_amount integer;
  v_commission integer;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF length(trim(coalesce(p_customer_name, ''))) < 2 OR length(trim(p_customer_name)) > 100 THEN
    RAISE EXCEPTION 'Nome do cliente inválido';
  END IF;
  IF p_customer_email IS NOT NULL AND length(trim(p_customer_email)) > 255 THEN RAISE EXCEPTION 'E-mail inválido'; END IF;
  IF p_customer_phone IS NOT NULL AND length(trim(p_customer_phone)) > 30 THEN RAISE EXCEPTION 'Telefone inválido'; END IF;
  IF p_customer_document IS NOT NULL AND length(regexp_replace(p_customer_document, '[^0-9]', '', 'g')) NOT IN (11,14) AND trim(p_customer_document) <> '' THEN
    RAISE EXCEPTION 'CPF/CNPJ inválido';
  END IF;
  IF p_payment_method NOT IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;

  SELECT * INTO v_reseller FROM public.resellers WHERE user_id = v_uid FOR UPDATE;
  IF v_reseller.id IS NULL OR NOT v_reseller.active THEN RAISE EXCEPTION 'Revenda não encontrada ou inativa'; END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id AND active = true;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Plano inválido ou inativo'; END IF;

  v_amount := CASE WHEN v_plan.promo_price_cents IS NOT NULL THEN v_plan.promo_price_cents ELSE v_plan.price_cents END;
  v_commission := round(v_amount * v_reseller.commission_pct / 100.0);
  v_status := CASE WHEN p_payment_method = 'pix' THEN 'aguardando_pagamento' ELSE 'pago' END;

  -- Para vendas imediatas, reserva/consome créditos atomicamente antes de criar a venda.
  IF v_status = 'pago' AND v_plan.credits > 0 AND v_reseller.credits_balance < v_plan.credits THEN
    RAISE EXCEPTION 'Saldo de créditos insuficiente para esta venda';
  END IF;

  INSERT INTO public.sales (
    reseller_id, plan_id, plan_name, customer_name, customer_email, customer_phone,
    customer_document, credits, amount_cents, commission_cents, payment_method,
    status, note, created_by
  ) VALUES (
    v_reseller.id, v_plan.id, v_plan.name, trim(p_customer_name),
    NULLIF(lower(trim(p_customer_email)), ''), NULLIF(trim(p_customer_phone), ''),
    NULLIF(regexp_replace(coalesce(p_customer_document,''), '[^0-9]', '', 'g'), ''),
    v_plan.credits, v_amount, v_commission, p_payment_method, v_status,
    NULLIF(left(trim(coalesce(p_note,'')), 300), ''), v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO public.security_audit_log(actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_uid, 'sale.create', 'sale', v_id::text,
          jsonb_build_object('payment_method', p_payment_method, 'status', v_status));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sale_secure(uuid,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_secure(uuid,text,text,text,text,text,text) TO authenticated;

-- Ajustes de créditos: somente administrador e com trilha de auditoria.
CREATE OR REPLACE FUNCTION public.admin_adjust_credits_secure(
  p_reseller_id uuid,
  p_delta integer,
  p_reason text DEFAULT 'ajuste',
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_delta = 0 OR abs(p_delta) > 100000000 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resellers WHERE id = p_reseller_id) THEN RAISE EXCEPTION 'Revenda não encontrada'; END IF;

  INSERT INTO public.credit_movements(reseller_id, delta, reason, note, created_by)
  VALUES (p_reseller_id, p_delta, left(coalesce(p_reason,'ajuste'), 50), NULLIF(left(coalesce(p_note,''),300),''), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.security_audit_log(actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_uid, 'credits.adjust', 'reseller', p_reseller_id::text, jsonb_build_object('delta', p_delta, 'movement_id', v_id));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_adjust_credits_secure(uuid,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits_secure(uuid,integer,text,text) TO authenticated;

-- Alterações de status financeiro só podem ser feitas por funções confiáveis
-- (webhook/service_role ou função administrativa futura), nunca por UPDATE do browser.
REVOKE UPDATE, DELETE ON public.asaas_payments FROM authenticated;
REVOKE ALL ON public.asaas_webhook_events FROM authenticated, anon;

-- Função administrativa para atualizar configurações não secretas.
CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(
  p_environment text,
  p_webhook_enabled boolean,
  p_webhook_url text,
  p_webhook_events text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'Ambiente inválido'; END IF;
  IF p_webhook_url IS NOT NULL AND length(p_webhook_url) > 500 THEN RAISE EXCEPTION 'URL inválida'; END IF;
  UPDATE public.platform_settings SET
    asaas_environment = p_environment,
    asaas_webhook_enabled = p_webhook_enabled,
    asaas_webhook_url = NULLIF(trim(p_webhook_url), ''),
    asaas_webhook_events = coalesce(p_webhook_events, ARRAY[]::text[]),
    updated_at = now(), updated_by = v_uid
  WHERE id = true;
  INSERT INTO public.security_audit_log(actor_id, action, resource_type, metadata)
  VALUES (v_uid, 'settings.update', 'platform', jsonb_build_object('environment', p_environment, 'webhook_enabled', p_webhook_enabled));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_platform_settings(text,boolean,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(text,boolean,text,text[]) TO authenticated;

-- Índices defensivos para buscas administrativas sem SQL dinâmico.
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_event_created ON public.asaas_webhook_events(created_at DESC);
