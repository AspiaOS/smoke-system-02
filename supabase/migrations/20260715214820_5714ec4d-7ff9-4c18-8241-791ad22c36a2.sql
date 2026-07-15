
CREATE TABLE public.demo_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  profile text NOT NULL CHECK (profile IN ('small','full')),
  seed bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed')),
  entries jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb,
  pre_snapshot jsonb,
  validation jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_manifest TO authenticated;
GRANT ALL ON public.demo_manifest TO service_role;

ALTER TABLE public.demo_manifest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_demo_manifest" ON public.demo_manifest
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE TRIGGER demo_manifest_touch
  BEFORE UPDATE ON public.demo_manifest
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
