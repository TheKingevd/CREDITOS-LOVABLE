-- Campos de identificação adicionais para o pagador.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_document text;

-- Integração interna entre vendas e cobranças Asaas.
CREATE TABLE IF NOT EXISTS public.asaas_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE CASCADE,
  asaas_customer_id text NOT NULL,
  asaas_payment_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING',
  pix_payload text,
  pix_encoded_image text,
  pix_expiration_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE public.asaas_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.asaas_payments TO authenticated;
GRANT ALL ON public.asaas_payments TO service_role;

CREATE POLICY "asaas_payments_admin_read" ON public.asaas_payments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "asaas_payments_reseller_read" ON public.asaas_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id AND s.reseller_id = public.current_reseller_id()
    )
  );

-- Idempotência dos webhooks do Asaas.
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id text PRIMARY KEY,
  event text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.asaas_webhook_events TO service_role;

-- Vendas via Pix só consomem créditos quando efetivamente recebidas.
CREATE OR REPLACE FUNCTION public.consume_sale_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal integer;
BEGIN
  IF NEW.status <> 'pago' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pago' THEN
    RETURN NEW;
  END IF;

  SELECT credits_balance INTO bal
  FROM public.resellers
  WHERE id = NEW.reseller_id
  FOR UPDATE;

  IF bal IS NULL THEN
    RAISE EXCEPTION 'Revenda nao encontrada';
  END IF;

  IF NEW.credits > 0 AND bal < NEW.credits THEN
    RAISE EXCEPTION 'Saldo de creditos insuficiente para esta venda';
  END IF;

  IF NEW.credits > 0 THEN
    INSERT INTO public.credit_movements (reseller_id, delta, reason, note, created_by)
    VALUES (
      NEW.reseller_id,
      -NEW.credits,
      'venda',
      NEW.plan_name || ' - ' || NEW.customer_name,
      NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_consume_credits ON public.sales;
CREATE TRIGGER sales_consume_credits
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.consume_sale_credits();

CREATE INDEX IF NOT EXISTS idx_sales_customer_email ON public.sales (lower(customer_email));
CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON public.sales (customer_phone);
CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON public.sales (lower(customer_name));
CREATE INDEX IF NOT EXISTS idx_sales_reseller_created ON public.sales (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_sale ON public.asaas_payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_payment ON public.asaas_payments (asaas_payment_id);
