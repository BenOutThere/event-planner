-- R18: start a new event from a previous edition.
--
-- copy_event() creates the new event (as a Draft, led by the person copying)
-- and copies:
--   * the event's own structure: event-only sub-sections and fields (all areas);
--   * who is responsible for each area, and any per-event "who can see this
--     area" setting, so restricted areas stay restricted;
--   * the information in the areas chosen, but only areas the person copying
--     can read. Dates, uploaded files and reviews are not copied: reviews start
--     again, and the new event gets the name and dates given.
-- People with access are not copied; the lead adds them.
--
-- Anyone who can create events (Admin, Lead, Member) can copy an event they
-- can read.

-- Copying a restricted area's setting is allowed for whoever runs copy_event.
CREATE OR REPLACE FUNCTION eventplanner.guard_area_meta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL
     AND COALESCE(current_setting('eventplanner.copying_event', true), '') <> 'on'
     AND (TG_OP = 'INSERT' AND NEW.restricted_to IS NOT NULL OR TG_OP = 'UPDATE' AND NEW.restricted_to IS DISTINCT FROM OLD.restricted_to)
     AND NOT eventplanner_private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can change who can see this area';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION eventplanner.copy_event(
    _source uuid, _name text, _start date, _end date DEFAULT NULL, _areas uuid[] DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _src eventplanner.events%ROWTYPE;
  _new uuid := gen_random_uuid();
  _extra RECORD;
  _map jsonb := '{}'::jsonb;
  _skip text[] := ARRAY['event_name','event_start_date','event_end_date','bump_in_start_date','bump_out_end_date',
                        'public_start_date','public_end_date','public_event_dates','dates_open_to_the_public'];
BEGIN
  IF _uid IS NULL OR NOT (eventplanner_private.is_admin(_uid)
      OR eventplanner_private.has_role(_uid, 'lead') OR eventplanner_private.has_role(_uid, 'member')) THEN
    RAISE EXCEPTION 'Only Admins, Leads and Members can create events.' USING ERRCODE = '42501';
  END IF;
  IF NOT eventplanner_private.can_read_event(_source, _uid) THEN
    RAISE EXCEPTION 'Event not found, or you don''t have access to it.' USING ERRCODE = '42501';
  END IF;
  IF _end IS NOT NULL AND _end < _start THEN
    RAISE EXCEPTION 'The end date is before the start date.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _src FROM eventplanner.events WHERE id = _source;

  -- The new event (guard_new_event checks the name and start date).
  INSERT INTO eventplanner.events (id, name, proposed_date, end_date, location, venue, category_id, organising_entity,
                                   template_variant, lead_user_id, created_by, stage)
  VALUES (_new, btrim(_name), _start, _end, _src.location, _src.venue, _src.category_id, _src.organising_entity,
          _src.template_variant, _uid, _uid, 'draft');

  -- Event-only sub-sections and fields.
  FOR _extra IN SELECT * FROM eventplanner.event_section_extras WHERE event_id = _source LOOP
    DECLARE _nid uuid := gen_random_uuid();
    BEGIN
      INSERT INTO eventplanner.event_section_extras (id, event_id, title, description, sort_order, parent_section_id, created_by)
      VALUES (_nid, _new, _extra.title, _extra.description, _extra.sort_order, _extra.parent_section_id, _uid);
      _map := _map || jsonb_build_object(_extra.id::text, _nid::text);
    END;
  END LOOP;

  INSERT INTO eventplanner.event_custom_fields (event_id, section_id, extra_section_id, key, label, kind, sort_order, help_text,
                                                is_required, allow_na, multiline, default_table, table_rules, created_by)
  SELECT _new, c.section_id, (_map->>c.extra_section_id::text)::uuid, c.key, c.label, c.kind, c.sort_order, c.help_text,
         c.is_required, c.allow_na, c.multiline, c.default_table, c.table_rules, _uid
  FROM eventplanner.event_custom_fields c WHERE c.event_id = _source;

  -- Who's responsible for each area, and per-event restrictions (reviews start again).
  PERFORM set_config('eventplanner.copying_event', 'on', true);
  INSERT INTO eventplanner.event_area_meta (event_id, area_id, responsible_name, responsible_user_id, restricted_to)
  SELECT _new, m.area_id, m.responsible_name, m.responsible_user_id, m.restricted_to
  FROM eventplanner.event_area_meta m
  WHERE m.event_id = _source
    AND (m.responsible_name IS NOT NULL OR m.responsible_user_id IS NOT NULL OR m.restricted_to IS NOT NULL);
  PERFORM set_config('eventplanner.copying_event', 'off', true);

  -- Information in the chosen areas that the person can read.
  INSERT INTO eventplanner.event_field_values (event_id, section_id, extra_section_id, field_key, label, kind,
                                               value_text, value_kv, value_links, value_table, not_applicable, sort_order)
  SELECT _new, v.section_id, (_map->>v.extra_section_id::text)::uuid, v.field_key, v.label, v.kind,
         v.value_text, v.value_kv, v.value_links, v.value_table, v.not_applicable, v.sort_order
  FROM eventplanner.event_field_values v
  WHERE v.event_id = _source
    AND v.kind NOT IN ('files', 'date')
    AND NOT (v.field_key = ANY (_skip))
    AND (_areas IS NULL OR eventplanner_private.area_of(v.section_id, v.extra_section_id) = ANY (_areas))
    AND eventplanner_private.can_read_area(_source, eventplanner_private.area_of(v.section_id, v.extra_section_id), _uid);

  -- The new name and dates, in the template's own fields.
  INSERT INTO eventplanner.event_field_values (event_id, section_id, field_key, label, kind, value_text)
  SELECT _new, f.section_id, f.key, f.label, f.kind,
         CASE f.key WHEN 'event_name' THEN btrim(_name) WHEN 'event_start_date' THEN _start::text ELSE _end::text END
  FROM eventplanner.template_fields f
  WHERE f.archived_at IS NULL AND f.key IN ('event_name', 'event_start_date', 'event_end_date')
    AND (f.key <> 'event_end_date' OR _end IS NOT NULL)
  ON CONFLICT DO NOTHING;

  RETURN _new;
END;
$$;

REVOKE EXECUTE ON FUNCTION eventplanner.copy_event(uuid, text, date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eventplanner.copy_event(uuid, text, date, date, uuid[]) TO authenticated, service_role;
