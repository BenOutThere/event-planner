
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'lead', 'member', 'supplier', 'viewer');
CREATE TYPE public.event_stage AS ENUM ('draft', 'in_planning', 'confirmed', 'delivery_ready', 'completed');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.supplier_status AS ENUM ('prospect', 'contacted', 'quoted', 'booked', 'confirmed', 'cancelled');
CREATE TYPE public.risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'done', 'missed');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- CATEGORIES
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#FF6B4A',
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

-- TEMPLATES
CREATE TABLE public.event_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.event_categories(id) ON DELETE SET NULL,
  default_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;

-- EVENTS
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.event_categories(id) ON DELETE SET NULL,
  purpose TEXT,
  proposed_date DATE,
  end_date DATE,
  location TEXT,
  expected_attendance INTEGER,
  stage public.event_stage NOT NULL DEFAULT 'draft',
  progress_pct INTEGER NOT NULL DEFAULT 0,
  lead_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.event_templates(id) ON DELETE SET NULL,
  budget_estimate NUMERIC(12,2),
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_events_stage ON public.events(stage);
CREATE INDEX idx_events_lead ON public.events(lead_user_id);

-- EVENT MEMBERS
CREATE TABLE public.event_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_on_event TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;

-- is_event_member helper
CREATE OR REPLACE FUNCTION public.is_event_member(_event_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_members WHERE event_id = _event_id AND user_id = _user_id
    UNION
    SELECT 1 FROM public.events WHERE id = _event_id AND (lead_user_id = _user_id OR created_by = _user_id)
  )
$$;

-- TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date DATE,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'todo',
  section_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_event ON public.tasks(event_id);

-- SUPPLIERS
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status public.supplier_status NOT NULL DEFAULT 'prospect',
  cost_estimate NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_suppliers_event ON public.suppliers(event_id);

-- BUDGET ITEMS
CREATE TABLE public.budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT,
  estimated NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_budget_event ON public.budget_items(event_id);

-- MILESTONES
CREATE TABLE public.timeline_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  milestone_type TEXT,
  date DATE,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.timeline_milestones ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_milestones_event ON public.timeline_milestones(event_id);

-- RISKS
CREATE TABLE public.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  likelihood public.risk_level NOT NULL DEFAULT 'medium',
  impact public.risk_level NOT NULL DEFAULT 'medium',
  mitigation TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_risks_event ON public.risks(event_id);

-- NOTES
CREATE TABLE public.event_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  section_key TEXT,
  body TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_notes ENABLE ROW LEVEL SECURITY;

-- FILES
CREATE TABLE public.event_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  section_key TEXT,
  label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_files ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- categories: all auth can view, admin manage
CREATE POLICY "categories_select" ON public.event_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_admin_write" ON public.event_categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- templates: all auth view, admin manage
CREATE POLICY "templates_select" ON public.event_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_admin_write" ON public.event_templates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- events
CREATE POLICY "events_select_member_or_privileged" ON public.events FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'viewer')
    OR lead_user_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.event_members em WHERE em.event_id = events.id AND em.user_id = auth.uid())
  );
CREATE POLICY "events_insert_authenticated" ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'lead') OR public.has_role(auth.uid(), 'member')
  );
CREATE POLICY "events_update_lead_or_admin" ON public.events FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR lead_user_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR lead_user_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "events_delete_admin" ON public.events FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- event_members
CREATE POLICY "event_members_select" ON public.event_members FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));
CREATE POLICY "event_members_write" ON public.event_members FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.lead_user_id = auth.uid() OR e.created_by = auth.uid()))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.lead_user_id = auth.uid() OR e.created_by = auth.uid()))
  );

-- Generic helper macro pattern for child tables: member can read, lead/admin can write
-- tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "tasks_write" ON public.tasks FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- suppliers
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "suppliers_write" ON public.suppliers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- budget
CREATE POLICY "budget_select" ON public.budget_items FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "budget_write" ON public.budget_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- milestones
CREATE POLICY "milestones_select" ON public.timeline_milestones FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "milestones_write" ON public.timeline_milestones FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- risks
CREATE POLICY "risks_select" ON public.risks FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "risks_write" ON public.risks FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- notes
CREATE POLICY "notes_select" ON public.event_notes FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "notes_write" ON public.event_notes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- files
CREATE POLICY "files_select" ON public.event_files FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()) OR public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "files_write" ON public.event_files FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_event_member(event_id, auth.uid()));

-- ============ TRIGGERS ============

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- new user trigger: create profile + default member role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('event-files', 'event-files', false);

CREATE POLICY "event_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-files');
CREATE POLICY "event_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-files');
CREATE POLICY "event_files_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-files');
CREATE POLICY "event_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-files');

-- Seed categories
INSERT INTO public.event_categories (name, color, icon) VALUES
  ('Festival', '#FF6B4A', 'PartyPopper'),
  ('Public Event', '#4A90E2', 'Users'),
  ('Community Activation', '#7B61FF', 'Sparkles'),
  ('Sports Event', '#22C55E', 'Trophy');
