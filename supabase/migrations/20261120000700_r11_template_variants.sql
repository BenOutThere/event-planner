-- R11: template variants. Ben chose two on 19 Nov 2026: Major event and
-- Smaller event. Both share one template; each area says which variants
-- include it (both, to start with). An event shows the areas for its variant,
-- plus any other area that already holds information, so nothing is hidden
-- once someone has written it down.

ALTER TABLE eventplanner.template_sections
  ADD COLUMN IF NOT EXISTS variants text[] NOT NULL DEFAULT '{major,smaller}';
ALTER TABLE eventplanner.template_sections DROP CONSTRAINT IF EXISTS template_sections_variants_check;
ALTER TABLE eventplanner.template_sections ADD CONSTRAINT template_sections_variants_check
  CHECK (cardinality(variants) >= 1 AND variants <@ '{major,smaller}'::text[]);

ALTER TABLE eventplanner.events
  ADD COLUMN IF NOT EXISTS template_variant text NOT NULL DEFAULT 'major';
ALTER TABLE eventplanner.events DROP CONSTRAINT IF EXISTS events_template_variant_check;
ALTER TABLE eventplanner.events ADD CONSTRAINT events_template_variant_check
  CHECK (template_variant IN ('major', 'smaller'));
