ALTER TABLE public.template_fields
ADD COLUMN IF NOT EXISTS default_table jsonb;

CREATE OR REPLACE FUNCTION public.validate_template_field_default_table()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.default_table IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.kind <> 'table' THEN
    NEW.default_table := NULL;
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

DROP TRIGGER IF EXISTS trg_validate_template_field_default_table ON public.template_fields;
CREATE TRIGGER trg_validate_template_field_default_table
BEFORE INSERT OR UPDATE OF kind, default_table ON public.template_fields
FOR EACH ROW
EXECUTE FUNCTION public.validate_template_field_default_table();