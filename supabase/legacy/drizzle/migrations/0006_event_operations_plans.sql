-- Each event can have its own overall Operations Plan (company-wide SOPs keep event_id NULL).
ALTER TABLE public.ops_documents ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS ops_documents_one_per_event ON public.ops_documents(event_id) WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.can_read_ops_doc(_event_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _event_id IS NULL THEN app_private.is_staff(_uid)
              ELSE app_private.event_access(_event_id, _uid) IS NOT NULL END
$$;

CREATE OR REPLACE FUNCTION app_private.can_write_ops_doc(_event_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.can_manage_ops(_uid)
      OR (_event_id IS NOT NULL AND app_private.event_access(_event_id, _uid) = 'manage')
$$;

-- Event plan files live under events/<event id>/… in the operations-plans bucket.
CREATE OR REPLACE FUNCTION app_private.ops_path_event(_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN split_part(_name, '/', 1) = 'events'
               AND split_part(_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN split_part(_name, '/', 2)::uuid END
$$;

GRANT EXECUTE ON FUNCTION app_private.can_read_ops_doc(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_write_ops_doc(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.ops_path_event(text) TO authenticated;

DROP POLICY IF EXISTS ops_documents_read ON public.ops_documents;
DROP POLICY IF EXISTS ops_documents_insert ON public.ops_documents;
DROP POLICY IF EXISTS ops_documents_update ON public.ops_documents;
DROP POLICY IF EXISTS ops_documents_delete ON public.ops_documents;
CREATE POLICY ops_documents_read ON public.ops_documents FOR SELECT TO authenticated
  USING (app_private.can_read_ops_doc(event_id, auth.uid()));
CREATE POLICY ops_documents_insert ON public.ops_documents FOR INSERT TO authenticated
  WITH CHECK (app_private.can_write_ops_doc(event_id, auth.uid()));
CREATE POLICY ops_documents_update ON public.ops_documents FOR UPDATE TO authenticated
  USING (app_private.can_write_ops_doc(event_id, auth.uid()))
  WITH CHECK (app_private.can_write_ops_doc(event_id, auth.uid()));
CREATE POLICY ops_documents_delete ON public.ops_documents FOR DELETE TO authenticated
  USING (app_private.can_write_ops_doc(event_id, auth.uid()));

DROP POLICY IF EXISTS ops_files_select ON storage.objects;
DROP POLICY IF EXISTS ops_files_insert ON storage.objects;
DROP POLICY IF EXISTS ops_files_update ON storage.objects;
DROP POLICY IF EXISTS ops_files_delete ON storage.objects;
CREATE POLICY ops_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'operations-plans' AND app_private.can_read_ops_doc(app_private.ops_path_event(name), auth.uid()));
CREATE POLICY ops_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'operations-plans' AND app_private.can_write_ops_doc(app_private.ops_path_event(name), auth.uid()));
CREATE POLICY ops_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'operations-plans' AND app_private.can_write_ops_doc(app_private.ops_path_event(name), auth.uid()));
CREATE POLICY ops_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'operations-plans' AND app_private.can_write_ops_doc(app_private.ops_path_event(name), auth.uid()));

-- Search: company-wide plans always; plus one event's plan, or every event plan the person can see.
DROP FUNCTION IF EXISTS public.search_ops_documents(text);
CREATE FUNCTION public.search_ops_documents(_q text, _event_id uuid DEFAULT NULL, _all_events boolean DEFAULT false)
RETURNS TABLE(id uuid, title text, file_name text, category_id uuid, category_name text, snippet text, in_title boolean, event_id uuid, event_name text)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t),
  docs AS (
    SELECT d.*, c.name AS cat_name, e.name AS ev_name,
      lower(d.title || ' ' || COALESCE(d.description, '') || ' ' || d.file_name || ' ' || COALESCE(c.name, '')) AS meta,
      lower(COALESCE(d.content, '')) AS body
    FROM public.ops_documents d
    LEFT JOIN public.ops_categories c ON c.id = d.category_id
    LEFT JOIN public.events e ON e.id = d.event_id
    WHERE d.event_id IS NULL OR d.event_id = _event_id OR (_all_events AND d.event_id IS NOT NULL)
  )
  SELECT d.id, d.title, d.file_name, d.category_id, d.cat_name,
    CASE WHEN position((SELECT t[1] FROM terms) IN d.body) > 0
      THEN substr(d.content, greatest(1, position((SELECT t[1] FROM terms) IN d.body) - 80), 240) END,
    NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN d.meta) = 0),
    d.event_id, d.ev_name
  FROM docs d
  WHERE cardinality((SELECT t FROM terms)) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN d.meta || ' ' || d.body) = 0)
  ORDER BY 7 DESC, d.title
  LIMIT 100
$function$;
GRANT EXECUTE ON FUNCTION public.search_ops_documents(text, uuid, boolean) TO authenticated;