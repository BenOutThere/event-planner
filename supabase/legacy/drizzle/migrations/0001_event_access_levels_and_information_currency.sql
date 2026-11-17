-- ============================================================
-- 1. Explicit event access levels
-- ============================================================
ALTER TABLE public.event_members
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'edit',
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_note text;
-- Existing assignments keep the edit access they had; new assignments default to view only.
ALTER TABLE public.event_members ALTER COLUMN access_level SET DEFAULT 'view';
ALTER TABLE public.event_members DROP CONSTRAINT IF EXISTS event_members_access_level_check;
ALTER TABLE public.event_members ADD CONSTRAINT event_members_access_level_check CHECK (access_level IN ('view','edit','manage'));

-- Flag assignments whose meaning was ambiguous under the old rules (viewer / supplier assignments granted editing).
UPDATE public.event_members em
SET needs_review = true,
    review_note = 'Under the old rules this assignment gave editing access automatically. Confirm whether this person should view, edit or manage the event.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = em.user_id AND r.role IN ('admin','lead','member')
);

CREATE OR REPLACE FUNCTION app_private.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('admin','lead','member','viewer'))
$$;

CREATE OR REPLACE FUNCTION app_private.event_access(_event_id uuid, _uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _event_id IS NULL OR _uid IS NULL THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id) THEN NULL
    WHEN app_private.is_admin(_uid) THEN 'manage'
    WHEN EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND (e.lead_user_id = _uid OR e.created_by = _uid)) THEN 'manage'
    ELSE COALESCE(
      (SELECT em.access_level FROM public.event_members em WHERE em.event_id = _event_id AND em.user_id = _uid LIMIT 1),
      CASE WHEN app_private.is_staff(_uid) THEN 'view' END
    )
  END
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_event(_event_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.event_access(_event_id, _user_id) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_private.can_edit_event(_event_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(app_private.event_access(_event_id, _uid) IN ('edit','manage'), false)
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_event(_event_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(app_private.event_access(_event_id, _uid) = 'manage', false)
$$;

-- ============================================================
-- 2. Section (area) restrictions, ownership and review
-- ============================================================
ALTER TABLE public.template_sections ADD COLUMN IF NOT EXISTS restricted_to text;
ALTER TABLE public.template_sections DROP CONSTRAINT IF EXISTS template_sections_restricted_to_check;
ALTER TABLE public.template_sections ADD CONSTRAINT template_sections_restricted_to_check CHECK (restricted_to IS NULL OR restricted_to IN ('staff','managers'));

CREATE TABLE IF NOT EXISTS public.event_area_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  responsible_name text,
  responsible_user_id uuid,
  review_due date,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_name text,
  restricted_to text CHECK (restricted_to IS NULL OR restricted_to IN ('everyone','staff','managers')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, area_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_area_meta TO authenticated;
GRANT ALL ON public.event_area_meta TO service_role;
ALTER TABLE public.event_area_meta ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.area_of(_section_id uuid, _extra_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT COALESCE(s.parent_id, s.id) FROM public.template_sections s WHERE s.id = _section_id),
    (SELECT x.parent_section_id FROM public.event_section_extras x WHERE x.id = _extra_id)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.area_restriction(_event_id uuid, _area_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN m.restricted_to IS NOT NULL THEN NULLIF(m.restricted_to, 'everyone')
    ELSE (SELECT s.restricted_to FROM public.template_sections s WHERE s.id = _area_id)
  END
  FROM (SELECT (SELECT restricted_to FROM public.event_area_meta WHERE event_id = _event_id AND area_id = _area_id) AS restricted_to) m
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_area(_event_id uuid, _area_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.can_read_event(_event_id, _uid) AND (
    _area_id IS NULL OR
    CASE app_private.area_restriction(_event_id, _area_id)
      WHEN 'staff' THEN app_private.is_staff(_uid) OR app_private.can_manage_event(_event_id, _uid)
      WHEN 'managers' THEN app_private.can_manage_event(_event_id, _uid)
      ELSE true
    END
  )
$$;

CREATE POLICY area_meta_select ON public.event_area_meta FOR SELECT TO authenticated
  USING (app_private.can_read_event(event_id, auth.uid()));
CREATE POLICY area_meta_insert ON public.event_area_meta FOR INSERT TO authenticated
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, area_id, auth.uid()));
CREATE POLICY area_meta_update ON public.event_area_meta FOR UPDATE TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, area_id, auth.uid()))
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, area_id, auth.uid()));
CREATE POLICY area_meta_delete ON public.event_area_meta FOR DELETE TO authenticated
  USING (app_private.is_admin(auth.uid()));

-- Only admins may change who can see an area.
CREATE OR REPLACE FUNCTION public.guard_area_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' AND NEW.restricted_to IS NOT NULL OR TG_OP = 'UPDATE' AND NEW.restricted_to IS DISTINCT FROM OLD.restricted_to)
     AND NOT app_private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can change who can see this area';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_area_meta_guard BEFORE INSERT OR UPDATE ON public.event_area_meta
  FOR EACH ROW EXECUTE FUNCTION public.guard_area_meta();

-- ============================================================
-- 3. Who changed what
-- ============================================================
ALTER TABLE public.event_field_values ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.set_efv_updated_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  IF TG_OP = 'INSERT' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_efv_updated_by BEFORE INSERT OR UPDATE ON public.event_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_efv_updated_by();

CREATE TABLE IF NOT EXISTS public.event_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  area_id uuid,
  section_id uuid,
  extra_section_id uuid,
  field_key text,
  field_label text,
  change_kind text NOT NULL DEFAULT 'value',
  summary text,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_changes_event_idx ON public.event_changes (event_id, updated_at DESC);
GRANT SELECT ON public.event_changes TO authenticated;
GRANT ALL ON public.event_changes TO service_role;
ALTER TABLE public.event_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_changes_select ON public.event_changes FOR SELECT TO authenticated
  USING (app_private.can_read_area(event_id, area_id, auth.uid()));

CREATE OR REPLACE FUNCTION app_private.person_name(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.email) FROM public.profiles p WHERE p.id = _uid
$$;

CREATE OR REPLACE FUNCTION public.log_efv_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s text;
  existing uuid;
  who uuid := COALESCE(auth.uid(), NEW.updated_by);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.value_text IS NOT DISTINCT FROM OLD.value_text
     AND NEW.value_kv IS NOT DISTINCT FROM OLD.value_kv
     AND NEW.value_links IS NOT DISTINCT FROM OLD.value_links
     AND NEW.value_table IS NOT DISTINCT FROM OLD.value_table
     AND NEW.not_applicable IS NOT DISTINCT FROM OLD.not_applicable THEN
    RETURN NEW;
  END IF;

  IF NEW.not_applicable AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.not_applicable, false)) THEN
    s := 'Marked not applicable';
  ELSIF TG_OP = 'UPDATE' AND OLD.not_applicable AND NOT NEW.not_applicable THEN
    s := 'No longer marked not applicable';
  ELSIF NEW.kind IN ('text','phone','email','date') THEN
    s := COALESCE(left(NULLIF(btrim(NEW.value_text), ''), 160), 'Cleared');
  ELSIF NEW.kind = 'table' THEN
    SELECT 'Row ' || COALESCE(n.i, o.i) || ': ' || COALESCE(NULLIF(left((SELECT string_agg(btrim(c), ' · ') FROM jsonb_array_elements_text(COALESCE(n.r, '[]'::jsonb)) c WHERE btrim(c) <> ''), 140), ''), 'removed')
      INTO s
    FROM jsonb_array_elements(COALESCE(NEW.value_table->'rows', '[]'::jsonb)) WITH ORDINALITY AS n(r, i)
    FULL JOIN (SELECT * FROM jsonb_array_elements(COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.value_table->'rows' END, '[]'::jsonb)) WITH ORDINALITY AS x(r, i)) o ON o.i = n.i
    WHERE n.r IS DISTINCT FROM o.r
    ORDER BY COALESCE(n.i, o.i) LIMIT 1;
    s := COALESCE(s, 'Table updated');
  ELSIF NEW.kind IN ('links','files') THEN
    SELECT CASE WHEN NEW.kind = 'files' THEN 'Files: ' ELSE 'Links: ' END || left(string_agg(COALESCE(NULLIF(x->>'label', ''), x->>'url', x->>'path'), ', '), 160)
      INTO s FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.value_links) = 'array' THEN NEW.value_links ELSE '[]'::jsonb END) x;
    s := COALESCE(s, 'Removed all items');
  ELSE
    s := 'Updated';
  END IF;

  SELECT id INTO existing FROM public.event_changes
  WHERE event_id = NEW.event_id AND change_kind = 'value'
    AND section_id IS NOT DISTINCT FROM NEW.section_id
    AND extra_section_id IS NOT DISTINCT FROM NEW.extra_section_id
    AND field_key = NEW.field_key
    AND changed_by IS NOT DISTINCT FROM who
    AND updated_at > now() - interval '15 minutes'
  ORDER BY updated_at DESC LIMIT 1;

  IF existing IS NOT NULL THEN
    UPDATE public.event_changes SET summary = s, updated_at = now(), field_label = COALESCE(NEW.label, field_label) WHERE id = existing;
  ELSE
    INSERT INTO public.event_changes (event_id, area_id, section_id, extra_section_id, field_key, field_label, change_kind, summary, changed_by, changed_by_name)
    VALUES (NEW.event_id, app_private.area_of(NEW.section_id, NEW.extra_section_id), NEW.section_id, NEW.extra_section_id, NEW.field_key,
            COALESCE(NEW.label, NEW.field_key), 'value', s, who, app_private.person_name(who));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.log_area_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reviewed_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
    INSERT INTO public.event_changes (event_id, area_id, field_label, change_kind, summary, changed_by, changed_by_name)
    VALUES (NEW.event_id, NEW.area_id, (SELECT title FROM public.template_sections WHERE id = NEW.area_id), 'review',
            'Marked reviewed', NEW.reviewed_by, COALESCE(NEW.reviewed_by_name, app_private.person_name(NEW.reviewed_by)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_area_meta_review AFTER INSERT OR UPDATE ON public.event_area_meta
  FOR EACH ROW EXECUTE FUNCTION public.log_area_review();

-- ============================================================
-- 4. Pinned items on Event Home
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  pin_kind text NOT NULL CHECK (pin_kind IN ('area','field','document')),
  target text NOT NULL,
  label text NOT NULL,
  area_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, pin_kind, target)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_pins TO authenticated;
GRANT ALL ON public.event_pins TO service_role;
ALTER TABLE public.event_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY pins_select ON public.event_pins FOR SELECT TO authenticated
  USING (app_private.can_read_area(event_id, area_id, auth.uid()));
CREATE POLICY pins_write ON public.event_pins FOR ALL TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()))
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, area_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.limit_event_pins()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.event_pins WHERE event_id = NEW.event_id) >= 6 THEN
    RAISE EXCEPTION 'An event can have up to 6 pinned items';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_limit_event_pins BEFORE INSERT ON public.event_pins
  FOR EACH ROW EXECUTE FUNCTION public.limit_event_pins();

-- ============================================================
-- 5. Searchable text extracted from uploaded documents
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_text (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  area_id uuid,
  file_name text,
  status text NOT NULL CHECK (status IN ('indexed','unsupported','failed','empty')),
  content text,
  error text,
  indexed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_text TO authenticated;
GRANT ALL ON public.document_text TO service_role;
ALTER TABLE public.document_text ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_text_select ON public.document_text FOR SELECT TO authenticated
  USING (app_private.can_read_area(event_id, area_id, auth.uid()));
CREATE POLICY doc_text_write ON public.document_text FOR ALL TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, area_id, auth.uid()))
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, area_id, auth.uid()));

-- The area of an indexed document always comes from where the file is stored, never from the caller.
CREATE OR REPLACE FUNCTION public.set_document_text_area()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parts text[] := storage.foldername(NEW.path); ar uuid;
BEGIN
  IF app_private.try_uuid(parts[1]) IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'Document path does not belong to this event';
  END IF;
  IF array_length(parts, 1) >= 2 THEN ar := app_private.try_uuid(parts[2]); END IF;
  IF ar IS NULL THEN
    SELECT app_private.area_of(v.section_id, v.extra_section_id) INTO ar
    FROM public.event_field_values v
    WHERE v.event_id = NEW.event_id AND v.value_links IS NOT NULL
      AND jsonb_path_exists(v.value_links, '$.** ? (@.path == $p)', jsonb_build_object('p', NEW.path))
    LIMIT 1;
  END IF;
  NEW.area_id := ar;
  NEW.indexed_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_document_text_area BEFORE INSERT OR UPDATE ON public.document_text
  FOR EACH ROW EXECUTE FUNCTION public.set_document_text_area();

-- ============================================================
-- 6. Links to other OTG workspaces for an event
-- ============================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS workspace_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 7. Stable ids for every saved file and link (backfill, no "updated" change)
-- ============================================================
ALTER TABLE public.event_field_values DISABLE TRIGGER USER;
UPDATE public.event_field_values v
SET value_links = (
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' AND NOT (x ? 'id') THEN x || jsonb_build_object('id', gen_random_uuid()::text) ELSE x END ORDER BY i)
      FROM jsonb_array_elements(v.value_links) WITH ORDINALITY a(x, i)),
    version = v.version + 1
WHERE jsonb_typeof(v.value_links) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.value_links) x WHERE jsonb_typeof(x) = 'object' AND NOT (x ? 'id'));
ALTER TABLE public.event_field_values ENABLE TRIGGER USER;

CREATE TRIGGER trg_efv_log_change AFTER INSERT OR UPDATE ON public.event_field_values
  FOR EACH ROW EXECUTE FUNCTION public.log_efv_change();

-- ============================================================
-- 8. Row-level security using the access levels and area restrictions
-- ============================================================
DROP POLICY IF EXISTS events_select_member_or_privileged ON public.events;
DROP POLICY IF EXISTS events_update_lead_or_admin ON public.events;
CREATE POLICY events_select_access ON public.events FOR SELECT TO authenticated
  USING (app_private.can_read_event(id, auth.uid()));
CREATE POLICY events_update_manage ON public.events FOR UPDATE TO authenticated
  USING (app_private.can_manage_event(id, auth.uid()))
  WITH CHECK (app_private.can_manage_event(id, auth.uid()));

DROP POLICY IF EXISTS efv_select ON public.event_field_values;
DROP POLICY IF EXISTS efv_write ON public.event_field_values;
CREATE POLICY efv_select ON public.event_field_values FOR SELECT TO authenticated
  USING (app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()));
CREATE POLICY efv_insert ON public.event_field_values FOR INSERT TO authenticated
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()));
CREATE POLICY efv_update ON public.event_field_values FOR UPDATE TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()))
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()));
CREATE POLICY efv_delete ON public.event_field_values FOR DELETE TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()));

DROP POLICY IF EXISTS ecf_select ON public.event_custom_fields;
DROP POLICY IF EXISTS ecf_write ON public.event_custom_fields;
CREATE POLICY ecf_select ON public.event_custom_fields FOR SELECT TO authenticated
  USING (app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()));
CREATE POLICY ecf_write ON public.event_custom_fields FOR ALL TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()))
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, app_private.area_of(section_id, extra_section_id), auth.uid()));

DROP POLICY IF EXISTS ese_select ON public.event_section_extras;
DROP POLICY IF EXISTS ese_write ON public.event_section_extras;
CREATE POLICY ese_select ON public.event_section_extras FOR SELECT TO authenticated
  USING (app_private.can_read_area(event_id, parent_section_id, auth.uid()));
CREATE POLICY ese_write ON public.event_section_extras FOR ALL TO authenticated
  USING (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, parent_section_id, auth.uid()))
  WITH CHECK (app_private.can_edit_event(event_id, auth.uid()) AND app_private.can_read_area(event_id, parent_section_id, auth.uid()));

DROP POLICY IF EXISTS event_members_select ON public.event_members;
DROP POLICY IF EXISTS event_members_write ON public.event_members;
CREATE POLICY event_members_select ON public.event_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.is_staff(auth.uid()) OR app_private.can_manage_event(event_id, auth.uid()));
CREATE POLICY event_members_write ON public.event_members FOR ALL TO authenticated
  USING (app_private.is_admin(auth.uid()) OR (app_private.can_manage_event(event_id, auth.uid()) AND access_level <> 'manage'))
  WITH CHECK (app_private.is_admin(auth.uid()) OR (app_private.can_manage_event(event_id, auth.uid()) AND access_level <> 'manage'));

-- Older planning tables (not used by the current screens) follow the same rules.
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_items','event_contacts','event_deliverables','event_emergency_services','event_entrant_info',
    'event_files','event_notes','event_power_pricing','event_revisions','event_roles','event_schedule_blocks','event_tickets',
    'risks','suppliers','tasks','timeline_milestones','event_section_overrides'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app_private.can_read_event(event_id, auth.uid()))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (app_private.can_edit_event(event_id, auth.uid())) WITH CHECK (app_private.can_edit_event(event_id, auth.uid()))', t || '_edit', t);
  END LOOP;
END $$;

-- Storage: files follow event access and the restriction of the area they belong to.
CREATE OR REPLACE FUNCTION app_private.can_read_file(_name text, _uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE parts text[] := storage.foldername(_name); ev uuid; ar uuid;
BEGIN
  ev := app_private.try_uuid(parts[1]);
  IF ev IS NULL OR NOT app_private.can_read_event(ev, _uid) THEN RETURN false; END IF;
  IF array_length(parts, 1) >= 2 THEN
    ar := app_private.try_uuid(parts[2]);
    IF ar IS NOT NULL THEN RETURN app_private.can_read_area(ev, ar, _uid); END IF;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.event_field_values v
    WHERE v.event_id = ev AND v.value_links IS NOT NULL
      AND jsonb_path_exists(v.value_links, '$.** ? (@.path == $p)', jsonb_build_object('p', _name))
      AND NOT app_private.can_read_area(ev, app_private.area_of(v.section_id, v.extra_section_id), _uid)
  );
END $$;

CREATE OR REPLACE FUNCTION app_private.can_write_file(_name text, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.can_edit_event(app_private.try_uuid((storage.foldername(_name))[1]), _uid)
     AND app_private.can_read_file(_name, _uid)
$$;

DROP POLICY IF EXISTS event_files_select ON storage.objects;
DROP POLICY IF EXISTS event_files_insert ON storage.objects;
DROP POLICY IF EXISTS event_files_update ON storage.objects;
DROP POLICY IF EXISTS event_files_delete ON storage.objects;
CREATE POLICY event_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-files' AND app_private.can_read_file(name, auth.uid()));
CREATE POLICY event_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-files' AND app_private.can_write_file(name, auth.uid()));
CREATE POLICY event_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-files' AND app_private.can_write_file(name, auth.uid()));
CREATE POLICY event_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-files' AND app_private.can_write_file(name, auth.uid()));

-- ============================================================
-- 9. Functions the app calls
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_event_access()
RETURNS TABLE (event_id uuid, access text, is_staff boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, app_private.event_access(e.id, auth.uid()), app_private.is_staff(auth.uid())
  FROM public.events e
  WHERE app_private.event_access(e.id, auth.uid()) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.event_area_permissions(_event_id uuid)
RETURNS TABLE (area_id uuid, restricted_to text, can_read boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, app_private.area_restriction(_event_id, s.id), app_private.can_read_area(_event_id, s.id, auth.uid())
  FROM public.template_sections s
  WHERE s.parent_id IS NULL AND app_private.can_read_event(_event_id, auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.user_event_access(_user_id uuid)
RETURNS TABLE (event_id uuid, event_name text, access text, source text, restricted_areas integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_private.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
  SELECT e.id, e.name, app_private.event_access(e.id, _user_id),
    CASE
      WHEN app_private.is_admin(_user_id) THEN 'Admin'
      WHEN e.lead_user_id = _user_id THEN 'Event lead'
      WHEN e.created_by = _user_id THEN 'Created the event'
      WHEN EXISTS (SELECT 1 FROM public.event_members em WHERE em.event_id = e.id AND em.user_id = _user_id) THEN 'Assigned'
      ELSE 'Staff role (view all events)'
    END,
    (SELECT count(*)::int FROM public.template_sections s WHERE s.parent_id IS NULL AND NOT app_private.can_read_area(e.id, s.id, _user_id))
  FROM public.events e
  WHERE app_private.event_access(e.id, _user_id) IS NOT NULL
  ORDER BY e.name;
END $$;

CREATE OR REPLACE FUNCTION public.search_event_values(_q text, _event_id uuid DEFAULT NULL)
RETURNS SETOF public.event_field_values
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT v.* FROM public.event_field_values v
  WHERE (_event_id IS NULL OR v.event_id = _event_id)
    AND EXISTS (
      SELECT 1 FROM unnest(regexp_split_to_array(lower(btrim(_q)), '\s+')) t
      WHERE t <> '' AND position(t IN lower(COALESCE(v.value_text, '') || ' ' || COALESCE(v.value_table::text, '') || ' ' || COALESCE(v.value_links::text, '') || ' ' || COALESCE(v.value_kv::text, ''))) > 0
    )
  LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.search_document_text(_q text, _event_id uuid DEFAULT NULL)
RETURNS TABLE (event_id uuid, path text, area_id uuid, file_name text, snippet text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t)
  SELECT d.event_id, d.path, d.area_id, d.file_name,
    substr(d.content, greatest(1, position((SELECT t[1] FROM terms) IN lower(d.content)) - 80), 240)
  FROM public.document_text d
  WHERE d.status = 'indexed' AND d.content IS NOT NULL
    AND (_event_id IS NULL OR d.event_id = _event_id)
    AND cardinality((SELECT t FROM terms)) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN lower(d.content)) = 0)
  LIMIT 100
$$;

REVOKE ALL ON FUNCTION public.my_event_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.event_area_permissions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_event_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_event_values(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_document_text(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_event_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_area_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_event_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_event_values(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_document_text(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_staff(uuid), app_private.event_access(uuid, uuid), app_private.can_edit_event(uuid, uuid),
  app_private.can_manage_event(uuid, uuid), app_private.area_of(uuid, uuid), app_private.area_restriction(uuid, uuid),
  app_private.can_read_area(uuid, uuid, uuid), app_private.can_read_file(text, uuid), app_private.can_write_file(text, uuid),
  app_private.person_name(uuid) TO authenticated;
