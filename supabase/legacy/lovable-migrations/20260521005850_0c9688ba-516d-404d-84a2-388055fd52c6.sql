revoke execute on function public.can_view_event(uuid, uuid) from anon;
revoke execute on function public.can_view_event(uuid, uuid) from public;
revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.has_role(uuid, public.app_role) from public;
revoke execute on function public.is_event_member(uuid, uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_event_member(uuid, uuid) to authenticated;
grant execute on function public.can_view_event(uuid, uuid) to authenticated;