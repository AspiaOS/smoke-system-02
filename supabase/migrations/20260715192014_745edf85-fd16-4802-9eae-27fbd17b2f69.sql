
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_stock int;
  v_cost numeric;
  v_total_cost numeric := 0;
  v_sale_id uuid;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order_not_pending'; END IF;

  -- Validate + deduct stock atomically
  FOR v_item IN
    SELECT oi.variation_id, oi.quantity, oi.unit_price, v.stock, v.cost
    FROM public.order_items oi
    JOIN public.variations v ON v.id = oi.variation_id
    WHERE oi.order_id = p_order_id
    FOR UPDATE OF v
  LOOP
    IF v_item.stock < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_item.variation_id;
    END IF;

    UPDATE public.variations
       SET stock = stock - v_item.quantity, updated_at = now()
     WHERE id = v_item.variation_id;

    INSERT INTO public.stock_movements(variation_id, type, qty_before, delta, qty_after, actor_id, order_id, note)
    VALUES (v_item.variation_id, 'sale_accept', v_item.stock, -v_item.quantity, v_item.stock - v_item.quantity, auth.uid(), p_order_id, 'Aceite de pedido');

    v_total_cost := v_total_cost + (v_item.cost * v_item.quantity);
  END LOOP;

  UPDATE public.orders
     SET status = 'accepted', accepted_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.sales(store_id, order_id, customer_id, subtotal, delivery_fee, total, total_cost, gross_profit, payment_method)
  VALUES (v_order.store_id, v_order.id, v_order.customer_id, v_order.subtotal, v_order.delivery_fee, v_order.total, v_total_cost, v_order.subtotal - v_total_cost, v_order.payment_method)
  RETURNING id INTO v_sale_id;

  INSERT INTO public.audit_logs(store_id, action, entity, entity_id, payload)
  VALUES (v_order.store_id, 'order.accept', 'order', p_order_id, jsonb_build_object('sale_id', v_sale_id));

  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order_not_pending'; END IF;

  UPDATE public.orders
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = COALESCE(p_reason, cancel_reason)
   WHERE id = p_order_id;

  INSERT INTO public.audit_logs(store_id, action, entity, entity_id, payload)
  VALUES (v_order.store_id, 'order.cancel', 'order', p_order_id, jsonb_build_object('reason', p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.accept_order(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;
