-- R7: no placeholder labels in the app.
--
-- 1. Text fields can have a fixed list of choices (shown as a dropdown).
-- 2. The "OTPME" field becomes "Operating entity", a dropdown of the OTG
--    operating entities Ben confirmed on 19 Nov 2026. Any saved "OTPME" value
--    is written out in full.
-- 3. A field or area name that looks like a placeholder (e.g. "OTPME", "TBC",
--    "TODO", "[name]") can't be saved in the template or as an event-only field.

ALTER TABLE eventplanner.template_fields ADD COLUMN IF NOT EXISTS options jsonb;

UPDATE eventplanner.template_fields
SET label = 'Operating entity',
    help_text = 'The OTG company that runs this event.',
    multiline = false,
    options = '["Summernats", "Out There Productions Major Events", "Out There Productions Australia", "Rocky Nats", "Way Out There Productions", "NDRC Entertainment"]'::jsonb
WHERE key = 'otpme' OR upper(btrim(label)) = 'OTPME';

UPDATE eventplanner.event_field_values v
SET value_text = 'Out There Productions Major Events'
FROM eventplanner.template_fields f
WHERE f.section_id = v.section_id AND f.key = v.field_key
  AND (f.key = 'otpme' OR f.label = 'Operating entity')
  AND upper(btrim(v.value_text)) = 'OTPME';

CREATE OR REPLACE FUNCTION eventplanner_private.is_placeholder_label(_label text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT btrim(COALESCE(_label, '')) ~* '^(tbc|tba|tbd|todo|xxx+|placeholder|lorem|otpme)\M'
      OR btrim(COALESCE(_label, '')) ~ '^[\[{<]'
      OR btrim(COALESCE(_label, '')) ~ '^[A-Z0-9]{4,}$'
$$;

CREATE OR REPLACE FUNCTION eventplanner.guard_placeholder_label() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
DECLARE
  _name text := COALESCE(to_jsonb(NEW)->>'label', to_jsonb(NEW)->>'title');
BEGIN
  IF eventplanner.importing() THEN RETURN NEW; END IF;
  IF eventplanner_private.is_placeholder_label(_name) THEN
    RAISE EXCEPTION '"%" looks like a placeholder. Use the full wording people will understand, e.g. "Operating entity" rather than "OTPME".', btrim(_name)
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_template_fields_label ON eventplanner.template_fields;
CREATE TRIGGER trg_template_fields_label BEFORE INSERT OR UPDATE OF label ON eventplanner.template_fields
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_placeholder_label();
DROP TRIGGER IF EXISTS trg_template_sections_label ON eventplanner.template_sections;
CREATE TRIGGER trg_template_sections_label BEFORE INSERT OR UPDATE OF title ON eventplanner.template_sections
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_placeholder_label();
DROP TRIGGER IF EXISTS trg_event_custom_fields_label ON eventplanner.event_custom_fields;
CREATE TRIGGER trg_event_custom_fields_label BEFORE INSERT OR UPDATE OF label ON eventplanner.event_custom_fields
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_placeholder_label();
DROP TRIGGER IF EXISTS trg_event_section_extras_label ON eventplanner.event_section_extras;
CREATE TRIGGER trg_event_section_extras_label BEFORE INSERT OR UPDATE OF title ON eventplanner.event_section_extras
  FOR EACH ROW EXECUTE FUNCTION eventplanner.guard_placeholder_label();

REVOKE EXECUTE ON FUNCTION eventplanner_private.is_placeholder_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eventplanner_private.is_placeholder_label(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION eventplanner.guard_placeholder_label() FROM PUBLIC, anon;
