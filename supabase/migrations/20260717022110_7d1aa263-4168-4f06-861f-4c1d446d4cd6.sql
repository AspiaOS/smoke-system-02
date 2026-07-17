
CREATE OR REPLACE FUNCTION public.set_account_status_safe(
  _user_id uuid,
  _new_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_remaining int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;
  IF _new_status NOT IN ('active','suspended','archived') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  -- Trava TODAS as linhas de super_admins ativos durante a transação.
  -- Suspensões simultâneas serializam aqui, eliminando a janela de corrida.
  PERFORM 1
    FROM public.platform_admins
   WHERE role = 'super_admin' AND active = true
   ORDER BY user_id
   FOR UPDATE;

  IF _new_status <> 'active' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.platform_admins
       WHERE user_id = _user_id AND role = 'super_admin' AND active = true
    ) INTO v_is_super;

    IF v_is_super THEN
      -- Reconta super_admins restantes sob o lock.
      -- Espelha assertPlatformAdmin: profile ausente conta como ativo.
      SELECT COUNT(*) INTO v_remaining
        FROM public.platform_admins pa
        LEFT JOIN public.profiles p ON p.id = pa.user_id
       WHERE pa.role = 'super_admin'
         AND pa.active = true
         AND pa.user_id <> _user_id
         AND (p.status IS NULL OR p.status = 'active');

      IF v_remaining = 0 THEN
        RAISE EXCEPTION 'last_super_admin' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE public.profiles
     SET status = _new_status
   WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_status_safe(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_account_status_safe(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_status_safe(uuid, text) TO service_role;
