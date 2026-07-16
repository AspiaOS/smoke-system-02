-- =====================================================================
-- SMOKE CONTROL — Fase 4: autorização por capability no banco
-- =====================================================================

CREATE OR REPLACE FUNCTION public.has_store_capability(
  _user_id uuid,
  _store_id uuid,
  _capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH membership AS (
    SELECT role
      FROM public.store_memberships
     WHERE user_id = _user_id
       AND store_id = _store_id
       AND status = 'active'
     LIMIT 1
  )
  SELECT COALESCE(EXISTS (
    SELECT 1
      FROM membership m
     WHERE CASE m.role
       WHEN 'owner' THEN TRUE
       WHEN 'manager' THEN _capability <> 'members.remove'
       WHEN 'seller' THEN _capability = ANY (ARRAY[
         'dashboard.view',
         'products.view',
         'categories.view',
         'orders.view', 'orders.create',
         'customers.view', 'customers.update_notes',
         'sales.view'
       ])
       WHEN 'stock_operator' THEN _capability = ANY (ARRAY[
         'dashboard.view',
         'products.view',
         'stock.view', 'stock.entry', 'stock.adjust'
       ])
       WHEN 'auditor' THEN _capability = ANY (ARRAY[
         'dashboard.view',
         'products.view', 'categories.view',
         'orders.view', 'customers.view',
         'sales.view', 'sales.view_cost', 'sales.view_profit',
         'expenses.view',
         'stock.view',
         'shipping.view',
         'audit.view'
       ])
       ELSE FALSE
     END
  ), FALSE)
$$;

REVOKE ALL ON FUNCTION public.has_store_capability(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_store_capability(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_capability(uuid, uuid, text) TO service_role;

-- Compatibilidade: is_owner continua existindo, mas passa a representar ownership via membership ativa.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.store_memberships sm
      JOIN public.stores s ON s.id = sm.store_id
     WHERE sm.user_id = auth.uid()
       AND sm.role = 'owner'
       AND sm.status = 'active'
       AND s.id = public.current_store_id()
  )
$$;

DO $$
BEGIN
  -- categories
  DROP POLICY IF EXISTS "owners read all categories" ON public.categories;
  DROP POLICY IF EXISTS "owners write categories" ON public.categories;
  DROP POLICY IF EXISTS "staff read categories" ON public.categories;
  DROP POLICY IF EXISTS "staff manage categories" ON public.categories;
  CREATE POLICY "staff read categories" ON public.categories
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'categories.view')
    );
  CREATE POLICY "staff manage categories" ON public.categories
    FOR ALL TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'categories.manage')
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'categories.manage')
    );

  -- products
  DROP POLICY IF EXISTS "owners manage products" ON public.products;
  DROP POLICY IF EXISTS "staff read products" ON public.products;
  DROP POLICY IF EXISTS "staff create products" ON public.products;
  DROP POLICY IF EXISTS "staff update products" ON public.products;
  DROP POLICY IF EXISTS "staff delete products" ON public.products;
  CREATE POLICY "staff read products" ON public.products
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'products.view')
    );
  CREATE POLICY "staff create products" ON public.products
    FOR INSERT TO authenticated
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'products.create')
    );
  CREATE POLICY "staff update products" ON public.products
    FOR UPDATE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'products.update')
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'products.update')
    );
  CREATE POLICY "staff delete products" ON public.products
    FOR DELETE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'products.update')
    );

  -- variations (store via product)
  DROP POLICY IF EXISTS "owners manage variations" ON public.variations;
  DROP POLICY IF EXISTS "staff read variations" ON public.variations;
  DROP POLICY IF EXISTS "staff create variations" ON public.variations;
  DROP POLICY IF EXISTS "staff update variations" ON public.variations;
  DROP POLICY IF EXISTS "staff delete variations" ON public.variations;
  CREATE POLICY "staff read variations" ON public.variations
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), p.store_id, 'products.view')
      )
    );
  CREATE POLICY "staff create variations" ON public.variations
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), p.store_id, 'products.create')
      )
    );
  CREATE POLICY "staff update variations" ON public.variations
    FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), p.store_id, 'products.update')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), p.store_id, 'products.update')
      )
    );
  CREATE POLICY "staff delete variations" ON public.variations
    FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), p.store_id, 'products.update')
      )
    );

  -- neighborhoods / shipping
  DROP POLICY IF EXISTS "owners manage neighborhoods" ON public.neighborhoods;
  DROP POLICY IF EXISTS "staff read neighborhoods" ON public.neighborhoods;
  DROP POLICY IF EXISTS "staff manage neighborhoods" ON public.neighborhoods;
  CREATE POLICY "staff read neighborhoods" ON public.neighborhoods
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'shipping.view')
    );
  CREATE POLICY "staff manage neighborhoods" ON public.neighborhoods
    FOR ALL TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'shipping.manage')
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'shipping.manage')
    );

  -- customers
  DROP POLICY IF EXISTS "owners manage customers" ON public.customers;
  DROP POLICY IF EXISTS "staff read customers" ON public.customers;
  DROP POLICY IF EXISTS "staff create customers" ON public.customers;
  DROP POLICY IF EXISTS "staff update customers" ON public.customers;
  DROP POLICY IF EXISTS "staff delete customers" ON public.customers;
  CREATE POLICY "staff read customers" ON public.customers
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'customers.view')
    );
  CREATE POLICY "staff create customers" ON public.customers
    FOR INSERT TO authenticated
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'customers.update_notes')
    );
  CREATE POLICY "staff update customers" ON public.customers
    FOR UPDATE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'customers.update_notes')
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'customers.update_notes')
    );
  CREATE POLICY "staff delete customers" ON public.customers
    FOR DELETE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'customers.update_notes')
    );

  -- orders
  DROP POLICY IF EXISTS "owners read orders" ON public.orders;
  DROP POLICY IF EXISTS "owners update orders" ON public.orders;
  DROP POLICY IF EXISTS "staff read orders" ON public.orders;
  DROP POLICY IF EXISTS "staff update orders" ON public.orders;
  CREATE POLICY "staff read orders" ON public.orders
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'orders.view')
    );
  CREATE POLICY "staff update orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND (
        public.has_store_capability(auth.uid(), store_id, 'orders.accept')
        OR public.has_store_capability(auth.uid(), store_id, 'orders.cancel')
      )
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND (
        public.has_store_capability(auth.uid(), store_id, 'orders.accept')
        OR public.has_store_capability(auth.uid(), store_id, 'orders.cancel')
      )
    );

  -- order_items
  DROP POLICY IF EXISTS "owners read order items" ON public.order_items;
  DROP POLICY IF EXISTS "staff read order items" ON public.order_items;
  CREATE POLICY "staff read order items" ON public.order_items
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.orders o
         WHERE o.id = order_items.order_id
           AND o.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), o.store_id, 'orders.view')
      )
    );

  -- sales
  DROP POLICY IF EXISTS "owners read sales" ON public.sales;
  DROP POLICY IF EXISTS "staff read sales" ON public.sales;
  CREATE POLICY "staff read sales" ON public.sales
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'sales.view')
    );

  -- stock_movements
  DROP POLICY IF EXISTS "owners read stock movements" ON public.stock_movements;
  DROP POLICY IF EXISTS "staff read stock movements" ON public.stock_movements;
  CREATE POLICY "staff read stock movements" ON public.stock_movements
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
          FROM public.variations v
          JOIN public.products p ON p.id = v.product_id
         WHERE v.id = stock_movements.variation_id
           AND p.store_id = public.current_store_id()
           AND public.has_store_capability(auth.uid(), p.store_id, 'stock.view')
      )
    );

  -- expenses
  DROP POLICY IF EXISTS "owners manage expenses" ON public.expenses;
  DROP POLICY IF EXISTS "staff read expenses" ON public.expenses;
  DROP POLICY IF EXISTS "staff create expenses" ON public.expenses;
  DROP POLICY IF EXISTS "staff update expenses" ON public.expenses;
  DROP POLICY IF EXISTS "staff delete expenses" ON public.expenses;
  CREATE POLICY "staff read expenses" ON public.expenses
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'expenses.view')
    );
  CREATE POLICY "staff create expenses" ON public.expenses
    FOR INSERT TO authenticated
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'expenses.create')
    );
  CREATE POLICY "staff update expenses" ON public.expenses
    FOR UPDATE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'expenses.update')
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'expenses.update')
    );
  CREATE POLICY "staff delete expenses" ON public.expenses
    FOR DELETE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'expenses.delete')
    );

  -- audit_logs
  DROP POLICY IF EXISTS "owners read audit logs" ON public.audit_logs;
  DROP POLICY IF EXISTS "staff read audit logs" ON public.audit_logs;
  CREATE POLICY "staff read audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'audit.view')
    );

  -- store_settings
  DROP POLICY IF EXISTS "owners update store settings" ON public.store_settings;
  DROP POLICY IF EXISTS "staff update store settings" ON public.store_settings;
  CREATE POLICY "staff update store settings" ON public.store_settings
    FOR UPDATE TO authenticated
    USING (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'settings.manage')
    )
    WITH CHECK (
      store_id = public.current_store_id()
      AND public.has_store_capability(auth.uid(), store_id, 'settings.manage')
    );
END $$;

-- Estoque: funções de escrita com capabilities específicas.
CREATE OR REPLACE FUNCTION public.stock_entry(
  _variation_id uuid,
  _qty integer,
  _note text DEFAULT NULL::text
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before int;
  v_after int;
  v_mov public.stock_movements;
  v_store uuid;
BEGIN
  SELECT public.variation_store_id(_variation_id) INTO v_store;
  IF v_store IS NULL THEN RAISE EXCEPTION 'variation_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_store, 'stock.entry') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'qty_must_be_positive' USING ERRCODE = '22023'; END IF;

  SELECT stock INTO v_before FROM public.variations WHERE id = _variation_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'variation_not_found' USING ERRCODE = '22023'; END IF;

  v_after := v_before + _qty;
  UPDATE public.variations SET stock = v_after WHERE id = _variation_id;

  INSERT INTO public.stock_movements(variation_id, type, qty_before, delta, qty_after, actor_id, note)
  VALUES (_variation_id, 'entry', v_before, _qty, v_after, auth.uid(), _note)
  RETURNING * INTO v_mov;

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_store, auth.uid(), 'stock.entry', 'variation', _variation_id::text,
          jsonb_build_object('before', v_before, 'after', v_after, 'qty', _qty, 'note', _note));

  RETURN v_mov;
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_adjust(
  _variation_id uuid,
  _new_qty integer,
  _note text
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before int;
  v_delta int;
  v_mov public.stock_movements;
  v_store uuid;
BEGIN
  SELECT public.variation_store_id(_variation_id) INTO v_store;
  IF v_store IS NULL THEN RAISE EXCEPTION 'variation_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_store, 'stock.adjust') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _new_qty IS NULL OR _new_qty < 0 THEN RAISE EXCEPTION 'invalid_new_qty' USING ERRCODE = '22023'; END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN RAISE EXCEPTION 'note_required' USING ERRCODE = '22023'; END IF;

  SELECT stock INTO v_before FROM public.variations WHERE id = _variation_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'variation_not_found' USING ERRCODE = '22023'; END IF;

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

-- Pedidos: aceite/cancelamento com capabilities específicas.
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_total_cost numeric := 0;
  v_sale_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_order.store_id, 'orders.accept') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_order.store_id, auth.uid(), 'order.accept', 'order', p_order_id::text, jsonb_build_object('sale_id', v_sale_id));

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
  v_item record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_order.store_id, 'orders.cancel') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_order.store_id, auth.uid(), 'order.cancel', 'order', p_order_id::text, jsonb_build_object('reason', p_reason));
END;
$$;

-- Calendário de auditoria: exige audit.view para logs gerais e stock.view para estoque.
CREATE OR REPLACE FUNCTION public.get_audit_activity(
  p_source text,
  p_from date,
  p_to date,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(activity_date date, activity_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_cap text;
BEGIN
  v_store := public.current_store_id();
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'store_not_found' USING ERRCODE = '22023';
  END IF;

  v_cap := CASE p_source
    WHEN 'audit' THEN 'audit.view'
    WHEN 'stock' THEN 'stock.view'
    ELSE NULL
  END;
  IF v_cap IS NULL THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_store_capability(auth.uid(), v_store, v_cap) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_source = 'audit' THEN
    RETURN QUERY
    WITH days AS (
      SELECT generate_series(p_from, p_to, interval '1 day')::date AS d
    ),
    counts AS (
      SELECT ((al.created_at AT TIME ZONE p_timezone))::date AS d, count(*)::bigint AS c
      FROM public.audit_logs al
      WHERE al.store_id = v_store
        AND al.created_at >= (p_from::timestamp AT TIME ZONE p_timezone)
        AND al.created_at <  ((p_to + 1)::timestamp AT TIME ZONE p_timezone)
      GROUP BY 1
    )
    SELECT days.d, COALESCE(counts.c, 0)
    FROM days LEFT JOIN counts USING (d)
    ORDER BY days.d;
  ELSE
    RETURN QUERY
    WITH days AS (
      SELECT generate_series(p_from, p_to, interval '1 day')::date AS d
    ),
    counts AS (
      SELECT ((sm.created_at AT TIME ZONE p_timezone))::date AS d, count(*)::bigint AS c
      FROM public.stock_movements sm
      JOIN public.variations v ON v.id = sm.variation_id
      JOIN public.products p ON p.id = v.product_id
      WHERE p.store_id = v_store
        AND sm.created_at >= (p_from::timestamp AT TIME ZONE p_timezone)
        AND sm.created_at <  ((p_to + 1)::timestamp AT TIME ZONE p_timezone)
      GROUP BY 1
    )
    SELECT days.d, COALESCE(counts.c, 0)
    FROM days LEFT JOIN counts USING (d)
    ORDER BY days.d;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_entry(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_adjust(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_audit_activity(text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_entry(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjust(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_activity(text, date, date, text) TO authenticated;