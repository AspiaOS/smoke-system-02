-- 1) Singleton: no máximo 1 linha em stores
CREATE UNIQUE INDEX IF NOT EXISTS stores_singleton ON public.stores ((true));

-- 2) Helper: id da loja única (STABLE, sem SECURITY DEFINER pois stores é legível por qualquer autenticado/anon via RLS)
CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT id FROM public.stores LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.current_store_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated, anon, service_role;

-- 3) Trigger genérico: injeta store_id se ausente
CREATE OR REPLACE FUNCTION public.tg_set_store_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.store_id IS NULL THEN
    NEW.store_id := public.current_store_id();
  END IF;
  -- Rejeita explicitamente store_id divergente
  IF NEW.store_id <> public.current_store_id() THEN
    RAISE EXCEPTION 'invalid_store_id' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','neighborhoods','expenses','customers','orders','sales','audit_logs','store_settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_store_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_store_id BEFORE INSERT OR UPDATE OF store_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_store_id()',
      t
    );
  END LOOP;
END $$;

-- 4) Reforço nas policies: além de is_owner(), exige store_id casando com a loja única.
-- Recriação idempotente das políticas administrativas.
DO $$
DECLARE
  r record;
BEGIN
  -- categories
  DROP POLICY IF EXISTS "owners read all categories" ON public.categories;
  DROP POLICY IF EXISTS "owners write categories" ON public.categories;
  CREATE POLICY "owners read all categories" ON public.categories
    FOR SELECT TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id());
  CREATE POLICY "owners write categories" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());

  -- products
  DROP POLICY IF EXISTS "owners manage products" ON public.products;
  CREATE POLICY "owners manage products" ON public.products
    FOR ALL TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());

  -- variations (sem store_id direto — via product)
  DROP POLICY IF EXISTS "owners manage variations" ON public.variations;
  CREATE POLICY "owners manage variations" ON public.variations
    FOR ALL TO authenticated
    USING (
      public.is_owner()
      AND EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
      )
    )
    WITH CHECK (
      public.is_owner()
      AND EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = variations.product_id
           AND p.store_id = public.current_store_id()
      )
    );

  -- neighborhoods
  DROP POLICY IF EXISTS "owners manage neighborhoods" ON public.neighborhoods;
  CREATE POLICY "owners manage neighborhoods" ON public.neighborhoods
    FOR ALL TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());

  -- customers
  DROP POLICY IF EXISTS "owners manage customers" ON public.customers;
  CREATE POLICY "owners manage customers" ON public.customers
    FOR ALL TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());

  -- orders
  DROP POLICY IF EXISTS "owners read orders" ON public.orders;
  DROP POLICY IF EXISTS "owners update orders" ON public.orders;
  CREATE POLICY "owners read orders" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id());
  CREATE POLICY "owners update orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());

  -- order_items (via order)
  DROP POLICY IF EXISTS "owners read order items" ON public.order_items;
  CREATE POLICY "owners read order items" ON public.order_items
    FOR SELECT TO authenticated
    USING (
      public.is_owner()
      AND EXISTS (
        SELECT 1 FROM public.orders o
         WHERE o.id = order_items.order_id
           AND o.store_id = public.current_store_id()
      )
    );

  -- sales
  DROP POLICY IF EXISTS "owners read sales" ON public.sales;
  CREATE POLICY "owners read sales" ON public.sales
    FOR SELECT TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id());

  -- stock_movements (via variation → product)
  DROP POLICY IF EXISTS "owners read stock movements" ON public.stock_movements;
  CREATE POLICY "owners read stock movements" ON public.stock_movements
    FOR SELECT TO authenticated
    USING (
      public.is_owner()
      AND EXISTS (
        SELECT 1 FROM public.variations v
         JOIN public.products p ON p.id = v.product_id
         WHERE v.id = stock_movements.variation_id
           AND p.store_id = public.current_store_id()
      )
    );

  -- expenses
  DROP POLICY IF EXISTS "owners manage expenses" ON public.expenses;
  CREATE POLICY "owners manage expenses" ON public.expenses
    FOR ALL TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());

  -- audit_logs
  DROP POLICY IF EXISTS "owners read audit logs" ON public.audit_logs;
  CREATE POLICY "owners read audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id());

  -- store_settings: leitura pública amplamente (será restringida na Fase 6); write só owner
  DROP POLICY IF EXISTS "owners update store settings" ON public.store_settings;
  CREATE POLICY "owners update store settings" ON public.store_settings
    FOR UPDATE TO authenticated
    USING (public.is_owner() AND store_id = public.current_store_id())
    WITH CHECK (public.is_owner() AND store_id = public.current_store_id());
END $$;
