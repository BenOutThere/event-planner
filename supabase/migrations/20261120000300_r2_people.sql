-- R2: people are OTG users, not free text.
--
-- 1. Only admins can change an event's lead, because the event lead manages
--    the event (the same rule as giving someone "Can manage").
-- 2. Names come from the Control Centre: whenever anyone opens Event Planner,
--    every member's name is refreshed from their Control Centre profile, so
--    people show as "Clare Smith" rather than "clare".

CREATE OR REPLACE FUNCTION eventplanner.guard_event_lead() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF NEW.lead_user_id IS DISTINCT FROM OLD.lead_user_id
     AND auth.uid() IS NOT NULL
     AND NOT eventplanner_private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can change the event lead, because the event lead manages the event.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_lead ON eventplanner.events;
CREATE TRIGGER trg_events_lead BEFORE UPDATE OF lead_user_id ON eventplanner.events
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_event_lead();

CREATE OR REPLACE FUNCTION eventplanner.ensure_member() RETURNS boolean
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

  -- Everyone else's name, from their Control Centre profile when it has one.
  UPDATE eventplanner.profiles p
     SET display_name = btrim(pp.full_name)
    FROM public.profiles pp
   WHERE pp.id = p.id
     AND nullif(btrim(pp.full_name), '') IS NOT NULL
     AND btrim(pp.full_name) <> coalesce(p.email, '')
     AND p.display_name IS DISTINCT FROM btrim(pp.full_name);

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text = 'admin')
     AND NOT EXISTS (SELECT 1 FROM eventplanner.user_roles WHERE role = 'admin') THEN
    INSERT INTO eventplanner.user_roles (user_id, role) VALUES (_uid, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION eventplanner.guard_event_lead() FROM PUBLIC, anon;
