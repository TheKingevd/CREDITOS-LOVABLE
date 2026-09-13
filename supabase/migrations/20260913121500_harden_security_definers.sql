-- Hardening adicional: SECURITY DEFINER sem search_path mutável.
-- PostgreSQL procura pg_catalog implicitamente; objetos da aplicação ficam
-- sempre referenciados por schema explícito.
ALTER FUNCTION public.create_sale_secure(uuid,text,text,text,text,text,text) SET search_path = '';
ALTER FUNCTION public.admin_adjust_credits_secure(uuid,integer,text,text) SET search_path = '';
ALTER FUNCTION public.admin_update_platform_settings(text,boolean,text,text[]) SET search_path = '';
ALTER FUNCTION public.consume_sale_credits() SET search_path = '';
ALTER FUNCTION public.apply_credit_movement() SET search_path = '';
ALTER FUNCTION public.has_role(uuid,public.app_role) SET search_path = '';
ALTER FUNCTION public.current_reseller_id() SET search_path = '';
ALTER FUNCTION public.link_reseller_account() SET search_path = '';
ALTER FUNCTION public.claim_admin() SET search_path = '';

-- O browser nunca deve conseguir executar o caminho legado de inserção de
-- vendas/movimentações diretamente. O fluxo público passa pelos RPCs acima.
REVOKE INSERT, UPDATE, DELETE ON public.sales FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_movements FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.asaas_payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.asaas_webhook_events FROM anon, authenticated;

-- Eventos financeiros e pagamentos são somente leitura para administradores
-- no Data API; alterações ficam no backend/service_role.
GRANT SELECT ON public.asaas_payments TO authenticated;
REVOKE ALL ON public.asaas_webhook_events FROM anon, authenticated;

-- Permissões explícitas de execução: sem EXECUTE público em funções sensíveis.
REVOKE EXECUTE ON FUNCTION public.create_sale_secure(uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits_secure(uuid,integer,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_platform_settings(text,boolean,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_secure(uuid,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits_secure(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(text,boolean,text,text[]) TO authenticated;

-- Configuração administrativa não aceita destinos arbitrários de rede: o
-- backend usa somente endpoints Asaas definidos por ambiente. A URL abaixo é
-- apenas informativa para o painel/webhook e não é usada como destino outbound.
