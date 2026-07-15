
-- Fix stock_adjust: correct store_id lookup via products, not a bogus cast
CREATE OR REPLACE FUNCTION public.stock_adjust(
  _variation_id UUID,
  _new_qty INT,
  _note TEXT
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INT;
  v_delta INT;
  v_mov public.stock_movements;
  v_store UUID;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _new_qty IS NULL OR _new_qty < 0 THEN RAISE EXCEPTION 'invalid_new_qty'; END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT stock INTO v_before FROM public.variations WHERE id = _variation_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'variation_not_found'; END IF;

  SELECT public.variation_store_id(_variation_id) INTO v_store;

  v_delta := _new_qty - v_before;
  UPDATE public.variations SET stock = _new_qty WHERE id = _variation_id;

  INSERT INTO public.stock_movements(variation_id, type, qty_before, delta, qty_after, actor_id, note)
  VALUES (_variation_id, 'adjustment', v_before, v_delta, _new_qty, auth.uid(), _note)
  RETURNING * INTO v_mov;

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_store, auth.uid(), 'stock.adjust', 'variation', _variation_id::text,
          jsonb_build_object('before', v_before, 'after', _new_qty, 'note', _note));

  RETURN v_mov;
END;
$$;

-- Lock down execute on internal helpers so PostgREST can't surface them
REVOKE ALL ON FUNCTION public.tg_touch_updated_at() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.variation_store_id(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.variation_store_id(uuid) TO authenticated;

-- has_role and is_owner: needed by RLS policies. RLS evaluates them regardless of grants.
-- Revoke direct execution to keep them out of the public API.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_owner() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- Stock functions: only signed-in users (function itself gates by is_owner())
REVOKE ALL ON FUNCTION public.stock_entry(uuid, int, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.stock_adjust(uuid, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.stock_entry(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjust(uuid, int, text) TO authenticated;
