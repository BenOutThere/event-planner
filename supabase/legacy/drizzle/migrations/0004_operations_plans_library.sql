-- Company-wide operations plans / SOPs: read-only and searchable for all staff,
-- uploaded and maintained by admins and leads (event managers).
CREATE OR REPLACE FUNCTION app_private.can_manage_ops(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('admin','lead'))
$$;
GRANT EXECUTE ON FUNCTION app_private.can_manage_ops(uuid) TO authenticated;

CREATE TABLE public.ops_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ops_categories_name_key ON public.ops_categories (lower(btrim(name)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_categories TO authenticated;
GRANT ALL ON public.ops_categories TO service_role;
ALTER TABLE public.ops_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_categories_read ON public.ops_categories FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));
CREATE POLICY ops_categories_insert ON public.ops_categories FOR INSERT TO authenticated
  WITH CHECK (app_private.can_manage_ops(auth.uid()));
CREATE POLICY ops_categories_update ON public.ops_categories FOR UPDATE TO authenticated
  USING (app_private.can_manage_ops(auth.uid())) WITH CHECK (app_private.can_manage_ops(auth.uid()));
CREATE POLICY ops_categories_delete ON public.ops_categories FOR DELETE TO authenticated
  USING (app_private.can_manage_ops(auth.uid()));

CREATE TABLE public.ops_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text,
  category_id uuid REFERENCES public.ops_categories(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','indexed','empty','failed','unsupported')),
  content text,
  error text,
  uploaded_by uuid DEFAULT auth.uid(),
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_documents_category_idx ON public.ops_documents (category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_documents TO authenticated;
GRANT ALL ON public.ops_documents TO service_role;
ALTER TABLE public.ops_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_documents_read ON public.ops_documents FOR SELECT TO authenticated
  USING (app_private.is_staff(auth.uid()));
CREATE POLICY ops_documents_insert ON public.ops_documents FOR INSERT TO authenticated
  WITH CHECK (app_private.can_manage_ops(auth.uid()));
CREATE POLICY ops_documents_update ON public.ops_documents FOR UPDATE TO authenticated
  USING (app_private.can_manage_ops(auth.uid())) WITH CHECK (app_private.can_manage_ops(auth.uid()));
CREATE POLICY ops_documents_delete ON public.ops_documents FOR DELETE TO authenticated
  USING (app_private.can_manage_ops(auth.uid()));
CREATE TRIGGER trg_ops_documents_updated BEFORE UPDATE ON public.ops_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Files: staff can open, admins and leads can add/replace/remove.
CREATE POLICY ops_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'operations-plans' AND app_private.is_staff(auth.uid()));
CREATE POLICY ops_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'operations-plans' AND app_private.can_manage_ops(auth.uid()));
CREATE POLICY ops_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'operations-plans' AND app_private.can_manage_ops(auth.uid()));
CREATE POLICY ops_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'operations-plans' AND app_private.can_manage_ops(auth.uid()));

-- Search title, description, category, file name and extracted text. Runs as the caller (RLS applies).
CREATE OR REPLACE FUNCTION public.search_ops_documents(_q text)
RETURNS TABLE (id uuid, title text, file_name text, category_id uuid, category_name text, snippet text, in_title boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t),
  docs AS (
    SELECT d.*, c.name AS cat_name,
      lower(d.title || ' ' || COALESCE(d.description, '') || ' ' || d.file_name || ' ' || COALESCE(c.name, '')) AS meta,
      lower(COALESCE(d.content, '')) AS body
    FROM public.ops_documents d LEFT JOIN public.ops_categories c ON c.id = d.category_id
  )
  SELECT d.id, d.title, d.file_name, d.category_id, d.cat_name,
    CASE WHEN position((SELECT t[1] FROM terms) IN d.body) > 0
      THEN substr(d.content, greatest(1, position((SELECT t[1] FROM terms) IN d.body) - 80), 240) END,
    NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN d.meta) = 0)
  FROM docs d
  WHERE cardinality((SELECT t FROM terms)) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN d.meta || ' ' || d.body) = 0)
  ORDER BY 7 DESC, d.title
  LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.search_ops_documents(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_ops_documents(text) TO authenticated;