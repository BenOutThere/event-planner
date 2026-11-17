-- Template field settings
ALTER TABLE public.template_fields
  ADD COLUMN IF NOT EXISTS help_text text,
  ADD COLUMN IF NOT EXISTS allow_na boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS multiline boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS table_rules jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.template_sections
  ADD COLUMN IF NOT EXISTS nav_group text;

-- Keep template default table data when a field type changes (never silently discard)
CREATE OR REPLACE FUNCTION public.validate_template_field_default_table()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.default_table IS NULL OR NEW.kind <> 'table' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.default_table) <> 'object'
    OR jsonb_typeof(NEW.default_table->'columns') <> 'array'
    OR jsonb_typeof(NEW.default_table->'rows') <> 'array'
    OR jsonb_array_length(NEW.default_table->'columns') < 1
    OR jsonb_array_length(NEW.default_table->'columns') > 20
    OR jsonb_array_length(NEW.default_table->'rows') > 50
  THEN
    RAISE EXCEPTION 'Invalid table template data';
  END IF;
  RETURN NEW;
END;
$function$;

-- Event values: N/A flag + version for safe concurrent edits
ALTER TABLE public.event_field_values
  ADD COLUMN IF NOT EXISTS not_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_efv_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efv_version ON public.event_field_values;
CREATE TRIGGER trg_efv_version BEFORE UPDATE ON public.event_field_values
  FOR EACH ROW EXECUTE FUNCTION public.bump_efv_version();

CREATE UNIQUE INDEX IF NOT EXISTS uq_efv_event_section_key
  ON public.event_field_values (event_id, section_id, field_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_efv_event_extra_key
  ON public.event_field_values (event_id, extra_section_id, field_key);

-- Never let a template section deletion wipe saved event information
CREATE OR REPLACE FUNCTION public.protect_template_section_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_field_values v WHERE v.section_id = OLD.id) THEN
    RAISE EXCEPTION 'This section has saved event information. Archive it instead of deleting.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_section_values ON public.template_sections;
CREATE TRIGGER trg_protect_section_values BEFORE DELETE ON public.template_sections
  FOR EACH ROW EXECUTE FUNCTION public.protect_template_section_values();

-- Mirror key overview fields onto the event record (works for every event editor)
CREATE OR REPLACE FUNCTION public.mirror_event_core_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v text := NULLIF(btrim(COALESCE(NEW.value_text, '')), '');
BEGIN
  IF NEW.section_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.field_key = 'event_name' AND v IS NOT NULL THEN
    UPDATE public.events SET name = v WHERE id = NEW.event_id AND name IS DISTINCT FROM v;
  ELSIF NEW.field_key = 'event_start_date' THEN
    IF v IS NULL OR v ~ '^\d{4}-\d{2}-\d{2}$' THEN
      UPDATE public.events SET proposed_date = v::date WHERE id = NEW.event_id AND proposed_date IS DISTINCT FROM v::date;
    END IF;
  ELSIF NEW.field_key = 'event_end_date' THEN
    IF v IS NULL OR v ~ '^\d{4}-\d{2}-\d{2}$' THEN
      UPDATE public.events SET end_date = v::date WHERE id = NEW.event_id AND end_date IS DISTINCT FROM v::date;
    END IF;
  ELSIF NEW.field_key = 'venue_name' THEN
    UPDATE public.events SET location = v, venue = v WHERE id = NEW.event_id AND location IS DISTINCT FROM v;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efv_mirror_core ON public.event_field_values;
CREATE TRIGGER trg_efv_mirror_core AFTER INSERT OR UPDATE OF value_text ON public.event_field_values
  FOR EACH ROW EXECUTE FUNCTION public.mirror_event_core_fields();

-- Event-only sub-sections can sit under a shared area
ALTER TABLE public.event_section_extras
  ADD COLUMN IF NOT EXISTS parent_section_id uuid REFERENCES public.template_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Event-only fields (do not change the shared template)
CREATE TABLE IF NOT EXISTS public.event_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.template_sections(id) ON DELETE SET NULL,
  extra_section_id uuid REFERENCES public.event_section_extras(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['text','kv','links','files','table','phone','email','date'])),
  sort_order integer NOT NULL DEFAULT 1000,
  help_text text,
  is_required boolean NOT NULL DEFAULT false,
  allow_na boolean NOT NULL DEFAULT false,
  multiline boolean NOT NULL DEFAULT true,
  default_table jsonb,
  table_rules jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, key),
  CHECK (section_id IS NOT NULL OR extra_section_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_custom_fields TO authenticated;
GRANT ALL ON public.event_custom_fields TO service_role;
ALTER TABLE public.event_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecf_select ON public.event_custom_fields FOR SELECT TO authenticated
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));
CREATE POLICY ecf_write ON public.event_custom_fields FOR ALL TO authenticated
USING (app_private.is_admin(auth.uid()) OR app_private.is_event_member(event_id, auth.uid()))
WITH CHECK (app_private.is_admin(auth.uid()) OR app_private.is_event_member(event_id, auth.uid()));

-- Files: scope storage access to the event in the first folder of the path
CREATE OR REPLACE FUNCTION app_private.try_uuid(_v text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
AS $$
BEGIN
  RETURN _v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_event(_event_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  select _event_id is not null and (
    app_private.is_admin(_user_id)
    or app_private.has_role(_user_id, 'member'::app_role)
    or app_private.has_role(_user_id, 'lead'::app_role)
    or app_private.has_role(_user_id, 'viewer'::app_role)
    or app_private.is_event_member(_event_id, _user_id)
  )
$$;

DROP POLICY IF EXISTS event_files_select ON storage.objects;
DROP POLICY IF EXISTS event_files_insert ON storage.objects;
DROP POLICY IF EXISTS event_files_update ON storage.objects;
DROP POLICY IF EXISTS event_files_delete ON storage.objects;

CREATE POLICY event_files_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'event-files' AND app_private.can_read_event(app_private.try_uuid((storage.foldername(name))[1]), auth.uid()));
CREATE POLICY event_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event-files' AND (app_private.is_admin(auth.uid()) OR app_private.is_event_member(app_private.try_uuid((storage.foldername(name))[1]), auth.uid())));
CREATE POLICY event_files_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'event-files' AND (app_private.is_admin(auth.uid()) OR app_private.is_event_member(app_private.try_uuid((storage.foldername(name))[1]), auth.uid())));
CREATE POLICY event_files_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'event-files' AND (app_private.is_admin(auth.uid()) OR app_private.is_event_member(app_private.try_uuid((storage.foldername(name))[1]), auth.uid())));

-- Backfill new settings
UPDATE public.template_fields SET multiline = false
  WHERE key IN ('event_name','venue_name','venue_address','ticketing_provider','otpme');

UPDATE public.template_sections SET nav_group = CASE
  WHEN title IN ('Key Team Members','Customer Service Contacts','Key Event Contacts','Venue / Client Contacts','Suppliers') THEN 'People & contacts'
  WHEN title IN ('Key Event Dates','Event Program','Event Master Schedule') THEN 'Dates & schedule'
  WHEN title IN ('Ticketing Structure','Commercial','Budget') THEN 'Commercial'
  WHEN title IN ('Operations','Marketing & Communications','Risk & Safety','Event Scope') THEN 'Delivery'
  ELSE NULL END
WHERE parent_id IS NULL;