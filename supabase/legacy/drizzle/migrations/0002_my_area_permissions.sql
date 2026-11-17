CREATE OR REPLACE FUNCTION public.my_area_permissions()
RETURNS TABLE (event_id uuid, area_id uuid, restricted_to text, can_read boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, s.id, app_private.area_restriction(e.id, s.id), app_private.can_read_area(e.id, s.id, auth.uid())
  FROM public.events e CROSS JOIN public.template_sections s
  WHERE s.parent_id IS NULL AND app_private.can_read_event(e.id, auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_area_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_area_permissions() TO authenticated;
