-- Rate-limit table (internal only, no Data API access)
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup_idx
  ON public.rate_limit_hits (key, bucket, hit_at DESC);

-- No GRANTs to anon/authenticated: only the SECURITY DEFINER function touches this table.
GRANT ALL ON public.rate_limit_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_hits_id_seq TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: table is opaque to Data API roles.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key TEXT,
  _bucket TEXT,
  _max INT,
  _window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF _key IS NULL OR length(_key) = 0 OR _bucket IS NULL OR length(_bucket) = 0 THEN
    RETURN TRUE; -- fail-open on malformed key rather than blocking legitimate traffic
  END IF;

  -- Cheap housekeeping: drop rows older than 1h on every call.
  DELETE FROM public.rate_limit_hits
   WHERE hit_at < now() - interval '1 hour';

  SELECT COUNT(*) INTO v_count
    FROM public.rate_limit_hits
   WHERE key = _key
     AND bucket = _bucket
     AND hit_at > now() - make_interval(secs => _window_seconds);

  IF v_count >= _max THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limit_hits(key, bucket) VALUES (_key, _bucket);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;