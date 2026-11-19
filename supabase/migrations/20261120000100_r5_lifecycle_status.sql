-- R5: lifecycle status with archiving.
--
-- Status now runs Draft → In planning → Confirmed → Delivery ready → Live →
-- Completed → Archived. Archiving is only possible from Completed. An archived
-- event is read-only for everyone (including admins) until someone who manages
-- it restores it; nothing is deleted. Archived events are left out of
-- "All events" search; searching inside the archived event itself still works.
--
-- New enum values are compared as text in this file, because Postgres doesn't
-- allow a just-added enum value to be used in the same transaction.

ALTER TYPE eventplanner.event_stage ADD VALUE IF NOT EXISTS 'live' AFTER 'delivery_ready';
ALTER TYPE eventplanner.event_stage ADD VALUE IF NOT EXISTS 'archived' AFTER 'completed';

ALTER TABLE eventplanner.events
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE OR REPLACE FUNCTION eventplanner_private.is_archived(_event_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT EXISTS (SELECT 1 FROM eventplanner.events e WHERE e.id = _event_id AND e.stage::text = 'archived')
$$;

-- Reading never depends on archiving: who can see managers-only and staff-only
-- areas, and the list of people with access, use the plain access level.
CREATE OR REPLACE FUNCTION eventplanner_private.manages_event(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(eventplanner_private.event_access(_event_id, _uid) = 'manage', false)
$$;

CREATE OR REPLACE FUNCTION eventplanner_private.can_read_area(_event_id uuid, _area_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT eventplanner_private.can_read_event(_event_id, _uid) AND (
    _area_id IS NULL OR
    CASE eventplanner_private.area_restriction(_event_id, _area_id)
      WHEN 'staff' THEN eventplanner_private.is_staff(_uid) OR eventplanner_private.manages_event(_event_id, _uid)
      WHEN 'managers' THEN eventplanner_private.manages_event(_event_id, _uid)
      ELSE true
    END
  )
$$;

DROP POLICY IF EXISTS event_members_select ON eventplanner.event_members;
CREATE POLICY event_members_select ON eventplanner.event_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR eventplanner_private.is_staff(auth.uid()) OR eventplanner_private.manages_event(event_id, auth.uid()));

-- Access to an archived event stays as it was until it's restored (admins included).
DROP POLICY IF EXISTS event_members_write ON eventplanner.event_members;
CREATE POLICY event_members_write ON eventplanner.event_members TO authenticated
  USING (NOT eventplanner_private.is_archived(event_id) AND (eventplanner_private.is_admin(auth.uid()) OR (eventplanner_private.can_manage_event(event_id, auth.uid()) AND access_level <> 'manage')))
  WITH CHECK (NOT eventplanner_private.is_archived(event_id) AND (eventplanner_private.is_admin(auth.uid()) OR (eventplanner_private.can_manage_event(event_id, auth.uid()) AND access_level <> 'manage')));

-- Editing and managing stop while an event is archived. Every write rule for
-- event content (values, files, structure, pins, reviews, access) goes through
-- these two functions, so this one change makes the whole event read-only.
CREATE OR REPLACE FUNCTION eventplanner_private.can_edit_event(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(eventplanner_private.event_access(_event_id, _uid) IN ('edit','manage'), false)
     AND NOT eventplanner_private.is_archived(_event_id)
$$;

CREATE OR REPLACE FUNCTION eventplanner_private.can_manage_event(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT COALESCE(eventplanner_private.event_access(_event_id, _uid) = 'manage', false)
     AND NOT eventplanner_private.is_archived(_event_id)
$$;

CREATE OR REPLACE FUNCTION eventplanner_private.can_write_ops_doc(_event_id uuid, _uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT CASE
    WHEN _event_id IS NOT NULL AND eventplanner_private.is_archived(_event_id) THEN false
    ELSE eventplanner_private.can_manage_ops(_uid)
      OR (_event_id IS NOT NULL AND eventplanner_private.event_access(_event_id, _uid) = 'manage')
  END
$$;

-- The event row itself: people who manage the event can still update it while
-- it's archived, but only to restore it (the trigger below enforces that).
DROP POLICY IF EXISTS events_update_manage ON eventplanner.events;
CREATE POLICY events_update_manage ON eventplanner.events FOR UPDATE TO authenticated
  USING (eventplanner_private.manages_event(id, auth.uid()))
  WITH CHECK (eventplanner_private.manages_event(id, auth.uid()));

CREATE OR REPLACE FUNCTION eventplanner.guard_event_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF OLD.stage::text = 'archived' THEN
    IF NEW.stage::text = 'archived' THEN
      RAISE EXCEPTION 'This event is archived, so it can''t be changed. Restore it first.' USING ERRCODE = '42501';
    END IF;
    -- Restoring: only the status may change, and it goes back to Completed.
    NEW := OLD;
    NEW.stage := 'completed';
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.stage::text = 'archived' THEN
    IF OLD.stage::text <> 'completed' THEN
      RAISE EXCEPTION 'Only a completed event can be archived. Set its status to Completed first.' USING ERRCODE = '22023';
    END IF;
    NEW.archived_at := now();
    NEW.archived_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_lifecycle ON eventplanner.events;
CREATE TRIGGER trg_events_lifecycle BEFORE UPDATE ON eventplanner.events
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_event_lifecycle();

-- "All events" search leaves archived events out. A search inside one event
-- (the event id is given) still finds its information.
CREATE OR REPLACE FUNCTION eventplanner.search_event_values(_q text, _event_id uuid DEFAULT NULL::uuid) RETURNS SETOF eventplanner.event_field_values
    LANGUAGE sql STABLE
    SET search_path TO 'eventplanner'
    AS $$
  SELECT v.* FROM eventplanner.event_field_values v
  WHERE (_event_id IS NULL OR v.event_id = _event_id)
    AND (_event_id IS NOT NULL OR NOT eventplanner_private.is_archived(v.event_id))
    AND EXISTS (
      SELECT 1 FROM unnest(regexp_split_to_array(lower(btrim(_q)), '\s+')) t
      WHERE t <> '' AND position(t IN lower(COALESCE(v.value_text, '') || ' ' || COALESCE(v.value_table::text, '') || ' ' || COALESCE(v.value_links::text, '') || ' ' || COALESCE(v.value_kv::text, ''))) > 0
    )
  LIMIT 500
$$;

CREATE OR REPLACE FUNCTION eventplanner.search_document_text(_q text, _event_id uuid DEFAULT NULL::uuid) RETURNS TABLE(event_id uuid, path text, area_id uuid, file_name text, snippet text)
    LANGUAGE sql STABLE
    SET search_path TO 'eventplanner'
    AS $$
  WITH terms AS (SELECT array_remove(regexp_split_to_array(lower(btrim(_q)), '\s+'), '') AS t)
  SELECT d.event_id, d.path, d.area_id, d.file_name,
    substr(d.content, greatest(1, position((SELECT t[1] FROM terms) IN lower(d.content)) - 80), 240)
  FROM eventplanner.document_text d
  WHERE d.status = 'indexed' AND d.content IS NOT NULL AND NOT d.superseded
    AND (_event_id IS NULL OR d.event_id = _event_id)
    AND (_event_id IS NOT NULL OR NOT eventplanner_private.is_archived(d.event_id))
    AND cardinality((SELECT t FROM terms)) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest((SELECT t FROM terms)) x WHERE position(x IN lower(d.content)) = 0)
  LIMIT 100
$$;

CREATE OR REPLACE FUNCTION eventplanner.search_ops_documents(_q text, _event_id uuid DEFAULT NULL::uuid, _all_events boolean DEFAULT false) RETURNS TABLE(id uuid, title text, file_name text, category_id uuid, category_name text, snippet text, in_title boolean, event_id uuid, event_name text)
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
    WHERE d.event_id IS NULL OR d.event_id = _event_id
       OR (_all_events AND d.event_id IS NOT NULL AND e.stage::text <> 'archived')
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

REVOKE EXECUTE ON FUNCTION eventplanner_private.is_archived(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eventplanner_private.is_archived(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION eventplanner_private.manages_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eventplanner_private.manages_event(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION eventplanner.guard_event_lifecycle() FROM PUBLIC, anon;
