
CREATE OR REPLACE FUNCTION public.variation_store_id(_variation_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT p.store_id FROM public.products p
  JOIN public.variations v ON v.product_id = p.id
  WHERE v.id = _variation_id
$$;
