CREATE OR REPLACE FUNCTION public.create_public_order(
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_neighborhood_id uuid,
  p_payment_method payment_method,
  p_items jsonb
)
 RETURNS TABLE(order_id uuid, subtotal numeric, delivery_fee numeric, total numeric, whatsapp_number text)
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
  v_item jsonb;
  v_var_id uuid;
  v_qty int;
  v_price numeric(12,2);
  v_pname text;
  v_vname text;
  v_stock int;
  v_var_store uuid;
BEGIN
  IF v_name = '' OR v_phone = '' OR v_address = '' THEN
    RAISE EXCEPTION 'Dados do cliente incompletos';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT n.store_id, n.name, n.delivery_fee
    INTO v_store_id, v_neighborhood_name, v_delivery_fee
    FROM public.neighborhoods AS n
   WHERE n.id = p_neighborhood_id AND n.active = true;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Bairro indisponível';
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_var_id := (v_item->>'variation_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;

    SELECT v.price, v.stock, p.name, v.name, p.store_id
      INTO v_price, v_stock, v_pname, v_vname, v_var_store
      FROM public.variations v
      JOIN public.products p ON p.id = v.product_id
     WHERE v.id = v_var_id AND v.active AND p.active AND p.visible;

    IF v_price IS NULL OR v_var_store <> v_store_id THEN
      RAISE EXCEPTION 'Produto indisponível';
    END IF;
    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'Sem estoque para %', v_pname;
    END IF;

    INSERT INTO public.order_items (
      order_id, variation_id, product_name, variation_name,
      unit_price, quantity, line_total
    ) VALUES (
      v_order_id, v_var_id, v_pname, v_vname,
      v_price, v_qty, v_price * v_qty
    );

    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;
  UPDATE public.orders AS o
     SET subtotal = v_subtotal, total = v_total
   WHERE o.id = v_order_id;

  SELECT s.whatsapp_number INTO v_whatsapp
    FROM public.store_settings AS s
   WHERE s.store_id = v_store_id;

  RETURN QUERY SELECT
    v_order_id AS order_id,
    v_subtotal AS subtotal,
    v_delivery_fee AS delivery_fee,
    v_total AS total,
    COALESCE(v_whatsapp, '') AS whatsapp_number;
END;
$function$;