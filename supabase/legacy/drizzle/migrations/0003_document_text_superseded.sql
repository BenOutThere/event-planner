ALTER TABLE public.document_text ADD COLUMN IF NOT EXISTS superseded boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.search_document_text(_q text, _event_id uuid DEFAULT NULL)
RETURNS TABLE (event_id uuid, path text, area_id uuid, file_name text, snippet text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t)
  SELECT d.event_id, d.path, d.area_id, d.file_name,
    substr(d.content, greatest(1, position((SELECT t[1] FROM terms) IN lower(d.content)) - 80), 240)
  FROM public.document_text d
  WHERE d.status = 'indexed' AND d.content IS NOT NULL AND NOT d.superseded
    AND (_event_id IS NULL OR d.event_id = _event_id)
    AND cardinality((SELECT t FROM terms)) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN lower(d.content)) = 0)
  LIMIT 100
$$;
