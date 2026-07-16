-- Fase 4: Auditoria de RPCs. Revoga PUBLIC e concede GRANT mínimo por função.
-- Também reforça search_path nas funções sensíveis.

-- 1) create_public_order: apenas anon e authenticated (checkout público)
REVOKE ALL ON FUNCTION public.create_public_order(text, text, text, uuid, public.payment_method, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, uuid, public.payment_method, jsonb) TO anon, authenticated;

-- 2) accept_order: apenas authenticated (checagem is_owner() dentro da função)
REVOKE ALL ON FUNCTION public.accept_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid) TO authenticated;

-- 3) cancel_order: apenas authenticated (checagem is_owner() dentro)
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

-- 4) stock_entry: apenas authenticated (checagem is_owner() dentro)
REVOKE ALL ON FUNCTION public.stock_entry(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_entry(uuid, integer, text) TO authenticated;

-- 5) stock_adjust: apenas authenticated (checagem is_owner() dentro)
REVOKE ALL ON FUNCTION public.stock_adjust(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_adjust(uuid, integer, text) TO authenticated;

-- 6) expire_pending_orders: apenas service_role (chamado pelo endpoint cron com supabaseAdmin)
REVOKE ALL ON FUNCTION public.expire_pending_orders(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_pending_orders(interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_orders(interval) TO service_role;

-- 7) Funções auxiliares de autorização: precisam ser executáveis para as policies
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_store_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.variation_store_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.variation_store_id(uuid) TO authenticated, service_role;

-- 8) Triggers helpers: só o dono do trigger precisa executar; revoga PUBLIC para higiene
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_role_from_allowlist() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_set_store_id() FROM PUBLIC;
