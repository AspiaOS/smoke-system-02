
-- =========================================================================
-- SMOKE — Foundation schema (Phase 0 + role/security scaffolding for Phase 1)
-- =========================================================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('owner','manager','seller','stock_operator');
CREATE TYPE public.order_status AS ENUM ('pending','accepted','cancelled');
CREATE TYPE public.payment_method AS ENUM ('pix','cash','debit','credit');
CREATE TYPE public.stock_movement_type AS ENUM ('entry','adjustment','sale_accept');

-- =========================================================================
-- Utility trigger: keep updated_at fresh
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- Core tenant table
-- =========================================================================
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read stores" ON public.stores
  FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- Profiles (1 per auth.users)
-- =========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================================================================
-- user_roles (separate table, per Lovable security rules)
-- =========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner'::public.app_role)
$$;

-- Trigger: on new auth user, create profile + owner role (single-tenant MVP)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.profiles (id, store_id, display_name)
  VALUES (NEW.id, v_store_id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  -- MVP: first user becomes owner. Additional users get no role (locked out) until manually granted.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- Catalog: categories, products, variations
-- =========================================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  name VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active categories" ON public.categories
  FOR SELECT TO anon USING (active = true);
CREATE POLICY "owners read all categories" ON public.categories
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "owners write categories" ON public.categories
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  category_id UUID NOT NULL REFERENCES public.categories(id),
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(80),
  description TEXT,
  images TEXT[] NOT NULL DEFAULT '{}',
  video_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  visible BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage products" ON public.products
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variations TO authenticated;
GRANT ALL ON public.variations TO service_role;
ALTER TABLE public.variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage variations" ON public.variations
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE TRIGGER trg_variations_touch BEFORE UPDATE ON public.variations
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Public catalog view (anon-safe: no cost, no numeric stock)
CREATE VIEW public.public_catalog
WITH (security_invoker=true) AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.brand,
  p.description,
  p.images,
  p.video_url,
  p.featured,
  p.category_id,
  c.name AS category_name,
  v.id AS variation_id,
  v.name AS variation_name,
  v.price,
  (v.stock > 0) AS in_stock
FROM public.products p
JOIN public.variations v ON v.product_id = p.id
JOIN public.categories c ON c.id = p.category_id
WHERE p.active AND p.visible AND c.active AND v.active AND v.stock > 0;
GRANT SELECT ON public.public_catalog TO anon, authenticated;

-- =========================================================================
-- Stock movements
-- =========================================================================
CREATE TABLE public.stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variation_id UUID NOT NULL REFERENCES public.variations(id),
  type public.stock_movement_type NOT NULL,
  qty_before INT NOT NULL,
  delta INT NOT NULL,
  qty_after INT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  order_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read stock movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (public.is_owner());
-- No INSERT/UPDATE/DELETE policies: writes go through SECURITY DEFINER functions only.

-- =========================================================================
-- Shipping neighborhoods
-- =========================================================================
CREATE TABLE public.neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  name VARCHAR(120) NOT NULL,
  delivery_fee NUMERIC(12,2) NOT NULL CHECK (delivery_fee >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.neighborhoods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neighborhoods TO authenticated;
GRANT ALL ON public.neighborhoods TO service_role;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active neighborhoods" ON public.neighborhoods
  FOR SELECT TO anon USING (active = true);
CREATE POLICY "owners manage neighborhoods" ON public.neighborhoods
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- =========================================================================
-- Customers / Orders / Order items / Sales
-- =========================================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  last_address TEXT,
  last_neighborhood VARCHAR(120),
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, phone)
);
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage customers" ON public.customers
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  status public.order_status NOT NULL DEFAULT 'pending',
  customer_id UUID REFERENCES public.customers(id),
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  neighborhood_name VARCHAR(120) NOT NULL,
  delivery_fee NUMERIC(12,2) NOT NULL,
  payment_method public.payment_method NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT
);
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read orders" ON public.orders
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "owners update orders" ON public.orders
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
-- INSERT only via service role (POST /api/orders route in Phase 3)

CREATE TABLE public.order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES public.variations(id),
  product_name VARCHAR(160) NOT NULL,
  variation_name VARCHAR(80) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL
);
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read order items" ON public.order_items
  FOR SELECT TO authenticated USING (public.is_owner());

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id),
  customer_id UUID REFERENCES public.customers(id),
  subtotal NUMERIC(12,2) NOT NULL,
  delivery_fee NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  total_cost NUMERIC(12,2) NOT NULL,
  gross_profit NUMERIC(12,2) NOT NULL,
  payment_method public.payment_method NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read sales" ON public.sales
  FOR SELECT TO authenticated USING (public.is_owner());

-- =========================================================================
-- Expenses
-- =========================================================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  description VARCHAR(200) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'geral',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage expenses" ON public.expenses
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- =========================================================================
-- Store settings (1 per store)
-- =========================================================================
CREATE TABLE public.store_settings (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id),
  store_display_name VARCHAR(120) NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL DEFAULT '',
  banners JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read store settings" ON public.store_settings
  FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated read store settings" ON public.store_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "owners update store settings" ON public.store_settings
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE TRIGGER trg_store_settings_touch BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================================================================
-- Audit logs
-- =========================================================================
CREATE TABLE public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  actor_id UUID REFERENCES public.profiles(id),
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_owner());

-- =========================================================================
-- Indexes
-- =========================================================================
CREATE INDEX idx_variations_product ON public.variations(product_id);
CREATE INDEX idx_orders_pending ON public.orders(store_id, created_at) WHERE status = 'pending';
CREATE INDEX idx_orders_created ON public.orders(store_id, created_at DESC);
CREATE INDEX idx_sales_created ON public.sales(store_id, created_at DESC);
CREATE INDEX idx_stock_movements_variation ON public.stock_movements(variation_id, created_at DESC);
CREATE INDEX idx_customers_phone ON public.customers(store_id, phone);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_expenses_date ON public.expenses(store_id, expense_date);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(store_id, created_at DESC);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_categories_sort ON public.categories(store_id, sort_order);

-- =========================================================================
-- Stock write functions (SECURITY DEFINER — the ONLY way stock ever changes)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.stock_entry(
  _variation_id UUID,
  _qty INT,
  _note TEXT DEFAULT NULL
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INT;
  v_after INT;
  v_mov public.stock_movements;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'qty_must_be_positive'; END IF;

  SELECT stock INTO v_before FROM public.variations WHERE id = _variation_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'variation_not_found'; END IF;

  v_after := v_before + _qty;
  UPDATE public.variations SET stock = v_after WHERE id = _variation_id;

  INSERT INTO public.stock_movements(variation_id, type, qty_before, delta, qty_after, actor_id, note)
  VALUES (_variation_id, 'entry', v_before, _qty, v_after, auth.uid(), _note)
  RETURNING * INTO v_mov;

  RETURN v_mov;
END;
$$;

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
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _new_qty IS NULL OR _new_qty < 0 THEN RAISE EXCEPTION 'invalid_new_qty'; END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT stock INTO v_before FROM public.variations WHERE id = _variation_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'variation_not_found'; END IF;

  v_delta := _new_qty - v_before;
  UPDATE public.variations SET stock = _new_qty WHERE id = _variation_id;

  INSERT INTO public.stock_movements(variation_id, type, qty_before, delta, qty_after, actor_id, note)
  VALUES (_variation_id, 'adjustment', v_before, v_delta, _new_qty, auth.uid(), _note)
  RETURNING * INTO v_mov;

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  SELECT v.product_id::text::uuid, -- store_id via product
         auth.uid(), 'stock.adjust', 'variation', _variation_id::text,
         jsonb_build_object('before', v_before, 'after', _new_qty, 'note', _note)
  FROM public.variations v WHERE v.id = _variation_id;

  RETURN v_mov;
END;
$$;

-- Convenience: fetch a variation's owning store_id via product
CREATE OR REPLACE FUNCTION public.variation_store_id(_variation_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT p.store_id FROM public.products p
  JOIN public.variations v ON v.product_id = p.id
  WHERE v.id = _variation_id
$$;

-- =========================================================================
-- Seed: single store + settings + starter categories + neighborhoods
-- =========================================================================
DO $$
DECLARE
  v_store_id UUID;
BEGIN
  INSERT INTO public.stores(name) VALUES ('Smoke') RETURNING id INTO v_store_id;
  INSERT INTO public.store_settings(store_id, store_display_name, whatsapp_number)
  VALUES (v_store_id, 'Smoke', '');

  INSERT INTO public.categories(store_id, name, sort_order) VALUES
    (v_store_id, 'Destaques', 0),
    (v_store_id, 'Novidades', 10),
    (v_store_id, 'Promoções', 20);

  INSERT INTO public.neighborhoods(store_id, name, delivery_fee) VALUES
    (v_store_id, 'Centro', 5.00),
    (v_store_id, 'Zona Norte', 8.00),
    (v_store_id, 'Zona Sul', 8.00);
END $$;
