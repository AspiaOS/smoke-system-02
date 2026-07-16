CREATE OR REPLACE FUNCTION public.get_audit_activity(
  p_source text,
  p_from date,
  p_to date,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(activity_date date, activity_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_store := public.current_store_id();

  IF p_source = 'audit' THEN
    RETURN QUERY
    WITH days AS (
      SELECT generate_series(p_from, p_to, interval '1 day')::date AS d
    ),
    counts AS (
      SELECT ((al.created_at AT TIME ZONE p_timezone))::date AS d, count(*)::bigint AS c
      FROM public.audit_logs al
      WHERE al.store_id = v_store
        AND al.created_at >= (p_from::timestamp AT TIME ZONE p_timezone)
        AND al.created_at <  ((p_to + 1)::timestamp AT TIME ZONE p_timezone)
      GROUP BY 1
    )
    SELECT days.d, COALESCE(counts.c, 0)
    FROM days LEFT JOIN counts USING (d)
    ORDER BY days.d;
  ELSIF p_source = 'stock' THEN
    RETURN QUERY
    WITH days AS (
      SELECT generate_series(p_from, p_to, interval '1 day')::date AS d
    ),
    counts AS (
      SELECT ((sm.created_at AT TIME ZONE p_timezone))::date AS d, count(*)::bigint AS c
      FROM public.stock_movements sm
      JOIN public.variations v ON v.id = sm.variation_id
      JOIN public.products p ON p.id = v.product_id
      WHERE p.store_id = v_store
        AND sm.created_at >= (p_from::timestamp AT TIME ZONE p_timezone)
        AND sm.created_at <  ((p_to + 1)::timestamp AT TIME ZONE p_timezone)
      GROUP BY 1
    )
    SELECT days.d, COALESCE(counts.c, 0)
    FROM days LEFT JOIN counts USING (d)
    ORDER BY days.d;
  ELSE
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_activity(text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audit_activity(text, date, date, text) TO authenticated;

CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON public.stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_store_created_at_idx ON public.audit_logs (store_id, created_at DESC);