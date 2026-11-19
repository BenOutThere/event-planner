-- R10: set up the four empty areas and add Site information, so every Event
-- Home tile has somewhere to point. Built from the starter fields; review the
-- list with department leads (docs/r10-starter-fields.md) before running.
--
-- Safe to run more than once: fields are only added to an area that has no
-- fields yet, and Site information is only created if no area like it exists.
-- Everything stays editable in the Template builder afterwards.

-- 1. Site information (a new area, next to Operations).
INSERT INTO eventplanner.template_sections (key, title, description, sort_order, nav_group)
SELECT 'site_information', 'Site Information',
       'Site map, access, power, water, waste and emergency points for this event.',
       COALESCE((SELECT sort_order FROM eventplanner.template_sections WHERE title ILIKE 'operations' AND parent_id IS NULL AND is_active LIMIT 1), 100) + 1,
       'Delivery'
WHERE NOT EXISTS (
  SELECT 1 FROM eventplanner.template_sections
  WHERE is_active AND (key = 'site_information' OR title ~* '\msite\M|site map|floor plan|venue info')
);

-- 2. Starter fields for each empty area.
WITH starter(area, sort, label, kind, help) AS (VALUES
  ('operations', 1, 'Operations overview', 'text', 'How the event runs on the day: zones, key timings and who leads each part.'),
  ('operations', 2, 'Staffing & crew', 'table', NULL),
  ('operations', 3, 'Accreditation & wristbands', 'text', 'Who needs which pass, and where to collect it.'),
  ('operations', 4, 'Security', 'text', 'Provider, numbers, posts and key contacts.'),
  ('operations', 5, 'Traffic management', 'text', 'Traffic plan, road closures and approvals.'),
  ('operations', 6, 'Operational documents', 'files', 'Run sheets, bump-in plans and other working documents.'),
  ('marketing & communications', 1, 'Key messages', 'text', 'What every department should say about the event.'),
  ('marketing & communications', 2, 'Target audience', 'text', 'Who the event is for.'),
  ('marketing & communications', 3, 'Campaign timeline', 'text', 'Announcements, on-sale dates and key campaign moments.'),
  ('marketing & communications', 4, 'Channels', 'text', 'Website, social, email, media and paid channels being used.'),
  ('marketing & communications', 5, 'Brand & media assets', 'links', 'Logos, photos and templates.'),
  ('commercial', 1, 'Sponsors & partners', 'text', 'Who''s involved and their key entitlements.'),
  ('commercial', 2, 'Commercial agreements', 'links', 'Links to signed agreements.'),
  ('commercial', 3, 'Food & beverage', 'text', 'Caterers, bars and licensing.'),
  ('commercial', 4, 'Merchandise', 'text', 'Range, suppliers and selling points.'),
  ('event scope', 1, 'In scope', 'text', 'What this event includes.'),
  ('event scope', 2, 'Out of scope', 'text', 'What it doesn''t, to avoid assumptions.'),
  ('event scope', 3, 'Key deliverables', 'text', 'What OTG must deliver, and for whom.'),
  ('event scope', 4, 'Assumptions & constraints', 'text', 'Anything the plan depends on.'),
  ('site information', 1, 'Site map', 'files', 'Upload the current site or floor plan.'),
  ('site information', 2, 'Site access & parking', 'text', 'Gates, deliveries, staff and public parking.'),
  ('site information', 3, 'Power & water', 'text', 'Supply points, generators and outlets.'),
  ('site information', 4, 'Waste & cleaning', 'text', 'Bins, contractors and schedules.'),
  ('site information', 5, 'Emergency points', 'text', 'Assembly areas, first aid, emergency access routes.')
),
areas AS (
  SELECT s.id, lower(s.title) AS t
  FROM eventplanner.template_sections s
  WHERE s.parent_id IS NULL AND s.is_active
    AND NOT EXISTS (
      SELECT 1 FROM eventplanner.template_fields f
      JOIN eventplanner.template_sections c ON c.id = f.section_id
      WHERE (c.id = s.id OR c.parent_id = s.id) AND f.archived_at IS NULL
    )
)
INSERT INTO eventplanner.template_fields (section_id, key, label, kind, sort_order, help_text, multiline, default_table)
SELECT a.id,
       trim(both '_' from regexp_replace(lower(st.label), '[^a-z0-9]+', '_', 'g')),
       st.label, st.kind, st.sort, st.help, st.kind = 'text',
       CASE WHEN st.kind = 'table' THEN '{"columns":["Role","Name","Number needed","Mobile"],"rows":[["","","",""]]}'::jsonb END
FROM starter st
JOIN areas a ON a.t = st.area OR (st.area = 'marketing & communications' AND a.t ~ '^marketing')
ON CONFLICT (section_id, key) DO NOTHING;
