-- R19: eight main categories for operations plans (Ben chose the brief's list
-- on 19 Nov 2026): Safety, Medical, Traffic, Site, Competition, Security,
-- Comms, SOP.
--
-- Nothing is regrouped here. Each existing category gets a "main category"
-- link, which an admin or lead sets in Operations plans → Categories, where
-- the app suggests one for each. Until then everything shows as before.
-- Existing categories are kept (large plans use them as section names), so
-- searching for an old category name still finds its plans and sections.

ALTER TABLE eventplanner.ops_categories ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;
ALTER TABLE eventplanner.ops_categories ADD COLUMN IF NOT EXISTS main_category_id uuid
  REFERENCES eventplanner.ops_categories(id) ON DELETE SET NULL;
ALTER TABLE eventplanner.ops_categories DROP CONSTRAINT IF EXISTS ops_categories_main_check;
ALTER TABLE eventplanner.ops_categories ADD CONSTRAINT ops_categories_main_check
  CHECK (NOT (is_main AND main_category_id IS NOT NULL) AND main_category_id IS DISTINCT FROM id);

-- An existing category already called one of the eight becomes that main category.
WITH main(name, ord) AS (VALUES ('Safety',1),('Medical',2),('Traffic',3),('Site',4),('Competition',5),('Security',6),('Comms',7),('SOP',8))
UPDATE eventplanner.ops_categories c SET is_main = true, main_category_id = NULL
FROM main WHERE lower(btrim(c.name)) = lower(main.name);

WITH main(name, ord) AS (VALUES ('Safety',1),('Medical',2),('Traffic',3),('Site',4),('Competition',5),('Security',6),('Comms',7),('SOP',8))
INSERT INTO eventplanner.ops_categories (name, sort_order, is_main)
SELECT main.name, main.ord - 100, true FROM main
WHERE NOT EXISTS (SELECT 1 FROM eventplanner.ops_categories c WHERE lower(btrim(c.name)) = lower(main.name));
