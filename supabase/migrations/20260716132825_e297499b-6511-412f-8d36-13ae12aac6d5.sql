-- =====================================================================
-- SMOKE CONTROL — Fase 4 hardening: RPCs administrativas sem anon
-- =====================================================================

REVOKE ALL ON FUNCTION public.has_store_capability(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_entry(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_adjust(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_audit_activity(text, date, date, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_store_capability(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_entry(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjust(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_activity(text, date, date, text) TO authenticated;