-- =====================================================================
-- OTG Event Planner: complete database setup for the shared "OTG Shared"
-- Supabase project (the one the Control Centre, Card Mate, Asset Manager,
-- Safe Site and Roster Mate use).
--
-- Paste this whole file into Supabase -> SQL Editor and click Run (once).
--
-- Everything Event Planner stores lives in its own "eventplanner" section
-- (and its rule helpers in "eventplanner_private"), so it never clashes with
-- the Control Centre's own profiles, roles or "new user" automation.
--
-- Sign-in is shared with the Control Centre. Who can open Event Planner is
-- decided by the Event Planner tile (public.app_access, app id 'events');
-- Control Centre admins can always open it. Inside Event Planner, access
-- still comes from its own roles (Admin, Lead, Member, Viewer, External),
-- per-event view / edit / manage assignments, and staff-only / managers-only
-- areas, exactly as before.
--
-- Consolidated from the original Lovable migrations (outthere-orchestrator
-- repo: supabase/migrations + drizzle/migrations), with these changes:
--   * public.* -> eventplanner.*, app_private.* -> eventplanner_private.*
--   * No "new user" automation: the Control Centre creates people. Each
--     person's Event Planner profile is filled in by ensure_member() when
--     they open the app.
--   * Every role check also requires Event Planner access (is_member), so
--     removing someone's tile or deactivating them in the Control Centre
--     shuts them out of Event Planner straight away.
--   * Templates, categories and names are visible to Event Planner people
--     only (they were visible to any signed-in account before).
--   * People can change their own display name but not their own
--     active / inactive flag.
--   * importing(): lets the one-off move bring records across exactly as
--     they were (history, versions, "last updated by", dates).
--   * Files: buckets eventplanner-files and eventplanner-ops-plans.
-- =====================================================================

SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS eventplanner;
CREATE SCHEMA IF NOT EXISTS eventplanner_private;

-- True only while the one-off move import (service role, with the
-- x-eventplanner-import header) is loading old records. Automations then keep
-- the records exactly as they were instead of stamping new times, people,
-- versions or history entries.
CREATE FUNCTION eventplanner.importing() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
     AND coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-eventplanner-import', '') = '1'
$$;

-- May this person open Event Planner at all? A Control Centre admin, or anyone
-- with the Event Planner tile, unless deactivated in the Control Centre or
-- deactivated on Event Planner's own Admin page.
CREATE FUNCTION eventplanner_private.is_member(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT _uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND status = 'deactivated')
     AND NOT EXISTS (SELECT 1 FROM eventplanner.profiles WHERE id = _uid AND is_active = false)
     AND (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text = 'admin')
          OR EXISTS (SELECT 1 FROM public.app_access WHERE user_id = _uid AND app_id = 'events'))
$$;

--
-- Name: app_role; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.app_role AS ENUM (
    'admin',
    'lead',
    'member',
    'supplier',
    'viewer'
);

--
-- Name: event_stage; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.event_stage AS ENUM (
    'draft',
    'in_planning',
    'confirmed',
    'delivery_ready',
    'completed'
);

--
-- Name: milestone_status; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.milestone_status AS ENUM (
    'pending',
    'in_progress',
    'done',
    'missed'
);

--
-- Name: risk_level; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

--
-- Name: supplier_status; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.supplier_status AS ENUM (
    'prospect',
    'contacted',
    'quoted',
    'booked',
    'confirmed',
    'cancelled'
);

--
-- Name: task_priority; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

--
-- Name: task_status; Type: TYPE; Schema: eventplanner; Owner: -
--

CREATE TYPE eventplanner.task_status AS ENUM (
    'todo',
    'in_progress',
    'blocked',
    'done'
);

--
-- Name: area_of(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.area_of(_section_id uuid, _extra_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(
    (SELECT COALESCE(s.parent_id, s.id) FROM eventplanner.template_sections s WHERE s.id = _section_id),
    (SELECT x.parent_section_id FROM eventplanner.event_section_extras x WHERE x.id = _extra_id)
  )
$$;

--
-- Name: area_restriction(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.area_restriction(_event_id uuid, _area_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT CASE
    WHEN m.restricted_to IS NOT NULL THEN NULLIF(m.restricted_to, 'everyone')
    ELSE (SELECT s.restricted_to FROM eventplanner.template_sections s WHERE s.id = _area_id)
  END
  FROM (SELECT (SELECT restricted_to FROM eventplanner.event_area_meta WHERE event_id = _event_id AND area_id = _area_id) AS restricted_to) m
$$;

--
-- Name: can_edit_event(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_edit_event(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(eventplanner_private.event_access(_event_id, _uid) IN ('edit','manage'), false)
$$;

--
-- Name: can_manage_event(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_manage_event(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(eventplanner_private.event_access(_event_id, _uid) = 'manage', false)
$$;

--
-- Name: can_manage_ops(uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_manage_ops(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT EXISTS (SELECT 1 FROM eventplanner.user_roles WHERE user_id = _uid AND role IN ('admin','lead'))
     AND eventplanner_private.is_member(_uid)
$$;

--
-- Name: can_read_area(uuid, uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_read_area(_event_id uuid, _area_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.can_read_event(_event_id, _uid) AND (
    _area_id IS NULL OR
    CASE eventplanner_private.area_restriction(_event_id, _area_id)
      WHEN 'staff' THEN eventplanner_private.is_staff(_uid) OR eventplanner_private.can_manage_event(_event_id, _uid)
      WHEN 'managers' THEN eventplanner_private.can_manage_event(_event_id, _uid)
      ELSE true
    END
  )
$$;

--
-- Name: can_read_event(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_read_event(_event_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.event_access(_event_id, _user_id) IS NOT NULL
$$;

--
-- Name: can_read_file(text, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_read_file(_name text, _uid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $_$
DECLARE parts text[] := storage.foldername(_name); ev uuid; ar uuid;
BEGIN
  ev := eventplanner_private.try_uuid(parts[1]);
  IF ev IS NULL OR NOT eventplanner_private.can_read_event(ev, _uid) THEN RETURN false; END IF;
  IF array_length(parts, 1) >= 2 THEN
    ar := eventplanner_private.try_uuid(parts[2]);
    IF ar IS NOT NULL THEN RETURN eventplanner_private.can_read_area(ev, ar, _uid); END IF;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM eventplanner.event_field_values v
    WHERE v.event_id = ev AND v.value_links IS NOT NULL
      AND jsonb_path_exists(v.value_links, '$.** ? (@.path == $p)', jsonb_build_object('p', _name))
      AND NOT eventplanner_private.can_read_area(ev, eventplanner_private.area_of(v.section_id, v.extra_section_id), _uid)
  );
END $_$;

--
-- Name: can_read_ops_doc(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_read_ops_doc(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT CASE WHEN _event_id IS NULL THEN eventplanner_private.is_staff(_uid)
              ELSE eventplanner_private.event_access(_event_id, _uid) IS NOT NULL END
$$;

--
-- Name: can_view_event(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_view_event(_event_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  select exists (
    select 1
    from eventplanner.events e
    where e.id = _event_id
      and (e.lead_user_id = _user_id or e.created_by = _user_id)
  ) or exists (
    select 1
    from eventplanner.event_members em
    where em.event_id = _event_id
      and em.user_id = _user_id
  )
$$;

--
-- Name: can_write_file(text, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_write_file(_name text, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.can_edit_event(eventplanner_private.try_uuid((storage.foldername(_name))[1]), _uid)
     AND eventplanner_private.can_read_file(_name, _uid)
$$;

--
-- Name: can_write_ops_doc(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.can_write_ops_doc(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.can_manage_ops(_uid)
      OR (_event_id IS NOT NULL AND eventplanner_private.event_access(_event_id, _uid) = 'manage')
$$;

--
-- Name: event_access(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.event_access(_event_id uuid, _uid uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT CASE
    WHEN _event_id IS NULL OR _uid IS NULL THEN NULL
    WHEN NOT eventplanner_private.is_member(_uid) THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM eventplanner.events e WHERE e.id = _event_id) THEN NULL
    WHEN eventplanner_private.is_admin(_uid) THEN 'manage'
    WHEN EXISTS (SELECT 1 FROM eventplanner.events e WHERE e.id = _event_id AND (e.lead_user_id = _uid OR e.created_by = _uid)) THEN 'manage'
    ELSE COALESCE(
      (SELECT em.access_level FROM eventplanner.event_members em WHERE em.event_id = _event_id AND em.user_id = _uid LIMIT 1),
      CASE WHEN eventplanner_private.is_staff(_uid) THEN 'view' END
    )
  END
$$;

--
-- Name: has_role(uuid, eventplanner.app_role); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.has_role(_user_id uuid, _role eventplanner.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  select exists (
    select 1
    from eventplanner.user_roles
    where user_id = _user_id
      and role = _role
  ) and eventplanner_private.is_member(_user_id)
$$;

--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  select exists (
    select 1
    from eventplanner.user_roles
    where user_id = _user_id
      and role = 'admin'::eventplanner.app_role
  ) and eventplanner_private.is_member(_user_id)
$$;

--
-- Name: is_event_member(uuid, uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.is_event_member(_event_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.is_member(_user_id) AND (
  select exists (
    select 1
    from eventplanner.event_members em
    where em.event_id = _event_id
      and em.user_id = _user_id
  ) or exists (
    select 1
    from eventplanner.events e
    where e.id = _event_id
      and (e.lead_user_id = _user_id or e.created_by = _user_id)
  )
  )
$$;

--
-- Name: is_staff(uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.is_staff(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT EXISTS (SELECT 1 FROM eventplanner.user_roles WHERE user_id = _uid AND role IN ('admin','lead','member','viewer'))
     AND eventplanner_private.is_member(_uid)
$$;

--
-- Name: ops_path_event(text); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.ops_path_event(_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    AS $_$
  SELECT CASE WHEN split_part(_name, '/', 1) = 'events'
               AND split_part(_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN split_part(_name, '/', 2)::uuid END
$_$;

--
-- Name: person_name(uuid); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.person_name(_uid uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.email) FROM eventplanner.profiles p WHERE p.id = _uid
$$;

--
-- Name: try_uuid(text); Type: FUNCTION; Schema: eventplanner_private; Owner: -
--

CREATE FUNCTION eventplanner_private.try_uuid(_v text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN _v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

--
-- Name: bump_efv_version(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.bump_efv_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

--
-- Name: can_view_event(uuid, uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.can_view_event(_event_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM eventplanner.events e
    WHERE e.id = _event_id
      AND (e.lead_user_id = _user_id OR e.created_by = _user_id)
  ) OR EXISTS (
    SELECT 1 FROM eventplanner.event_members em
    WHERE em.event_id = _event_id AND em.user_id = _user_id
  );
$$;

--
-- Name: event_area_permissions(uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.event_area_permissions(_event_id uuid) RETURNS TABLE(area_id uuid, restricted_to text, can_read boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT s.id, eventplanner_private.area_restriction(_event_id, s.id), eventplanner_private.can_read_area(_event_id, s.id, auth.uid())
  FROM eventplanner.template_sections s
  WHERE s.parent_id IS NULL AND eventplanner_private.can_read_event(_event_id, auth.uid())
$$;

--
-- Name: guard_area_meta(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.guard_area_meta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' AND NEW.restricted_to IS NOT NULL OR TG_OP = 'UPDATE' AND NEW.restricted_to IS DISTINCT FROM OLD.restricted_to)
     AND NOT eventplanner_private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can change who can see this area';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF; NEW.updated_at = now(); RETURN NEW; END;
$$;

--
-- Name: has_role(uuid, eventplanner.app_role); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.has_role(_user_id uuid, _role eventplanner.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.has_role(_user_id, _role)
$$;

--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.is_admin(_user_id)
$$;

--
-- Name: is_event_member(uuid, uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.is_event_member(_event_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.is_member(_user_id) AND (
  SELECT EXISTS (
    SELECT 1 FROM eventplanner.event_members WHERE event_id = _event_id AND user_id = _user_id
    UNION
    SELECT 1 FROM eventplanner.events WHERE id = _event_id AND (lead_user_id = _user_id OR created_by = _user_id)
  )
  )
$$;

--
-- Name: limit_event_pins(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.limit_event_pins() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM eventplanner.event_pins WHERE event_id = NEW.event_id) >= 6 THEN
    RAISE EXCEPTION 'An event can have up to 6 pinned items';
  END IF;
  RETURN NEW;
END $$;

--
-- Name: log_area_review(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.log_area_review() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF NEW.reviewed_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
    INSERT INTO eventplanner.event_changes (event_id, area_id, field_label, change_kind, summary, changed_by, changed_by_name)
    VALUES (NEW.event_id, NEW.area_id, (SELECT title FROM eventplanner.template_sections WHERE id = NEW.area_id), 'review',
            'Marked reviewed', NEW.reviewed_by, COALESCE(NEW.reviewed_by_name, eventplanner_private.person_name(NEW.reviewed_by)));
  END IF;
  RETURN NEW;
END $$;

--
-- Name: log_efv_change(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.log_efv_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
DECLARE
  s text;
  existing uuid;
  who uuid := COALESCE(auth.uid(), NEW.updated_by);
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
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

  SELECT id INTO existing FROM eventplanner.event_changes
  WHERE event_id = NEW.event_id AND change_kind = 'value'
    AND section_id IS NOT DISTINCT FROM NEW.section_id
    AND extra_section_id IS NOT DISTINCT FROM NEW.extra_section_id
    AND field_key = NEW.field_key
    AND changed_by IS NOT DISTINCT FROM who
    AND updated_at > now() - interval '15 minutes'
  ORDER BY updated_at DESC LIMIT 1;

  IF existing IS NOT NULL THEN
    UPDATE eventplanner.event_changes SET summary = s, updated_at = now(), field_label = COALESCE(NEW.label, field_label) WHERE id = existing;
  ELSE
    INSERT INTO eventplanner.event_changes (event_id, area_id, section_id, extra_section_id, field_key, field_label, change_kind, summary, changed_by, changed_by_name)
    VALUES (NEW.event_id, eventplanner_private.area_of(NEW.section_id, NEW.extra_section_id), NEW.section_id, NEW.extra_section_id, NEW.field_key,
            COALESCE(NEW.label, NEW.field_key), 'value', s, who, eventplanner_private.person_name(who));
  END IF;
  RETURN NEW;
END $$;

--
-- Name: mirror_event_core_fields(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.mirror_event_core_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $_$
DECLARE
  v text := NULLIF(btrim(COALESCE(NEW.value_text, '')), '');
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF NEW.section_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.field_key = 'event_name' AND v IS NOT NULL THEN
    UPDATE eventplanner.events SET name = v WHERE id = NEW.event_id AND name IS DISTINCT FROM v;
  ELSIF NEW.field_key = 'event_start_date' THEN
    IF v IS NULL OR v ~ '^\d{4}-\d{2}-\d{2}$' THEN
      UPDATE eventplanner.events SET proposed_date = v::date WHERE id = NEW.event_id AND proposed_date IS DISTINCT FROM v::date;
    END IF;
  ELSIF NEW.field_key = 'event_end_date' THEN
    IF v IS NULL OR v ~ '^\d{4}-\d{2}-\d{2}$' THEN
      UPDATE eventplanner.events SET end_date = v::date WHERE id = NEW.event_id AND end_date IS DISTINCT FROM v::date;
    END IF;
  ELSIF NEW.field_key = 'venue_name' THEN
    UPDATE eventplanner.events SET location = v, venue = v WHERE id = NEW.event_id AND location IS DISTINCT FROM v;
  END IF;
  RETURN NEW;
END;
$_$;

--
-- Name: my_area_permissions(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.my_area_permissions() RETURNS TABLE(event_id uuid, area_id uuid, restricted_to text, can_read boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT e.id, s.id, eventplanner_private.area_restriction(e.id, s.id), eventplanner_private.can_read_area(e.id, s.id, auth.uid())
  FROM eventplanner.events e CROSS JOIN eventplanner.template_sections s
  WHERE s.parent_id IS NULL AND eventplanner_private.can_read_event(e.id, auth.uid())
$$;

--
-- Name: my_event_access(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.my_event_access() RETURNS TABLE(event_id uuid, access text, is_staff boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT e.id, eventplanner_private.event_access(e.id, auth.uid()), eventplanner_private.is_staff(auth.uid())
  FROM eventplanner.events e
  WHERE eventplanner_private.event_access(e.id, auth.uid()) IS NOT NULL
$$;

--
-- Name: protect_template_section_values(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.protect_template_section_values() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM eventplanner.event_field_values v WHERE v.section_id = OLD.id) THEN
    RAISE EXCEPTION 'This section has saved event information. Archive it instead of deleting.';
  END IF;
  RETURN OLD;
END;
$$;

--
-- Name: search_document_text(text, uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.search_document_text(_q text, _event_id uuid DEFAULT NULL::uuid) RETURNS TABLE(event_id uuid, path text, area_id uuid, file_name text, snippet text)
    LANGUAGE sql STABLE
    SET search_path TO 'eventplanner'
    AS $$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t)
  SELECT d.event_id, d.path, d.area_id, d.file_name,
    substr(d.content, greatest(1, position((SELECT t[1] FROM terms) IN lower(d.content)) - 80), 240)
  FROM eventplanner.document_text d
  WHERE d.status = 'indexed' AND d.content IS NOT NULL AND NOT d.superseded
    AND (_event_id IS NULL OR d.event_id = _event_id)
    AND cardinality((SELECT t FROM terms)) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN lower(d.content)) = 0)
  LIMIT 100
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: event_field_values; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_field_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    section_id uuid,
    extra_section_id uuid,
    field_key text NOT NULL,
    label text,
    kind text NOT NULL,
    value_text text,
    value_kv jsonb,
    value_links jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    value_table jsonb,
    not_applicable boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by uuid,
    CONSTRAINT event_field_values_check CHECK (((section_id IS NOT NULL) OR (extra_section_id IS NOT NULL))),
    CONSTRAINT event_field_values_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'kv'::text, 'links'::text, 'files'::text, 'table'::text, 'phone'::text, 'email'::text, 'date'::text])))
);

--
-- Name: search_event_values(text, uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.search_event_values(_q text, _event_id uuid DEFAULT NULL::uuid) RETURNS SETOF eventplanner.event_field_values
    LANGUAGE sql STABLE
    SET search_path TO 'eventplanner'
    AS $$
  SELECT v.* FROM eventplanner.event_field_values v
  WHERE (_event_id IS NULL OR v.event_id = _event_id)
    AND EXISTS (
      SELECT 1 FROM unnest(regexp_split_to_array(lower(btrim(_q)), '\s+')) t
      WHERE t <> '' AND position(t IN lower(COALESCE(v.value_text, '') || ' ' || COALESCE(v.value_table::text, '') || ' ' || COALESCE(v.value_links::text, '') || ' ' || COALESCE(v.value_kv::text, ''))) > 0
    )
  LIMIT 500
$$;

--
-- Name: search_ops_documents(text, uuid, boolean); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.search_ops_documents(_q text, _event_id uuid DEFAULT NULL::uuid, _all_events boolean DEFAULT false) RETURNS TABLE(id uuid, title text, file_name text, category_id uuid, category_name text, snippet text, in_title boolean, event_id uuid, event_name text)
    LANGUAGE sql STABLE
    SET search_path TO 'eventplanner'
    AS $$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t),
  docs AS (
    SELECT d.*, c.name AS cat_name, e.name AS ev_name,
      lower(d.title || ' ' || COALESCE(d.description, '') || ' ' || d.file_name || ' ' || COALESCE(c.name, '')) AS meta,
      lower(COALESCE(d.content, '')) AS body
    FROM eventplanner.ops_documents d
    LEFT JOIN eventplanner.ops_categories c ON c.id = d.category_id
    LEFT JOIN eventplanner.events e ON e.id = d.event_id
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
$$;

--
-- Name: set_document_text_area(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.set_document_text_area() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $_$
DECLARE parts text[] := storage.foldername(NEW.path); ar uuid;
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF eventplanner_private.try_uuid(parts[1]) IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'Document path does not belong to this event';
  END IF;
  IF array_length(parts, 1) >= 2 THEN ar := eventplanner_private.try_uuid(parts[2]); END IF;
  IF ar IS NULL THEN
    SELECT eventplanner_private.area_of(v.section_id, v.extra_section_id) INTO ar
    FROM eventplanner.event_field_values v
    WHERE v.event_id = NEW.event_id AND v.value_links IS NOT NULL
      AND jsonb_path_exists(v.value_links, '$.** ? (@.path == $p)', jsonb_build_object('p', NEW.path))
    LIMIT 1;
  END IF;
  NEW.area_id := ar;
  NEW.indexed_at := now();
  RETURN NEW;
END $_$;

--
-- Name: set_efv_updated_by(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.set_efv_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  IF TG_OP = 'INSERT' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $$;

--
-- Name: user_event_access(uuid); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.user_event_access(_user_id uuid) RETURNS TABLE(event_id uuid, event_name text, access text, source text, restricted_areas integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF NOT eventplanner_private.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
  SELECT e.id, e.name, eventplanner_private.event_access(e.id, _user_id),
    CASE
      WHEN eventplanner_private.is_admin(_user_id) THEN 'Admin'
      WHEN e.lead_user_id = _user_id THEN 'Event lead'
      WHEN e.created_by = _user_id THEN 'Created the event'
      WHEN EXISTS (SELECT 1 FROM eventplanner.event_members em WHERE em.event_id = e.id AND em.user_id = _user_id) THEN 'Assigned'
      ELSE 'Staff role (view all events)'
    END,
    (SELECT count(*)::int FROM eventplanner.template_sections s WHERE s.parent_id IS NULL AND NOT eventplanner_private.can_read_area(e.id, s.id, _user_id))
  FROM eventplanner.events e
  WHERE eventplanner_private.event_access(e.id, _user_id) IS NOT NULL
  ORDER BY e.name;
END $$;

--
-- Name: validate_template_field_default_table(); Type: FUNCTION; Schema: eventplanner; Owner: -
--

CREATE FUNCTION eventplanner.validate_template_field_default_table() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
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
$$;

--
-- Name: budget_items; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.budget_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    label text NOT NULL,
    category text,
    estimated numeric(12,2) DEFAULT 0 NOT NULL,
    actual numeric(12,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: document_text; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.document_text (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    path text NOT NULL,
    area_id uuid,
    file_name text,
    status text NOT NULL,
    content text,
    error text,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded boolean DEFAULT false NOT NULL,
    CONSTRAINT document_text_status_check CHECK ((status = ANY (ARRAY['indexed'::text, 'unsupported'::text, 'failed'::text, 'empty'::text])))
);

--
-- Name: event_area_meta; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_area_meta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    area_id uuid NOT NULL,
    responsible_name text,
    responsible_user_id uuid,
    review_due date,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    reviewed_by_name text,
    restricted_to text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_area_meta_restricted_to_check CHECK (((restricted_to IS NULL) OR (restricted_to = ANY (ARRAY['everyone'::text, 'staff'::text, 'managers'::text]))))
);

--
-- Name: event_categories; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#FF6B4A'::text NOT NULL,
    icon text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_changes; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    area_id uuid,
    section_id uuid,
    extra_section_id uuid,
    field_key text,
    field_label text,
    change_kind text DEFAULT 'value'::text NOT NULL,
    summary text,
    changed_by uuid,
    changed_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_contacts; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    kind text DEFAULT 'customer_service'::text NOT NULL,
    contact_type text,
    name text,
    email text,
    lead_or_support text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_custom_fields; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    section_id uuid,
    extra_section_id uuid,
    key text NOT NULL,
    label text NOT NULL,
    kind text NOT NULL,
    sort_order integer DEFAULT 1000 NOT NULL,
    help_text text,
    is_required boolean DEFAULT false NOT NULL,
    allow_na boolean DEFAULT false NOT NULL,
    multiline boolean DEFAULT true NOT NULL,
    default_table jsonb,
    table_rules jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_custom_fields_check CHECK (((section_id IS NOT NULL) OR (extra_section_id IS NOT NULL))),
    CONSTRAINT event_custom_fields_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'kv'::text, 'links'::text, 'files'::text, 'table'::text, 'phone'::text, 'email'::text, 'date'::text])))
);

--
-- Name: event_deliverables; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_deliverables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    owner text DEFAULT 'operating_entity'::text NOT NULL,
    description text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_emergency_services; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_emergency_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    service text NOT NULL,
    on_site boolean DEFAULT false NOT NULL,
    contact text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_entrant_info; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_entrant_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    question text NOT NULL,
    answer text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_files; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    section_key text,
    label text NOT NULL,
    storage_path text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_members; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_on_event text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    access_level text DEFAULT 'view'::text NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    review_note text,
    CONSTRAINT event_members_access_level_check CHECK ((access_level = ANY (ARRAY['view'::text, 'edit'::text, 'manage'::text])))
);

--
-- Name: event_notes; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    section_key text,
    body text NOT NULL,
    author_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_pins; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    pin_kind text NOT NULL,
    target text NOT NULL,
    label text NOT NULL,
    area_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_pins_pin_kind_check CHECK ((pin_kind = ANY (ARRAY['area'::text, 'field'::text, 'document'::text])))
);

--
-- Name: event_power_pricing; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_power_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    outlet_type text NOT NULL,
    cost text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_revisions; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    note text NOT NULL,
    author_id uuid,
    author_name text,
    revised_on date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_roles; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    email text,
    is_media_spokesperson boolean DEFAULT false NOT NULL,
    is_event_control boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_schedule_blocks; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_schedule_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    kind text DEFAULT 'event'::text NOT NULL,
    date date,
    location text,
    start_time time without time zone,
    finish_time time without time zone,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_section_extras; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_section_extras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_section_id uuid,
    created_by uuid
);

--
-- Name: event_section_overrides; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_section_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    section_id uuid NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    sort_order integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_templates; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category_id uuid,
    default_milestones jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_tasks jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_tickets; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.event_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    audience text DEFAULT 'spectator'::text NOT NULL,
    name text NOT NULL,
    price text,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: events; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category_id uuid,
    purpose text,
    proposed_date date,
    end_date date,
    location text,
    expected_attendance integer,
    stage eventplanner.event_stage DEFAULT 'draft'::eventplanner.event_stage NOT NULL,
    progress_pct integer DEFAULT 0 NOT NULL,
    lead_user_id uuid,
    template_id uuid,
    budget_estimate numeric(12,2),
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organising_entity text,
    venue text,
    event_dates_text text,
    bump_in_start timestamp with time zone,
    bump_out_end timestamp with time zone,
    marketing_summary text,
    entrant_terms_url text,
    camping_available boolean DEFAULT false,
    camping_notes text,
    public_transport_notes text,
    onsite_parking_notes text,
    media_notes text,
    accreditation_notes text,
    judging_notes text,
    awards_notes text,
    floor_plan_url text,
    logo_url text,
    workspace_links jsonb DEFAULT '[]'::jsonb NOT NULL
);

--
-- Name: ops_categories; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.ops_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ops_categories_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);

--
-- Name: ops_documents; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.ops_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category_id uuid,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    content text,
    error text,
    uploaded_by uuid DEFAULT auth.uid(),
    uploaded_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sections jsonb,
    pages jsonb,
    event_id uuid,
    CONSTRAINT ops_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'indexed'::text, 'empty'::text, 'failed'::text, 'unsupported'::text]))),
    CONSTRAINT ops_documents_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 200)))
);

--
-- Name: COLUMN ops_documents.sections; Type: COMMENT; Schema: eventplanner; Owner: -
--

COMMENT ON COLUMN eventplanner.ops_documents.sections IS 'Detected section starts: [{category_id, code, title, start}] as character offsets into content';

--
-- Name: COLUMN ops_documents.pages; Type: COMMENT; Schema: eventplanner; Owner: -
--

COMMENT ON COLUMN eventplanner.ops_documents.pages IS 'PDF page start offsets into content (index 0 = page 1)';

--
-- Name: profiles; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.profiles (
    id uuid NOT NULL,
    display_name text,
    email text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

--
-- Name: risks; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.risks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text NOT NULL,
    likelihood eventplanner.risk_level DEFAULT 'medium'::eventplanner.risk_level NOT NULL,
    impact eventplanner.risk_level DEFAULT 'medium'::eventplanner.risk_level NOT NULL,
    mitigation text,
    owner_id uuid,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: suppliers; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    contact_name text,
    contact_email text,
    contact_phone text,
    status eventplanner.supplier_status DEFAULT 'prospect'::eventplanner.supplier_status NOT NULL,
    cost_estimate numeric(12,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: tasks; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    owner_id uuid,
    due_date date,
    priority eventplanner.task_priority DEFAULT 'medium'::eventplanner.task_priority NOT NULL,
    status eventplanner.task_status DEFAULT 'todo'::eventplanner.task_status NOT NULL,
    section_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: template_fields; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.template_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    kind text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_table jsonb,
    help_text text,
    allow_na boolean DEFAULT false NOT NULL,
    multiline boolean DEFAULT true NOT NULL,
    table_rules jsonb,
    archived_at timestamp with time zone,
    CONSTRAINT template_fields_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'kv'::text, 'links'::text, 'files'::text, 'table'::text, 'phone'::text, 'email'::text, 'date'::text])))
);

--
-- Name: template_sections; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.template_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    show_in_wizard boolean DEFAULT false NOT NULL,
    parent_id uuid,
    nav_group text,
    restricted_to text,
    CONSTRAINT template_sections_restricted_to_check CHECK (((restricted_to IS NULL) OR (restricted_to = ANY (ARRAY['staff'::text, 'managers'::text]))))
);

--
-- Name: timeline_milestones; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.timeline_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text NOT NULL,
    milestone_type text,
    date date,
    status eventplanner.milestone_status DEFAULT 'pending'::eventplanner.milestone_status NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_roles; Type: TABLE; Schema: eventplanner; Owner: -
--

CREATE TABLE eventplanner.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role eventplanner.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: budget_items budget_items_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.budget_items
    ADD CONSTRAINT budget_items_pkey PRIMARY KEY (id);

--
-- Name: document_text document_text_path_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.document_text
    ADD CONSTRAINT document_text_path_key UNIQUE (path);

--
-- Name: document_text document_text_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.document_text
    ADD CONSTRAINT document_text_pkey PRIMARY KEY (id);

--
-- Name: event_area_meta event_area_meta_event_id_area_id_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_area_meta
    ADD CONSTRAINT event_area_meta_event_id_area_id_key UNIQUE (event_id, area_id);

--
-- Name: event_area_meta event_area_meta_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_area_meta
    ADD CONSTRAINT event_area_meta_pkey PRIMARY KEY (id);

--
-- Name: event_categories event_categories_name_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_categories
    ADD CONSTRAINT event_categories_name_key UNIQUE (name);

--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);

--
-- Name: event_changes event_changes_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_changes
    ADD CONSTRAINT event_changes_pkey PRIMARY KEY (id);

--
-- Name: event_contacts event_contacts_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_contacts
    ADD CONSTRAINT event_contacts_pkey PRIMARY KEY (id);

--
-- Name: event_custom_fields event_custom_fields_event_id_key_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_custom_fields
    ADD CONSTRAINT event_custom_fields_event_id_key_key UNIQUE (event_id, key);

--
-- Name: event_custom_fields event_custom_fields_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_custom_fields
    ADD CONSTRAINT event_custom_fields_pkey PRIMARY KEY (id);

--
-- Name: event_deliverables event_deliverables_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_deliverables
    ADD CONSTRAINT event_deliverables_pkey PRIMARY KEY (id);

--
-- Name: event_emergency_services event_emergency_services_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_emergency_services
    ADD CONSTRAINT event_emergency_services_pkey PRIMARY KEY (id);

--
-- Name: event_entrant_info event_entrant_info_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_entrant_info
    ADD CONSTRAINT event_entrant_info_pkey PRIMARY KEY (id);

--
-- Name: event_field_values event_field_values_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_field_values
    ADD CONSTRAINT event_field_values_pkey PRIMARY KEY (id);

--
-- Name: event_files event_files_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_files
    ADD CONSTRAINT event_files_pkey PRIMARY KEY (id);

--
-- Name: event_members event_members_event_id_user_id_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_members
    ADD CONSTRAINT event_members_event_id_user_id_key UNIQUE (event_id, user_id);

--
-- Name: event_members event_members_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_members
    ADD CONSTRAINT event_members_pkey PRIMARY KEY (id);

--
-- Name: event_notes event_notes_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_notes
    ADD CONSTRAINT event_notes_pkey PRIMARY KEY (id);

--
-- Name: event_pins event_pins_event_id_pin_kind_target_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_pins
    ADD CONSTRAINT event_pins_event_id_pin_kind_target_key UNIQUE (event_id, pin_kind, target);

--
-- Name: event_pins event_pins_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_pins
    ADD CONSTRAINT event_pins_pkey PRIMARY KEY (id);

--
-- Name: event_power_pricing event_power_pricing_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_power_pricing
    ADD CONSTRAINT event_power_pricing_pkey PRIMARY KEY (id);

--
-- Name: event_revisions event_revisions_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_revisions
    ADD CONSTRAINT event_revisions_pkey PRIMARY KEY (id);

--
-- Name: event_roles event_roles_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_roles
    ADD CONSTRAINT event_roles_pkey PRIMARY KEY (id);

--
-- Name: event_schedule_blocks event_schedule_blocks_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_schedule_blocks
    ADD CONSTRAINT event_schedule_blocks_pkey PRIMARY KEY (id);

--
-- Name: event_section_extras event_section_extras_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_section_extras
    ADD CONSTRAINT event_section_extras_pkey PRIMARY KEY (id);

--
-- Name: event_section_overrides event_section_overrides_event_id_section_id_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_section_overrides
    ADD CONSTRAINT event_section_overrides_event_id_section_id_key UNIQUE (event_id, section_id);

--
-- Name: event_section_overrides event_section_overrides_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_section_overrides
    ADD CONSTRAINT event_section_overrides_pkey PRIMARY KEY (id);

--
-- Name: event_templates event_templates_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_templates
    ADD CONSTRAINT event_templates_pkey PRIMARY KEY (id);

--
-- Name: event_tickets event_tickets_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_tickets
    ADD CONSTRAINT event_tickets_pkey PRIMARY KEY (id);

--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);

--
-- Name: ops_categories ops_categories_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.ops_categories
    ADD CONSTRAINT ops_categories_pkey PRIMARY KEY (id);

--
-- Name: ops_documents ops_documents_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.ops_documents
    ADD CONSTRAINT ops_documents_pkey PRIMARY KEY (id);

--
-- Name: ops_documents ops_documents_storage_path_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.ops_documents
    ADD CONSTRAINT ops_documents_storage_path_key UNIQUE (storage_path);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: risks risks_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.risks
    ADD CONSTRAINT risks_pkey PRIMARY KEY (id);

--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

--
-- Name: template_fields template_fields_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.template_fields
    ADD CONSTRAINT template_fields_pkey PRIMARY KEY (id);

--
-- Name: template_fields template_fields_section_id_key_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.template_fields
    ADD CONSTRAINT template_fields_section_id_key_key UNIQUE (section_id, key);

--
-- Name: template_sections template_sections_key_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.template_sections
    ADD CONSTRAINT template_sections_key_key UNIQUE (key);

--
-- Name: template_sections template_sections_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.template_sections
    ADD CONSTRAINT template_sections_pkey PRIMARY KEY (id);

--
-- Name: timeline_milestones timeline_milestones_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.timeline_milestones
    ADD CONSTRAINT timeline_milestones_pkey PRIMARY KEY (id);

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

--
-- Name: event_changes_event_idx; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX event_changes_event_idx ON eventplanner.event_changes USING btree (event_id, updated_at DESC);

--
-- Name: idx_budget_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_budget_event ON eventplanner.budget_items USING btree (event_id);

--
-- Name: idx_efv_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_efv_event ON eventplanner.event_field_values USING btree (event_id);

--
-- Name: idx_ese_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_ese_event ON eventplanner.event_section_extras USING btree (event_id);

--
-- Name: idx_eso_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_eso_event ON eventplanner.event_section_overrides USING btree (event_id);

--
-- Name: idx_event_contacts_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_contacts_event ON eventplanner.event_contacts USING btree (event_id);

--
-- Name: idx_event_deliverables_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_deliverables_event ON eventplanner.event_deliverables USING btree (event_id);

--
-- Name: idx_event_emergency_services_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_emergency_services_event ON eventplanner.event_emergency_services USING btree (event_id);

--
-- Name: idx_event_entrant_info_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_entrant_info_event ON eventplanner.event_entrant_info USING btree (event_id);

--
-- Name: idx_event_power_pricing_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_power_pricing_event ON eventplanner.event_power_pricing USING btree (event_id);

--
-- Name: idx_event_revisions_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_revisions_event ON eventplanner.event_revisions USING btree (event_id);

--
-- Name: idx_event_roles_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_roles_event ON eventplanner.event_roles USING btree (event_id);

--
-- Name: idx_event_schedule_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_schedule_event ON eventplanner.event_schedule_blocks USING btree (event_id);

--
-- Name: idx_event_tickets_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_event_tickets_event ON eventplanner.event_tickets USING btree (event_id);

--
-- Name: idx_events_lead; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_events_lead ON eventplanner.events USING btree (lead_user_id);

--
-- Name: idx_events_stage; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_events_stage ON eventplanner.events USING btree (stage);

--
-- Name: idx_milestones_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_milestones_event ON eventplanner.timeline_milestones USING btree (event_id);

--
-- Name: idx_risks_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_risks_event ON eventplanner.risks USING btree (event_id);

--
-- Name: idx_suppliers_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_suppliers_event ON eventplanner.suppliers USING btree (event_id);

--
-- Name: idx_tasks_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_tasks_event ON eventplanner.tasks USING btree (event_id);

--
-- Name: idx_template_sections_parent_id; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX idx_template_sections_parent_id ON eventplanner.template_sections USING btree (parent_id);

--
-- Name: ops_categories_name_key; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE UNIQUE INDEX ops_categories_name_key ON eventplanner.ops_categories USING btree (lower(btrim(name)));

--
-- Name: ops_documents_category_idx; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE INDEX ops_documents_category_idx ON eventplanner.ops_documents USING btree (category_id);

--
-- Name: ops_documents_one_per_event; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE UNIQUE INDEX ops_documents_one_per_event ON eventplanner.ops_documents USING btree (event_id) WHERE (event_id IS NOT NULL);

--
-- Name: uq_efv_event_extra_key; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE UNIQUE INDEX uq_efv_event_extra_key ON eventplanner.event_field_values USING btree (event_id, extra_section_id, field_key);

--
-- Name: uq_efv_event_section_key; Type: INDEX; Schema: eventplanner; Owner: -
--

CREATE UNIQUE INDEX uq_efv_event_section_key ON eventplanner.event_field_values USING btree (event_id, section_id, field_key);

--
-- Name: event_area_meta trg_area_meta_guard; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_area_meta_guard BEFORE INSERT OR UPDATE ON eventplanner.event_area_meta FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_area_meta();

--
-- Name: event_area_meta trg_area_meta_review; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_area_meta_review AFTER INSERT OR UPDATE ON eventplanner.event_area_meta FOR EACH ROW EXECUTE FUNCTION eventplanner.log_area_review();

--
-- Name: document_text trg_document_text_area; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_document_text_area BEFORE INSERT OR UPDATE ON eventplanner.document_text FOR EACH ROW EXECUTE FUNCTION eventplanner.set_document_text_area();

--
-- Name: event_field_values trg_efv_log_change; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_efv_log_change AFTER INSERT OR UPDATE ON eventplanner.event_field_values FOR EACH ROW EXECUTE FUNCTION eventplanner.log_efv_change();

--
-- Name: event_field_values trg_efv_mirror_core; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_efv_mirror_core AFTER INSERT OR UPDATE OF value_text ON eventplanner.event_field_values FOR EACH ROW EXECUTE FUNCTION eventplanner.mirror_event_core_fields();

--
-- Name: event_field_values trg_efv_updated; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_efv_updated BEFORE UPDATE ON eventplanner.event_field_values FOR EACH ROW EXECUTE FUNCTION eventplanner.handle_updated_at();

--
-- Name: event_field_values trg_efv_updated_by; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_efv_updated_by BEFORE INSERT OR UPDATE ON eventplanner.event_field_values FOR EACH ROW EXECUTE FUNCTION eventplanner.set_efv_updated_by();

--
-- Name: event_field_values trg_efv_version; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_efv_version BEFORE UPDATE ON eventplanner.event_field_values FOR EACH ROW EXECUTE FUNCTION eventplanner.bump_efv_version();

--
-- Name: events trg_events_updated; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_events_updated BEFORE UPDATE ON eventplanner.events FOR EACH ROW EXECUTE FUNCTION eventplanner.handle_updated_at();

--
-- Name: event_pins trg_limit_event_pins; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_limit_event_pins BEFORE INSERT ON eventplanner.event_pins FOR EACH ROW EXECUTE FUNCTION eventplanner.limit_event_pins();

--
-- Name: ops_documents trg_ops_documents_updated; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_ops_documents_updated BEFORE UPDATE ON eventplanner.ops_documents FOR EACH ROW EXECUTE FUNCTION eventplanner.handle_updated_at();

--
-- Name: profiles trg_profiles_updated; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON eventplanner.profiles FOR EACH ROW EXECUTE FUNCTION eventplanner.handle_updated_at();

--
-- Name: template_sections trg_protect_section_values; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_protect_section_values BEFORE DELETE ON eventplanner.template_sections FOR EACH ROW EXECUTE FUNCTION eventplanner.protect_template_section_values();

--
-- Name: tasks trg_tasks_updated; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON eventplanner.tasks FOR EACH ROW EXECUTE FUNCTION eventplanner.handle_updated_at();

--
-- Name: template_sections trg_tpl_sections_updated; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_tpl_sections_updated BEFORE UPDATE ON eventplanner.template_sections FOR EACH ROW EXECUTE FUNCTION eventplanner.handle_updated_at();

--
-- Name: template_fields trg_validate_template_field_default_table; Type: TRIGGER; Schema: eventplanner; Owner: -
--

CREATE TRIGGER trg_validate_template_field_default_table BEFORE INSERT OR UPDATE OF kind, default_table ON eventplanner.template_fields FOR EACH ROW EXECUTE FUNCTION eventplanner.validate_template_field_default_table();

--
-- Name: budget_items budget_items_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.budget_items
    ADD CONSTRAINT budget_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: document_text document_text_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.document_text
    ADD CONSTRAINT document_text_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_area_meta event_area_meta_area_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_area_meta
    ADD CONSTRAINT event_area_meta_area_id_fkey FOREIGN KEY (area_id) REFERENCES eventplanner.template_sections(id) ON DELETE CASCADE;

--
-- Name: event_area_meta event_area_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_area_meta
    ADD CONSTRAINT event_area_meta_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_changes event_changes_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_changes
    ADD CONSTRAINT event_changes_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_contacts event_contacts_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_contacts
    ADD CONSTRAINT event_contacts_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_custom_fields event_custom_fields_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_custom_fields
    ADD CONSTRAINT event_custom_fields_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_custom_fields event_custom_fields_extra_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_custom_fields
    ADD CONSTRAINT event_custom_fields_extra_section_id_fkey FOREIGN KEY (extra_section_id) REFERENCES eventplanner.event_section_extras(id) ON DELETE CASCADE;

--
-- Name: event_custom_fields event_custom_fields_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_custom_fields
    ADD CONSTRAINT event_custom_fields_section_id_fkey FOREIGN KEY (section_id) REFERENCES eventplanner.template_sections(id) ON DELETE SET NULL;

--
-- Name: event_deliverables event_deliverables_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_deliverables
    ADD CONSTRAINT event_deliverables_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_emergency_services event_emergency_services_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_emergency_services
    ADD CONSTRAINT event_emergency_services_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_entrant_info event_entrant_info_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_entrant_info
    ADD CONSTRAINT event_entrant_info_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_field_values event_field_values_extra_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_field_values
    ADD CONSTRAINT event_field_values_extra_section_id_fkey FOREIGN KEY (extra_section_id) REFERENCES eventplanner.event_section_extras(id) ON DELETE CASCADE;

--
-- Name: event_field_values event_field_values_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_field_values
    ADD CONSTRAINT event_field_values_section_id_fkey FOREIGN KEY (section_id) REFERENCES eventplanner.template_sections(id) ON DELETE CASCADE;

--
-- Name: event_files event_files_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_files
    ADD CONSTRAINT event_files_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_files event_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_files
    ADD CONSTRAINT event_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: event_members event_members_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_members
    ADD CONSTRAINT event_members_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_members event_members_user_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_members
    ADD CONSTRAINT event_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: event_notes event_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_notes
    ADD CONSTRAINT event_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: event_notes event_notes_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_notes
    ADD CONSTRAINT event_notes_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_pins event_pins_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_pins
    ADD CONSTRAINT event_pins_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_power_pricing event_power_pricing_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_power_pricing
    ADD CONSTRAINT event_power_pricing_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_revisions event_revisions_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_revisions
    ADD CONSTRAINT event_revisions_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_roles event_roles_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_roles
    ADD CONSTRAINT event_roles_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_schedule_blocks event_schedule_blocks_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_schedule_blocks
    ADD CONSTRAINT event_schedule_blocks_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: event_section_extras event_section_extras_parent_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_section_extras
    ADD CONSTRAINT event_section_extras_parent_section_id_fkey FOREIGN KEY (parent_section_id) REFERENCES eventplanner.template_sections(id) ON DELETE SET NULL;

--
-- Name: event_section_overrides event_section_overrides_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_section_overrides
    ADD CONSTRAINT event_section_overrides_section_id_fkey FOREIGN KEY (section_id) REFERENCES eventplanner.template_sections(id) ON DELETE CASCADE;

--
-- Name: event_templates event_templates_category_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_templates
    ADD CONSTRAINT event_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES eventplanner.event_categories(id) ON DELETE SET NULL;

--
-- Name: event_tickets event_tickets_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.event_tickets
    ADD CONSTRAINT event_tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: events events_category_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.events
    ADD CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES eventplanner.event_categories(id) ON DELETE SET NULL;

--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: events events_lead_user_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.events
    ADD CONSTRAINT events_lead_user_id_fkey FOREIGN KEY (lead_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: events events_template_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.events
    ADD CONSTRAINT events_template_id_fkey FOREIGN KEY (template_id) REFERENCES eventplanner.event_templates(id) ON DELETE SET NULL;

--
-- Name: ops_documents ops_documents_category_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.ops_documents
    ADD CONSTRAINT ops_documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES eventplanner.ops_categories(id) ON DELETE SET NULL;

--
-- Name: ops_documents ops_documents_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.ops_documents
    ADD CONSTRAINT ops_documents_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: risks risks_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.risks
    ADD CONSTRAINT risks_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: risks risks_owner_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.risks
    ADD CONSTRAINT risks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: suppliers suppliers_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.suppliers
    ADD CONSTRAINT suppliers_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.tasks
    ADD CONSTRAINT tasks_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.tasks
    ADD CONSTRAINT tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: template_fields template_fields_section_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.template_fields
    ADD CONSTRAINT template_fields_section_id_fkey FOREIGN KEY (section_id) REFERENCES eventplanner.template_sections(id) ON DELETE CASCADE;

--
-- Name: template_sections template_sections_parent_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.template_sections
    ADD CONSTRAINT template_sections_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES eventplanner.template_sections(id) ON DELETE CASCADE;

--
-- Name: timeline_milestones timeline_milestones_event_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.timeline_milestones
    ADD CONSTRAINT timeline_milestones_event_id_fkey FOREIGN KEY (event_id) REFERENCES eventplanner.events(id) ON DELETE CASCADE;

--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: eventplanner; Owner: -
--

ALTER TABLE ONLY eventplanner.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: event_area_meta area_meta_delete; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY area_meta_delete ON eventplanner.event_area_meta FOR DELETE TO authenticated USING (eventplanner_private.is_admin(auth.uid()));

--
-- Name: event_area_meta area_meta_insert; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY area_meta_insert ON eventplanner.event_area_meta FOR INSERT TO authenticated WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, area_id, auth.uid())));

--
-- Name: event_area_meta area_meta_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY area_meta_select ON eventplanner.event_area_meta FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_area_meta area_meta_update; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY area_meta_update ON eventplanner.event_area_meta FOR UPDATE TO authenticated USING ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, area_id, auth.uid()))) WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, area_id, auth.uid())));

--
-- Name: budget_items; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.budget_items ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_items budget_items_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY budget_items_edit ON eventplanner.budget_items TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: budget_items budget_items_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY budget_items_read ON eventplanner.budget_items FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_categories categories_admin_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY categories_admin_write ON eventplanner.event_categories TO authenticated USING (eventplanner_private.is_admin(auth.uid())) WITH CHECK (eventplanner_private.is_admin(auth.uid()));

--
-- Name: event_categories categories_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY categories_select ON eventplanner.event_categories FOR SELECT TO authenticated USING (eventplanner_private.is_member(auth.uid()));

--
-- Name: document_text doc_text_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY doc_text_select ON eventplanner.document_text FOR SELECT TO authenticated USING (eventplanner_private.can_read_area(event_id, area_id, auth.uid()));

--
-- Name: document_text doc_text_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY doc_text_write ON eventplanner.document_text TO authenticated USING ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, area_id, auth.uid()))) WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, area_id, auth.uid())));

--
-- Name: document_text; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.document_text ENABLE ROW LEVEL SECURITY;

--
-- Name: event_custom_fields ecf_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ecf_select ON eventplanner.event_custom_fields FOR SELECT TO authenticated USING (eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid()));

--
-- Name: event_custom_fields ecf_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ecf_write ON eventplanner.event_custom_fields TO authenticated USING ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid()))) WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid())));

--
-- Name: event_field_values efv_delete; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY efv_delete ON eventplanner.event_field_values FOR DELETE TO authenticated USING ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid())));

--
-- Name: event_field_values efv_insert; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY efv_insert ON eventplanner.event_field_values FOR INSERT TO authenticated WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid())));

--
-- Name: event_field_values efv_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY efv_select ON eventplanner.event_field_values FOR SELECT TO authenticated USING (eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid()));

--
-- Name: event_field_values efv_update; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY efv_update ON eventplanner.event_field_values FOR UPDATE TO authenticated USING ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid()))) WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, eventplanner_private.area_of(section_id, extra_section_id), auth.uid())));

--
-- Name: event_section_extras ese_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ese_select ON eventplanner.event_section_extras FOR SELECT TO authenticated USING (eventplanner_private.can_read_area(event_id, parent_section_id, auth.uid()));

--
-- Name: event_section_extras ese_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ese_write ON eventplanner.event_section_extras TO authenticated USING ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, parent_section_id, auth.uid()))) WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, parent_section_id, auth.uid())));

--
-- Name: event_area_meta; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_area_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: event_categories; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: event_changes; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: event_changes event_changes_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_changes_select ON eventplanner.event_changes FOR SELECT TO authenticated USING (eventplanner_private.can_read_area(event_id, area_id, auth.uid()));

--
-- Name: event_contacts; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_contacts event_contacts_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_contacts_edit ON eventplanner.event_contacts TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_contacts event_contacts_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_contacts_read ON eventplanner.event_contacts FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_custom_fields; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: event_deliverables; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_deliverables ENABLE ROW LEVEL SECURITY;

--
-- Name: event_deliverables event_deliverables_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_deliverables_edit ON eventplanner.event_deliverables TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_deliverables event_deliverables_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_deliverables_read ON eventplanner.event_deliverables FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_emergency_services; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_emergency_services ENABLE ROW LEVEL SECURITY;

--
-- Name: event_emergency_services event_emergency_services_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_emergency_services_edit ON eventplanner.event_emergency_services TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_emergency_services event_emergency_services_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_emergency_services_read ON eventplanner.event_emergency_services FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_entrant_info; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_entrant_info ENABLE ROW LEVEL SECURITY;

--
-- Name: event_entrant_info event_entrant_info_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_entrant_info_edit ON eventplanner.event_entrant_info TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_entrant_info event_entrant_info_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_entrant_info_read ON eventplanner.event_entrant_info FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_field_values; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_field_values ENABLE ROW LEVEL SECURITY;

--
-- Name: event_files; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_files ENABLE ROW LEVEL SECURITY;

--
-- Name: event_files event_files_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_files_edit ON eventplanner.event_files TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_files event_files_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_files_read ON eventplanner.event_files FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_members; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_members ENABLE ROW LEVEL SECURITY;

--
-- Name: event_members event_members_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_members_select ON eventplanner.event_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR eventplanner_private.is_staff(auth.uid()) OR eventplanner_private.can_manage_event(event_id, auth.uid())));

--
-- Name: event_members event_members_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_members_write ON eventplanner.event_members TO authenticated USING ((eventplanner_private.is_admin(auth.uid()) OR (eventplanner_private.can_manage_event(event_id, auth.uid()) AND (access_level <> 'manage'::text)))) WITH CHECK ((eventplanner_private.is_admin(auth.uid()) OR (eventplanner_private.can_manage_event(event_id, auth.uid()) AND (access_level <> 'manage'::text))));

--
-- Name: event_notes; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: event_notes event_notes_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_notes_edit ON eventplanner.event_notes TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_notes event_notes_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_notes_read ON eventplanner.event_notes FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_pins; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: event_power_pricing; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_power_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: event_power_pricing event_power_pricing_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_power_pricing_edit ON eventplanner.event_power_pricing TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_power_pricing event_power_pricing_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_power_pricing_read ON eventplanner.event_power_pricing FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_revisions; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_revisions event_revisions_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_revisions_edit ON eventplanner.event_revisions TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_revisions event_revisions_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_revisions_read ON eventplanner.event_revisions FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_roles; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: event_roles event_roles_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_roles_edit ON eventplanner.event_roles TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_roles event_roles_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_roles_read ON eventplanner.event_roles FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_schedule_blocks; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_schedule_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: event_schedule_blocks event_schedule_blocks_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_schedule_blocks_edit ON eventplanner.event_schedule_blocks TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_schedule_blocks event_schedule_blocks_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_schedule_blocks_read ON eventplanner.event_schedule_blocks FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_section_extras; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_section_extras ENABLE ROW LEVEL SECURITY;

--
-- Name: event_section_overrides; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_section_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: event_section_overrides event_section_overrides_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_section_overrides_edit ON eventplanner.event_section_overrides TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_section_overrides event_section_overrides_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_section_overrides_read ON eventplanner.event_section_overrides FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: event_templates; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: event_tickets; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.event_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: event_tickets event_tickets_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_tickets_edit ON eventplanner.event_tickets TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: event_tickets event_tickets_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY event_tickets_read ON eventplanner.event_tickets FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: events; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_delete_admin; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY events_delete_admin ON eventplanner.events FOR DELETE TO authenticated USING (eventplanner_private.is_admin(auth.uid()));

--
-- Name: events events_insert_authenticated; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY events_insert_authenticated ON eventplanner.events FOR INSERT TO authenticated WITH CHECK ((eventplanner_private.is_admin(auth.uid()) OR eventplanner_private.has_role(auth.uid(), 'lead'::eventplanner.app_role) OR eventplanner_private.has_role(auth.uid(), 'member'::eventplanner.app_role)));

--
-- Name: events events_select_access; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY events_select_access ON eventplanner.events FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(id, auth.uid()));

--
-- Name: events events_update_manage; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY events_update_manage ON eventplanner.events FOR UPDATE TO authenticated USING (eventplanner_private.can_manage_event(id, auth.uid())) WITH CHECK (eventplanner_private.can_manage_event(id, auth.uid()));

--
-- Name: ops_categories; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.ops_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_categories ops_categories_delete; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_categories_delete ON eventplanner.ops_categories FOR DELETE TO authenticated USING (eventplanner_private.can_manage_ops(auth.uid()));

--
-- Name: ops_categories ops_categories_insert; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_categories_insert ON eventplanner.ops_categories FOR INSERT TO authenticated WITH CHECK (eventplanner_private.can_manage_ops(auth.uid()));

--
-- Name: ops_categories ops_categories_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_categories_read ON eventplanner.ops_categories FOR SELECT TO authenticated USING (eventplanner_private.is_staff(auth.uid()));

--
-- Name: ops_categories ops_categories_update; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_categories_update ON eventplanner.ops_categories FOR UPDATE TO authenticated USING (eventplanner_private.can_manage_ops(auth.uid())) WITH CHECK (eventplanner_private.can_manage_ops(auth.uid()));

--
-- Name: ops_documents; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.ops_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_documents ops_documents_delete; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_documents_delete ON eventplanner.ops_documents FOR DELETE TO authenticated USING (eventplanner_private.can_write_ops_doc(event_id, auth.uid()));

--
-- Name: ops_documents ops_documents_insert; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_documents_insert ON eventplanner.ops_documents FOR INSERT TO authenticated WITH CHECK (eventplanner_private.can_write_ops_doc(event_id, auth.uid()));

--
-- Name: ops_documents ops_documents_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_documents_read ON eventplanner.ops_documents FOR SELECT TO authenticated USING (eventplanner_private.can_read_ops_doc(event_id, auth.uid()));

--
-- Name: ops_documents ops_documents_update; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY ops_documents_update ON eventplanner.ops_documents FOR UPDATE TO authenticated USING (eventplanner_private.can_write_ops_doc(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_write_ops_doc(event_id, auth.uid()));

--
-- Name: event_pins pins_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY pins_select ON eventplanner.event_pins FOR SELECT TO authenticated USING (eventplanner_private.can_read_area(event_id, area_id, auth.uid()));

--
-- Name: event_pins pins_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY pins_write ON eventplanner.event_pins TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK ((eventplanner_private.can_edit_event(event_id, auth.uid()) AND eventplanner_private.can_read_area(event_id, area_id, auth.uid())));

--
-- Name: profiles; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_all_auth; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY profiles_select_members ON eventplanner.profiles FOR SELECT TO authenticated USING (eventplanner_private.is_member(auth.uid()));

--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY profiles_update_own ON eventplanner.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));

--
-- Name: risks; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.risks ENABLE ROW LEVEL SECURITY;

--
-- Name: risks risks_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY risks_edit ON eventplanner.risks TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: risks risks_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY risks_read ON eventplanner.risks FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: suppliers; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY suppliers_edit ON eventplanner.suppliers TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: suppliers suppliers_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY suppliers_read ON eventplanner.suppliers FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: tasks; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY tasks_edit ON eventplanner.tasks TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: tasks tasks_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY tasks_read ON eventplanner.tasks FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: template_fields; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.template_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: template_sections; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.template_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: event_templates templates_admin_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY templates_admin_write ON eventplanner.event_templates TO authenticated USING (eventplanner_private.is_admin(auth.uid())) WITH CHECK (eventplanner_private.is_admin(auth.uid()));

--
-- Name: event_templates templates_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY templates_select ON eventplanner.event_templates FOR SELECT TO authenticated USING (eventplanner_private.is_member(auth.uid()));

--
-- Name: timeline_milestones; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.timeline_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_milestones timeline_milestones_edit; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY timeline_milestones_edit ON eventplanner.timeline_milestones TO authenticated USING (eventplanner_private.can_edit_event(event_id, auth.uid())) WITH CHECK (eventplanner_private.can_edit_event(event_id, auth.uid()));

--
-- Name: timeline_milestones timeline_milestones_read; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY timeline_milestones_read ON eventplanner.timeline_milestones FOR SELECT TO authenticated USING (eventplanner_private.can_read_event(event_id, auth.uid()));

--
-- Name: template_fields tpl_fields_admin_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY tpl_fields_admin_write ON eventplanner.template_fields TO authenticated USING (eventplanner_private.is_admin(auth.uid())) WITH CHECK (eventplanner_private.is_admin(auth.uid()));

--
-- Name: template_fields tpl_fields_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY tpl_fields_select ON eventplanner.template_fields FOR SELECT TO authenticated USING (eventplanner_private.is_member(auth.uid()));

--
-- Name: template_sections tpl_sections_admin_write; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY tpl_sections_admin_write ON eventplanner.template_sections TO authenticated USING (eventplanner_private.is_admin(auth.uid())) WITH CHECK (eventplanner_private.is_admin(auth.uid()));

--
-- Name: template_sections tpl_sections_select; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY tpl_sections_select ON eventplanner.template_sections FOR SELECT TO authenticated USING (eventplanner_private.is_member(auth.uid()));

--
-- Name: user_roles; Type: ROW SECURITY; Schema: eventplanner; Owner: -
--

ALTER TABLE eventplanner.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_admin_all; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY user_roles_admin_all ON eventplanner.user_roles TO authenticated USING (eventplanner_private.is_admin(auth.uid())) WITH CHECK (eventplanner_private.is_admin(auth.uid()));

--
-- Name: user_roles user_roles_select_own_or_admin; Type: POLICY; Schema: eventplanner; Owner: -
--

CREATE POLICY user_roles_select_own_or_admin ON eventplanner.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR eventplanner_private.is_admin(auth.uid())));

--
-- PostgreSQL database dump complete
--


-- =====================================================================
-- Joining Event Planner from the Control Centre
-- =====================================================================

-- Called by the app when someone opens it. Creates or refreshes their Event
-- Planner profile from their Control Centre account. The first Control Centre
-- admin to open Event Planner becomes its first admin, so someone can set
-- everyone else's roles. Returns false if they may not open Event Planner.
CREATE FUNCTION eventplanner.ensure_member() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
BEGIN
  IF NOT eventplanner_private.is_member(_uid) THEN
    RETURN false;
  END IF;

  SELECT u.email,
         nullif(btrim(coalesce(nullif(pp.full_name, u.email), u.raw_user_meta_data->>'full_name', '')), '')
    INTO _email, _name
    FROM auth.users u
    LEFT JOIN public.profiles pp ON pp.id = u.id
   WHERE u.id = _uid;

  INSERT INTO eventplanner.profiles (id, email, display_name)
  VALUES (_uid, _email, coalesce(_name, split_part(_email, '@', 1)))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = coalesce(_name, nullif(btrim(eventplanner.profiles.display_name), ''), EXCLUDED.display_name);

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text = 'admin')
     AND NOT EXISTS (SELECT 1 FROM eventplanner.user_roles WHERE role = 'admin') THEN
    INSERT INTO eventplanner.user_roles (user_id, role) VALUES (_uid, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  RETURN true;
END;
$$;

-- =====================================================================
-- Shared event ID (R24)
-- =====================================================================
-- eventplanner.events.id is the one ID for an event across OTG. Other OTG
-- apps can list events (name, dates, venue, status) through this function
-- and store the id against their own records. It shows nothing private:
-- no area content, people or files. Anyone with an active Control Centre
-- account can call it; External stakeholders only see their own events.
CREATE FUNCTION eventplanner.event_directory()
RETURNS TABLE (id uuid, name text, start_date date, end_date date, venue text, stage text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT e.id, e.name, e.proposed_date, e.end_date, coalesce(e.venue, e.location), e.stage::text
    FROM eventplanner.events e
   WHERE auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'deactivated')
     AND (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
          AND NOT EXISTS (SELECT 1 FROM eventplanner.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'supplier'
                          AND NOT EXISTS (SELECT 1 FROM eventplanner.user_roles r2 WHERE r2.user_id = auth.uid() AND r2.role <> 'supplier'))
          OR eventplanner_private.can_read_event(e.id, auth.uid()))
   ORDER BY e.proposed_date NULLS LAST, e.name
$$;

-- =====================================================================
-- File storage (private)
-- =====================================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('eventplanner-files', 'eventplanner-files', false),
  ('eventplanner-ops-plans', 'eventplanner-ops-plans', false)
ON CONFLICT (id) DO NOTHING;

-- Event files: <event id>/<area id or other folder>/<file>. Reading follows
-- the event and area rules, so staff-only and managers-only files stay hidden.
CREATE POLICY eventplanner_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'eventplanner-files' AND eventplanner_private.can_read_file(name, auth.uid()));
CREATE POLICY eventplanner_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'eventplanner-files' AND eventplanner_private.can_write_file(name, auth.uid()));
CREATE POLICY eventplanner_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'eventplanner-files' AND eventplanner_private.can_write_file(name, auth.uid()));
CREATE POLICY eventplanner_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'eventplanner-files' AND eventplanner_private.can_write_file(name, auth.uid()));

-- Operations plans: company SOPs at the top level, event plans under events/<event id>/.
CREATE POLICY eventplanner_ops_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'eventplanner-ops-plans' AND eventplanner_private.can_read_ops_doc(eventplanner_private.ops_path_event(name), auth.uid()));
CREATE POLICY eventplanner_ops_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'eventplanner-ops-plans' AND eventplanner_private.can_write_ops_doc(eventplanner_private.ops_path_event(name), auth.uid()));
CREATE POLICY eventplanner_ops_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'eventplanner-ops-plans' AND eventplanner_private.can_write_ops_doc(eventplanner_private.ops_path_event(name), auth.uid()));
CREATE POLICY eventplanner_ops_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'eventplanner-ops-plans' AND eventplanner_private.can_write_ops_doc(eventplanner_private.ops_path_event(name), auth.uid()));

-- =====================================================================
-- Permissions on the two schemas
-- =====================================================================
GRANT USAGE ON SCHEMA eventplanner TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA eventplanner_private TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA eventplanner TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA eventplanner TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA eventplanner TO authenticated, service_role;

-- Profiles: created by ensure_member(); people may only change their own name.
REVOKE INSERT, UPDATE ON eventplanner.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url) ON eventplanner.profiles TO authenticated;
-- Change history is written only by the automations.
REVOKE INSERT, UPDATE, DELETE ON eventplanner.event_changes FROM authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA eventplanner FROM PUBLIC, anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA eventplanner_private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA eventplanner TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA eventplanner_private TO authenticated, service_role;
-- Policies on storage are also checked for signed-out requests, so these two
-- must be callable by anon (they return nothing useful without a sign-in).
GRANT EXECUTE ON FUNCTION eventplanner.importing() TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA eventplanner GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA eventplanner GRANT ALL ON TABLES TO service_role;

-- Last step, in Supabase: Project Settings -> Data API -> Exposed schemas:
-- add "eventplanner" (NOT eventplanner_private), then Save.
