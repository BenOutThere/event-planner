
-- ============ MASTER TEMPLATE ============
CREATE TABLE public.template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','kv','links','files')),
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, key)
);

ALTER TABLE public.template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpl_sections_select ON public.template_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY tpl_sections_admin_write ON public.template_sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY tpl_fields_select ON public.template_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY tpl_fields_admin_write ON public.template_fields FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_tpl_sections_updated BEFORE UPDATE ON public.template_sections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============ PER-EVENT OVERRIDES + EXTRAS + VALUES ============
CREATE TABLE public.event_section_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  section_id uuid NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, section_id)
);

CREATE TABLE public.event_section_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.event_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  section_id uuid REFERENCES public.template_sections(id) ON DELETE CASCADE,
  extra_section_id uuid REFERENCES public.event_section_extras(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text,
  kind text NOT NULL CHECK (kind IN ('text','kv','links','files')),
  value_text text,
  value_kv jsonb,
  value_links jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (section_id IS NOT NULL OR extra_section_id IS NOT NULL)
);

CREATE INDEX idx_efv_event ON public.event_field_values(event_id);
CREATE INDEX idx_eso_event ON public.event_section_overrides(event_id);
CREATE INDEX idx_ese_event ON public.event_section_extras(event_id);

ALTER TABLE public.event_section_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_section_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY eso_select ON public.event_section_overrides FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(),'viewer'));
CREATE POLICY eso_write ON public.event_section_overrides FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

CREATE POLICY ese_select ON public.event_section_extras FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(),'viewer'));
CREATE POLICY ese_write ON public.event_section_extras FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

CREATE POLICY efv_select ON public.event_field_values FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(),'viewer'));
CREATE POLICY efv_write ON public.event_field_values FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

CREATE TRIGGER trg_efv_updated BEFORE UPDATE ON public.event_field_values
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============ PROFILE active flag ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============ SEED MASTER TEMPLATE FROM OTG ============
INSERT INTO public.template_sections (key, title, description, sort_order) VALUES
  ('overview','Overview','High-level event description, organising entity and venue',10),
  ('roles','Key Roles & Contacts','Event Manager, Coordinators, Marketing leads, customer service contacts',20),
  ('schedule','Schedule','Bump-in, event program and bump-out blocks',30),
  ('deliverables','Deliverables','What each party (operating entity, venue partner, commercial) must deliver',40),
  ('commercial','Commercial','Sponsorship, trade, F&B and power pricing',50),
  ('ticketing','Ticketing & Camping','Spectator and entrant tickets, T&Cs, camping notes',60),
  ('entrant_info','Entrant Info','Sanctioning, refills, staging lanes and other Q&A',70),
  ('operations','Operations & Safety','Emergency services, Event Control reps, transport, parking',80),
  ('media','Media & Accreditation','Media notes, accreditation, judging, awards',90),
  ('suppliers','Suppliers','Portable toilets, tow truck, medical, cleaning, waste, etc.',100),
  ('artwork','Artwork & Plans','Logo, site plan and floor plans',110),
  ('revisions','Revisions','Change log for this event summary',120);

-- Seed default fields per section
WITH s AS (SELECT id, key FROM public.template_sections)
INSERT INTO public.template_fields (section_id, key, label, kind, sort_order)
SELECT s.id, f.key, f.label, f.kind, f.sort_order
FROM s
JOIN (VALUES
  ('overview','summary','Marketing summary','text',10),
  ('overview','entity','Organising entity','text',20),
  ('overview','venue','Venue','text',30),
  ('overview','links','Key links','links',40),
  ('roles','customer_service','Customer service contacts','kv',10),
  ('roles','links','Related documents','links',20),
  ('schedule','notes','Schedule notes','text',10),
  ('deliverables','list','Deliverables','kv',10),
  ('commercial','sponsorship','Sponsorship','text',10),
  ('commercial','trade','Trade','text',20),
  ('commercial','fnb','Food & Beverage','text',30),
  ('commercial','power','Power outlet pricing','kv',40),
  ('ticketing','spectator','Spectator tickets','kv',10),
  ('ticketing','entrant','Entrant tickets','kv',20),
  ('ticketing','terms','Entrant T&Cs','links',30),
  ('ticketing','camping','Camping notes','text',40),
  ('entrant_info','qa','Entrant Q&A','kv',10),
  ('entrant_info','docs','Entrant documents','links',20),
  ('operations','emergency','Emergency services','kv',10),
  ('operations','event_control','Event Control reps','kv',20),
  ('operations','transport','Public transport & parking','text',30),
  ('media','media','Media notes','text',10),
  ('media','accreditation','Accreditation notes','text',20),
  ('media','judging','Judging / scoring','text',30),
  ('media','awards','Awards & prize money','text',40),
  ('suppliers','list','Suppliers','kv',10),
  ('artwork','files','Logos & plans','files',10),
  ('artwork','links','External plan links','links',20),
  ('revisions','log','Revision log','kv',10)
) AS f(section_key, key, label, kind, sort_order) ON f.section_key = s.key;
