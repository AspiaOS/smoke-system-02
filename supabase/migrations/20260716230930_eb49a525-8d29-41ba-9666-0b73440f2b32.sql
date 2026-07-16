
-- Reinforce the append-only guard function
CREATE OR REPLACE FUNCTION public.tg_platform_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'platform_audit_logs is append-only: UPDATE not allowed' USING ERRCODE = '42501';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform_audit_logs is append-only: DELETE not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

-- Attach the trigger (idempotent)
DROP TRIGGER IF EXISTS platform_audit_logs_append_only ON public.platform_audit_logs;
CREATE TRIGGER platform_audit_logs_append_only
BEFORE UPDATE OR DELETE ON public.platform_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_platform_audit_append_only();
