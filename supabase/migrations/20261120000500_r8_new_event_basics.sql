-- R8: a new event needs a real name and a start date, so the Events page
-- never fills up with "Untitled event" cards without dates. Existing events
-- aren't touched (the "Untitled event" is for an admin to delete or fill in).

CREATE OR REPLACE FUNCTION eventplanner.guard_new_event() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF btrim(COALESCE(NEW.name, '')) = '' OR btrim(NEW.name) ~* '^untitled( event)?$' THEN
    RAISE EXCEPTION 'Give the event its real name.' USING ERRCODE = '23514';
  END IF;
  IF NEW.proposed_date IS NULL THEN
    RAISE EXCEPTION 'Enter the event start date (a best guess is fine).' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_new ON eventplanner.events;
CREATE TRIGGER trg_events_new BEFORE INSERT ON eventplanner.events
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_new_event();

REVOKE EXECUTE ON FUNCTION eventplanner.guard_new_event() FROM PUBLIC, anon;
