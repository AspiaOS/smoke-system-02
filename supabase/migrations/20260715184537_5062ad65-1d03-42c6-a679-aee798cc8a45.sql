
-- Storage policies for product-media
CREATE POLICY "product-media public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-media');

CREATE POLICY "product-media owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-media' AND public.is_owner());

CREATE POLICY "product-media owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-media' AND public.is_owner())
  WITH CHECK (bucket_id = 'product-media' AND public.is_owner());

CREATE POLICY "product-media owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-media' AND public.is_owner());
