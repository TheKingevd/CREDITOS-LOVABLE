-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- roles
CREATE TYPE public.app_role AS ENUM ('admin', 'reseller');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- claim admin when none exists yet
CREATE OR REPLACE FUNCTION public.claim_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  IF has_admin THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_admin() TO authenticated;

-- plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  credits integer NOT NULL DEFAULT 0,
  price_cents integer NOT NULL DEFAULT 0,
  promo_price_cents integer,
  promo_label text,
  features text[] NOT NULL DEFAULT '{}',
  highlight boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT TO anon USING (active);
CREATE POLICY "plans_auth_read" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_admin_write" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- resellers
CREATE TABLE public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  document text,
  commission_pct numeric(5,2) NOT NULL DEFAULT 10,
  credits_balance integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resellers TO authenticated;
GRANT ALL ON public.resellers TO service_role;
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resellers_admin_all" ON public.resellers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "resellers_self_read" ON public.resellers FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.current_reseller_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.resellers WHERE user_id = auth.uid() LIMIT 1;
$$;

-- link a reseller account by email on first login
CREATE OR REPLACE FUNCTION public.link_reseller_account()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; mail text; rid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO rid FROM public.resellers WHERE user_id = uid;
  IF rid IS NOT NULL THEN RETURN rid; END IF;
  SELECT email INTO mail FROM auth.users WHERE id = uid;
  UPDATE public.resellers SET user_id = uid, updated_at = now()
    WHERE user_id IS NULL AND lower(email) = lower(mail)
    RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'reseller') ON CONFLICT DO NOTHING;
  END IF;
  RETURN rid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_reseller_account() TO authenticated;

-- credit movements
CREATE TABLE public.credit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL DEFAULT 'ajuste',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credit_movements TO authenticated;
GRANT ALL ON public.credit_movements TO service_role;
ALTER TABLE public.credit_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements_admin_all" ON public.credit_movements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "movements_self_read" ON public.credit_movements FOR SELECT TO authenticated USING (reseller_id = public.current_reseller_id());

CREATE OR REPLACE FUNCTION public.apply_credit_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.resellers SET credits_balance = credits_balance + NEW.delta, updated_at = now() WHERE id = NEW.reseller_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_movements_apply AFTER INSERT ON public.credit_movements FOR EACH ROW EXECUTE FUNCTION public.apply_credit_movement();

-- sales
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  credits integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  commission_cents integer NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'pix',
  status text NOT NULL DEFAULT 'pago',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_admin_all" ON public.sales FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_self_read" ON public.sales FOR SELECT TO authenticated USING (reseller_id = public.current_reseller_id());
CREATE POLICY "sales_self_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (reseller_id = public.current_reseller_id());

CREATE OR REPLACE FUNCTION public.consume_sale_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal integer;
BEGIN
  SELECT credits_balance INTO bal FROM public.resellers WHERE id = NEW.reseller_id FOR UPDATE;
  IF bal IS NULL THEN RAISE EXCEPTION 'Revenda nao encontrada'; END IF;
  IF NEW.credits > 0 AND bal < NEW.credits THEN
    RAISE EXCEPTION 'Saldo de creditos insuficiente para esta venda';
  END IF;
  IF NEW.credits > 0 THEN
    INSERT INTO public.credit_movements (reseller_id, delta, reason, note, created_by)
    VALUES (NEW.reseller_id, -NEW.credits, 'venda', NEW.plan_name || ' - ' || NEW.customer_name, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_consume_credits AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.consume_sale_credits();

-- seed plans
INSERT INTO public.plans (name, description, credits, price_cents, promo_price_cents, promo_label, features, highlight, sort_order) VALUES
('Free', 'Para comecar a explorar', 5, 0, NULL, NULL, ARRAY['5 creditos por dia','Projetos publicos','Suporte da comunidade'], false, 1),
('Pro 100', 'Para quem cria toda semana', 100, 12500, 9900, 'Promo de lancamento', ARRAY['100 creditos por mes','Projetos privados','Dominio personalizado','Suporte prioritario'], true, 2),
('Pro 200', 'Mais volume de criacao', 200, 25000, NULL, NULL, ARRAY['200 creditos por mes','Projetos privados','Dominio personalizado'], false, 3),
('Pro 400', 'Para uso intenso', 400, 50000, NULL, NULL, ARRAY['400 creditos por mes','Projetos privados','Dominio personalizado'], false, 4),
('Pro 800', 'Alta demanda', 800, 100000, NULL, NULL, ARRAY['800 creditos por mes','Projetos privados','Suporte prioritario'], false, 5),
('Business', 'Para times e agencias', 500, 250000, NULL, NULL, ARRAY['Creditos compartilhados','Espaco de time','SSO','Suporte dedicado'], false, 6);