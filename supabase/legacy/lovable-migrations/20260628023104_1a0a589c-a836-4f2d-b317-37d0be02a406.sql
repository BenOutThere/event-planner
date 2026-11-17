DROP POLICY IF EXISTS events_select_member_or_privileged ON public.events;

CREATE POLICY events_select_member_or_privileged
ON public.events
FOR SELECT
TO authenticated
USING (
  app_private.is_admin(auth.uid())
  OR app_private.has_role(auth.uid(), 'member'::app_role)
  OR app_private.has_role(auth.uid(), 'lead'::app_role)
  OR app_private.has_role(auth.uid(), 'viewer'::app_role)
  OR lead_user_id = auth.uid()
  OR created_by = auth.uid()
  OR app_private.can_view_event(id, auth.uid())
);