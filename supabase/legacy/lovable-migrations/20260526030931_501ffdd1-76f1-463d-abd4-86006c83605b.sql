
ALTER TABLE public.template_fields DROP CONSTRAINT IF EXISTS template_fields_kind_check;
ALTER TABLE public.template_fields ADD CONSTRAINT template_fields_kind_check
  CHECK (kind = ANY (ARRAY['text','kv','links','files','table','phone','email']));

ALTER TABLE public.event_field_values DROP CONSTRAINT IF EXISTS event_field_values_kind_check;
ALTER TABLE public.event_field_values ADD CONSTRAINT event_field_values_kind_check
  CHECK (kind = ANY (ARRAY['text','kv','links','files','table','phone','email']));

ALTER TABLE public.event_field_values ADD COLUMN IF NOT EXISTS value_table jsonb;
