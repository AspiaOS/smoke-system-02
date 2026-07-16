-- 1) Coluna de reserva + constraints
ALTER TABLE public.variations
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.variations
  DROP CONSTRAINT IF EXISTS variations_stock_nonneg,
  DROP CONSTRAINT IF EXISTS variations_reserved_nonneg,
  DROP CONSTRAINT IF EXISTS variations_reserved_le_stock;

ALTER TABLE public.variations
  ADD CONSTRAINT variations_stock_nonneg CHECK (stock >= 0),
  ADD CONSTRAINT variations_reserved_nonneg CHECK (reserved_quantity >= 0),
  ADD CONSTRAINT variations_reserved_le_stock CHECK (reserved_quantity <= stock);

-- 2) create_public_order com reserva atômica
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_neighborhood_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb
)
RETURNS TABLE(
  order_id uuid,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  whatsapp_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_store_id uuid;
  v_neighborhood_name text;
  v_delivery_fee numeric(12,2);
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2);
  v_whatsapp text;
  v_name text := btrim(p_customer_name);
  v_phone text := btrim(p_customer_phone);
  v_address text := btrim(p_address);
  v_item record;
  v_price numeric(12,2);
  v_pname text;
  v_vname text;
  v_available int;
  v_var_store uuid;
  v_max_items constant int := 50;
  v_max_qty_per_item constant int := 99;
BEGIN
  IF v_name = '' OR v_phone = '' OR v_address = '' THEN
    RAISE EXCEPTION 'invalid_customer' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 120 OR length(v_phone) > 30 OR length(v_address) > 500 THEN
    RAISE EXCEPTION 'invalid_customer' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > v_max_items THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  SELECT n.store_id, n.name, n.delivery_fee
    INTO v_store_id, v_neighborhood_name, v_delivery_fee
    FROM public.neighborhoods AS n
   WHERE n.id = p_neighborhood_id AND n.active = true;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'neighborhood_unavailable' USING ERRCODE = '22023';
  END IF;

  -- Consolida itens duplicados e valida quantidades. Ordem determinística evita deadlock.
  CREATE TEMP TABLE _cart(variation_id uuid PRIMARY KEY, quantity int NOT NULL) ON COMMIT DROP;

  INSERT INTO _cart(variation_id, quantity)
  SELECT (elem->>'variation_id')::uuid,
         SUM(COALESCE((elem->>'quantity')::int, 0))::int
    FROM jsonb_array_elements(p_items) AS elem
   GROUP BY (elem->>'variation_id')::uuid;

  IF EXISTS (SELECT 1 FROM _cart WHERE quantity <= 0 OR quantity > v_max_qty_per_item) THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.customers AS c (store_id, phone, name, last_address, last_neighborhood)
  VALUES (v_store_id, v_phone, v_name, v_address, v_neighborhood_name)
  ON CONFLICT (store_id, phone) DO UPDATE
    SET name = EXCLUDED.name,
        last_address = EXCLUDED.last_address,
        last_neighborhood = EXCLUDED.last_neighborhood,
        updated_at = now()
  RETURNING c.id INTO v_customer_id;

  INSERT INTO public.orders AS o (
    store_id, status, customer_id, customer_name, customer_phone,
    address, neighborhood_name, delivery_fee, payment_method,
    subtotal, total
  ) VALUES (
    v_store_id, 'pending', v_customer_id, v_name, v_phone,
    v_address, v_neighborhood_name, v_delivery_fee, p_payment_method,
    0, 0
  ) RETURNING o.id INTO v_order_id;

  -- Trava e reserva em ordem determinística por variation_id.
  FOR v_item IN
    SELECT c.variation_id, c.quantity
      FROM _cart c
      ORDER BY c.variation_id
  LOOP
    SELECT v.price,
           (v.stock - v.reserved_quantity),
           p.name, v.name, p.store_id
      INTO v_price, v_available, v_pname, v_vname, v_var_store
      FROM public.variations v
      JOIN public.products p ON p.id = v.product_id
     WHERE v.id = v_item.variation_id
       AND v.active
       AND p.active
       AND p.visible
       FOR UPDATE OF v;

    IF v_price IS NULL OR v_var_store <> v_store_id THEN
      RAISE EXCEPTION 'product_unavailable' USING ERRCODE = '22023';
    END IF;
    IF v_available < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_item.variation_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.variations
       SET reserved_quantity = reserved_quantity + v_item.quantity,
           updated_at = now()
     WHERE id = v_item.variation_id;

    INSERT INTO public.order_items (
      order_id, variation_id, product_name, variation_name,
      unit_price, quantity, line_total
    ) VALUES (
      v_order_id, v_item.variation_id, v_pname, v_vname,
      v_price, v_item.quantity, v_price * v_item.quantity
    );

    v_subtotal := v_subtotal + (v_price * v_item.quantity);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;
  UPDATE public.orders AS o
     SET subtotal = v_subtotal, total = v_total
   WHERE o.id = v_order_id;

  SELECT s.whatsapp_number INTO v_whatsapp
    FROM public.store_settings AS s
   WHERE s.store_id = v_store_id;

  RETURN QUERY SELECT
    v_order_id, v_subtotal, v_delivery_fee, v_total, COALESCE(v_whatsapp, '');
END;
$function$;

-- 3) accept_order: consome estoque físico e libera a reserva
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_stock int;
  v_reserved int;
  v_cost numeric;
  v_total_cost numeric := 0;
  v_sale_id uuid;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023'; END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'order_not_pending' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT oi.variation_id, oi.quantity, oi.unit_price, v.stock, v.reserved_quantity, v.cost
      FROM public.order_items oi
      JOIN public.variations v ON v.id = oi.variation_id
     WHERE oi.order_id = p_order_id
     ORDER BY oi.variation_id
     FOR UPDATE OF v
  LOOP
    IF v_item.stock < v_item.quantity OR v_item.reserved_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_item.variation_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.variations
       SET stock = stock - v_item.quantity,
           reserved_quantity = reserved_quantity - v_item.quantity,
           updated_at = now()
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
  VALUES (v_order.store_id, 'order.accept', 'order', p_order_id::text, jsonb_build_object('sale_id', v_sale_id));

  RETURN v_sale_id;
END;
$function$;

-- 4) cancel_order: libera a reserva
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023'; END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'order_not_pending' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT oi.variation_id, oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
     ORDER BY oi.variation_id
     FOR UPDATE OF oi
  LOOP
    UPDATE public.variations
       SET reserved_quantity = GREATEST(reserved_quantity - v_item.quantity, 0),
           updated_at = now()
     WHERE id = v_item.variation_id;
  END LOOP;

  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = COALESCE(p_reason, cancel_reason)
   WHERE id = p_order_id;

  INSERT INTO public.audit_logs(store_id, action, entity, entity_id, payload)
  VALUES (v_order.store_id, 'order.cancel', 'order', p_order_id::text, jsonb_build_object('reason', p_reason));
END;
$function$;

-- 5) expire_pending_orders: cancela pendentes antigos e libera reservas
CREATE OR REPLACE FUNCTION public.expire_pending_orders(_older_than interval DEFAULT interval '60 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_id uuid;
  v_store_id uuid;
  v_item record;
  v_count int := 0;
BEGIN
  FOR v_order_id, v_store_id IN
    SELECT id, store_id FROM public.orders
     WHERE status = 'pending'
       AND created_at < now() - _older_than
     ORDER BY id
     FOR UPDATE SKIP LOCKED
  LOOP
    FOR v_item IN
      SELECT oi.variation_id, oi.quantity
        FROM public.order_items oi
       WHERE oi.order_id = v_order_id
       ORDER BY oi.variation_id
       FOR UPDATE OF oi
    LOOP
      UPDATE public.variations
         SET reserved_quantity = GREATEST(reserved_quantity - v_item.quantity, 0),
             updated_at = now()
       WHERE id = v_item.variation_id;
    END LOOP;

    UPDATE public.orders
       SET status = 'cancelled',
           cancelled_at = now(),
           cancel_reason = COALESCE(cancel_reason, 'expired')
     WHERE id = v_order_id;

    INSERT INTO public.audit_logs(store_id, action, entity, entity_id, payload)
    VALUES (v_store_id, 'order.expire', 'order', v_order_id::text, jsonb_build_object('reason', 'expired'));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- 6) Grants — restringe execução da RPC de expiração (Fase 4 fará o hardening completo)
REVOKE ALL ON FUNCTION public.expire_pending_orders(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_pending_orders(interval) TO service_role;
