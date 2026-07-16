-- =====================================================================
-- SMOKE CONTROL — Fase 4: storage de produtos por capability
-- =====================================================================

DROP POLICY IF EXISTS "product-media owner write" ON storage.objects;
DROP POLICY IF EXISTS "product-media owner update" ON storage.objects;
DROP POLICY IF EXISTS "product-media owner delete" ON storage.objects;
DROP POLICY IF EXISTS "product-media staff write" ON storage.objects;
DROP POLICY IF EXISTS "product-media staff update" ON storage.objects;
DROP POLICY IF EXISTS "product-media staff delete" ON storage.objects;

CREATE POLICY "product-media staff write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-media'
    AND public.has_store_capability(auth.uid(), public.current_store_id(), 'products.create')
  );

CREATE POLICY "product-media staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND public.has_store_capability(auth.uid(), public.current_store_id(), 'products.update')
  )
  WITH CHECK (
    bucket_id = 'product-media'
    AND public.has_store_capability(auth.uid(), public.current_store_id(), 'products.update')
  );

CREATE POLICY "product-media staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND public.has_store_capability(auth.uid(), public.current_store_id(), 'products.update')
  );