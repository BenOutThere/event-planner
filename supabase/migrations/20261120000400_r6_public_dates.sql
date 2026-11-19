-- R6: public event dates.
-- Adds "Public start date" and "Public end date" next to the event start and
-- end dates in the shared template (once), so the days open to the public can
-- differ from the operational event dates without anyone guessing.

INSERT INTO eventplanner.template_fields (section_id, key, label, kind, sort_order, help_text, multiline)
SELECT f.section_id, x.key, x.label, 'date', f.sort_order + x.offs, x.help, false
FROM eventplanner.template_fields f
CROSS JOIN (VALUES
  ('public_start_date', 'Public start date', 1, 'First day open to the public or on sale, if different from the event start date.'),
  ('public_end_date', 'Public end date', 2, 'Last day open to the public, if different from the event end date.')
) AS x(key, label, offs, help)
WHERE f.key = 'event_end_date' AND f.archived_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM eventplanner.template_fields g WHERE g.section_id = f.section_id AND g.key = x.key);
