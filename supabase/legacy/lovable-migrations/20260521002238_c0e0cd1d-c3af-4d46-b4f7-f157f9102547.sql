
CREATE OR REPLACE FUNCTION public.can_view_event(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (e.lead_user_id = _user_id OR e.created_by = _user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = _event_id AND em.user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS events_select_member_or_privileged ON public.events;
CREATE POLICY events_select_member_or_privileged ON public.events
FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR lead_user_id = auth.uid()
  OR created_by = auth.uid()
  OR public.can_view_event(id, auth.uid())
);

DROP POLICY IF EXISTS event_members_select ON public.event_members;
CREATE POLICY event_members_select ON public.event_members
FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.can_view_event(event_id, auth.uid())
);

DROP POLICY IF EXISTS event_members_write ON public.event_members;
CREATE POLICY event_members_write ON public.event_members
FOR ALL TO authenticated
USING (is_admin(auth.uid()) OR public.can_view_event(event_id, auth.uid()))
WITH CHECK (is_admin(auth.uid()) OR public.can_view_event(event_id, auth.uid()));
