ALTER POLICY budget_select ON public.budget_items
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_contacts_select ON public.event_contacts
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_deliverables_select ON public.event_deliverables
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_emergency_services_select ON public.event_emergency_services
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_entrant_info_select ON public.event_entrant_info
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY efv_select ON public.event_field_values
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY files_select ON public.event_files
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY notes_select ON public.event_notes
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_power_pricing_select ON public.event_power_pricing
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_revisions_select ON public.event_revisions
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_roles_select ON public.event_roles
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_schedule_blocks_select ON public.event_schedule_blocks
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY ese_select ON public.event_section_extras
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY eso_select ON public.event_section_overrides
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_tickets_select ON public.event_tickets
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY risks_select ON public.risks
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY suppliers_select ON public.suppliers
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY tasks_select ON public.tasks
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY milestones_select ON public.timeline_milestones
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR app_private.is_event_member(event_id, auth.uid()));

ALTER POLICY event_members_select ON public.event_members
USING (app_private.is_admin(auth.uid()) OR app_private.has_role(auth.uid(), 'member'::app_role) OR app_private.has_role(auth.uid(), 'lead'::app_role) OR app_private.has_role(auth.uid(), 'viewer'::app_role) OR user_id = auth.uid() OR app_private.can_view_event(event_id, auth.uid()));