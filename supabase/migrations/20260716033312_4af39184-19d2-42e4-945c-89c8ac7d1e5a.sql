-- Fase 6: View pública sanitizada + policies mínimas para anon

-- 1) Recria public_catalog como security_invoker=true (usa policies do chamador)
DROP VIEW IF EXISTS public.public_catalog;
CREATE VIEW public.public_catalog
WITH (security_invoker = true) AS
SELECT
  p.id            AS product_id,
  p.name          AS product_name,
  p.brand,
  p.description,
  p.images,
  p.video_url,
  p.featured,
  p.category_id,
  c.name          AS category_name,
  v.id            AS variation_id,
  v.name          AS variation_name,
  v.price,
  (v.stock - v.reserved_quantity) > 0 AS in_stock
FROM public.products p
JOIN public.variations v ON v.product_id = p.id
JOIN public.categories c ON c.id = p.category_id
WHERE p.active AND p.visible AND c.active AND v.active;

GRANT SELECT ON public.public_catalog TO anon, authenticated;

-- 2) Policies TO anon nas tabelas base (necessário para security_invoker view funcionar)
DROP POLICY IF EXISTS "public read active products" ON public.products;
CREATE POLICY "public read active products"
  ON public.products FOR SELECT TO anon
  USING (active = true AND visible = true);

DROP POLICY IF EXISTS "public read active variations" ON public.variations;
CREATE POLICY "public read active variations"
  ON public.variations FOR SELECT TO anon
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = variations.product_id
        AND p.active = true
        AND p.visible = true
    )
  );

-- categories já tinha "public read active categories"; sem mudança.

-- 3) Nova view pública para store_settings — SEM pix_key
DROP VIEW IF EXISTS public.public_store_settings;
CREATE VIEW public.public_store_settings
WITH (security_invoker = true) AS
SELECT
  store_id,
  store_display_name,
  whatsapp_number,
  banners,
  business_hours
FROM public.store_settings;

GRANT SELECT ON public.public_store_settings TO anon, authenticated;

-- Precisa de policy anon na tabela base para a view funcionar (security_invoker)
DROP POLICY IF EXISTS "public read store settings" ON public.store_settings;
CREATE POLICY "public read store settings via view"
  ON public.store_settings FOR SELECT TO anon
  USING (true);
-- Nota: a policy continua "true", mas anon nunca consulta a tabela base diretamente
-- pois removemos a interface pública (front-end usa apenas a view). Como reforço,
-- revogamos SELECT anon direto na base — anon só lê via view (que faz SELECT
-- apenas das colunas seguras).
REVOKE SELECT ON public.store_settings FROM anon;
