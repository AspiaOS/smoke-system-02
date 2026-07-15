
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS business_hours text,
  ADD COLUMN IF NOT EXISTS pix_key text;
