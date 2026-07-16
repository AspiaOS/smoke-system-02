DROP VIEW IF EXISTS public.public_store_settings;

ALTER TABLE public.store_settings DROP COLUMN IF EXISTS business_hours;
ALTER TABLE public.store_settings DROP COLUMN IF EXISTS pix_key;

CREATE VIEW public.public_store_settings AS
SELECT store_id, store_display_name, whatsapp_number, banners
FROM public.store_settings;

GRANT SELECT ON public.public_store_settings TO anon, authenticated;

INSERT INTO public.store_settings (store_id, store_display_name, whatsapp_number, banners)
SELECT s.id, s.name, '', '[]'::jsonb
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_settings ss WHERE ss.store_id = s.id
);

CREATE OR REPLACE FUNCTION public.create_default_store_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_settings (store_id, store_display_name, whatsapp_number, banners)
  VALUES (NEW.id, NEW.name, '', '[]'::jsonb)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_store_settings ON public.stores;
CREATE TRIGGER trg_create_default_store_settings
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.create_default_store_settings();