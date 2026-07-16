
CREATE OR REPLACE FUNCTION public.transfer_store_ownership(
  _store_id uuid,
  _new_owner_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _store_id IS NULL OR _new_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  -- Lock store row for the duration of the transaction
  PERFORM 1 FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.store_memberships
    WHERE store_id = _store_id
      AND user_id = _new_owner_user_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'target_membership_not_active';
  END IF;
  UPDATE public.store_memberships
    SET role = 'manager'
    WHERE store_id = _store_id
      AND role = 'owner'
      AND status = 'active'
      AND user_id <> _new_owner_user_id;
  UPDATE public.store_memberships
    SET role = 'owner', status = 'active'
    WHERE store_id = _store_id
      AND user_id = _new_owner_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_store_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_store_ownership(uuid, uuid) TO service_role;
