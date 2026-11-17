
-- Extend events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS organising_entity text,
  ADD COLUMN IF NOT EXISTS venue text,
  ADD COLUMN IF NOT EXISTS event_dates_text text,
  ADD COLUMN IF NOT EXISTS bump_in_start timestamptz,
  ADD COLUMN IF NOT EXISTS bump_out_end timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_summary text,
  ADD COLUMN IF NOT EXISTS entrant_terms_url text,
  ADD COLUMN IF NOT EXISTS camping_available boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS camping_notes text,
  ADD COLUMN IF NOT EXISTS public_transport_notes text,
  ADD COLUMN IF NOT EXISTS onsite_parking_notes text,
  ADD COLUMN IF NOT EXISTS media_notes text,
  ADD COLUMN IF NOT EXISTS accreditation_notes text,
  ADD COLUMN IF NOT EXISTS judging_notes text,
  ADD COLUMN IF NOT EXISTS awards_notes text,
  ADD COLUMN IF NOT EXISTS floor_plan_url text,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Generic builder for an event-scoped child table
-- (inlined per table for clarity)

-- Roles
CREATE TABLE IF NOT EXISTS public.event_roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  role text not null,
  email text,
  is_media_spokesperson boolean not null default false,
  is_event_control boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_roles_select" ON public.event_roles FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_roles_write" ON public.event_roles FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Contacts
CREATE TABLE IF NOT EXISTS public.event_contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null default 'customer_service', -- customer_service | venue_partner | sanctioning
  contact_type text,
  name text,
  email text,
  lead_or_support text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_contacts_select" ON public.event_contacts FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_contacts_write" ON public.event_contacts FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Schedule blocks (bump-in / event / bump-out)
CREATE TABLE IF NOT EXISTS public.event_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null default 'event', -- bump_in | event | bump_out
  date date,
  location text,
  start_time time,
  finish_time time,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_schedule_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_schedule_blocks_select" ON public.event_schedule_blocks FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_schedule_blocks_write" ON public.event_schedule_blocks FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Deliverables
CREATE TABLE IF NOT EXISTS public.event_deliverables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  owner text not null default 'operating_entity', -- operating_entity | venue_partner | commercial
  description text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_deliverables_select" ON public.event_deliverables FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_deliverables_write" ON public.event_deliverables FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Power pricing
CREATE TABLE IF NOT EXISTS public.event_power_pricing (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  outlet_type text not null,
  cost text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_power_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_power_pricing_select" ON public.event_power_pricing FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_power_pricing_write" ON public.event_power_pricing FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Tickets
CREATE TABLE IF NOT EXISTS public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  audience text not null default 'spectator', -- spectator | entrant
  name text not null,
  price text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_tickets_select" ON public.event_tickets FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_tickets_write" ON public.event_tickets FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Entrant info Q&A
CREATE TABLE IF NOT EXISTS public.event_entrant_info (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  question text not null,
  answer text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_entrant_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_entrant_info_select" ON public.event_entrant_info FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_entrant_info_write" ON public.event_entrant_info FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Emergency services
CREATE TABLE IF NOT EXISTS public.event_emergency_services (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  service text not null,
  on_site boolean not null default false,
  contact text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_emergency_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_emergency_services_select" ON public.event_emergency_services FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_emergency_services_write" ON public.event_emergency_services FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Revisions log
CREATE TABLE IF NOT EXISTS public.event_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  note text not null,
  author_id uuid,
  author_name text,
  revised_on date not null default current_date,
  created_at timestamptz not null default now()
);
ALTER TABLE public.event_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_revisions_select" ON public.event_revisions FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));
CREATE POLICY "event_revisions_write" ON public.event_revisions FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_event_member(event_id, auth.uid()));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_event_roles_event ON public.event_roles(event_id);
CREATE INDEX IF NOT EXISTS idx_event_contacts_event ON public.event_contacts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_schedule_event ON public.event_schedule_blocks(event_id);
CREATE INDEX IF NOT EXISTS idx_event_deliverables_event ON public.event_deliverables(event_id);
CREATE INDEX IF NOT EXISTS idx_event_power_pricing_event ON public.event_power_pricing(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tickets_event ON public.event_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_entrant_info_event ON public.event_entrant_info(event_id);
CREATE INDEX IF NOT EXISTS idx_event_emergency_services_event ON public.event_emergency_services(event_id);
CREATE INDEX IF NOT EXISTS idx_event_revisions_event ON public.event_revisions(event_id);
