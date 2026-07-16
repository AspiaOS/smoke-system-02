-- Fase 8: create_public_order retorna dados canônicos que o banco persistiu.
-- Isso garante que a mensagem WhatsApp e o pedido no banco sejam idênticos.

DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, uuid, public.payment_method, jsonb);

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_customer_name  text,
  p_customer_phone text,
  p_address        text,
  p_neighborhood_id uuid,
  p_payment_method public.payment_method,
  p_items          jsonb
) RETURNS TABLE(
  order_id          uuid,
  subtotal          numeric,
  delivery_fee      numeric,
  total             numeric,
  whatsapp_number   text,
  customer_name     text,
  customer_phone    text,
  address           text,
  neighborhood_name text,
  payment_method    public.payment_method
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    v_order_id,
    v_subtotal,
    v_delivery_fee,
    v_total,
    COALESCE(v_whatsapp, ''),
    v_name,
    v_phone,
    v_address,
    v_neighborhood_name,
    p_payment_method;
END;
$function$;

-- Recompõe grants (DROP FUNCTION apagou-os)
REVOKE ALL ON FUNCTION public.create_public_order(text, text, text, uuid, public.payment_method, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, uuid, public.payment_method, jsonb) TO anon, authenticated;
