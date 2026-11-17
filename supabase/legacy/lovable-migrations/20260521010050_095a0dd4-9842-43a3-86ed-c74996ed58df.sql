revoke execute on function app_private.has_role(uuid, public.app_role) from public, anon;
revoke execute on function app_private.is_admin(uuid) from public, anon;
revoke execute on function app_private.can_view_event(uuid, uuid) from public, anon;
revoke execute on function app_private.is_event_member(uuid, uuid) from public, anon;
grant execute on function app_private.has_role(uuid, public.app_role) to authenticated;
grant execute on function app_private.is_admin(uuid) to authenticated;
grant execute on function app_private.can_view_event(uuid, uuid) to authenticated;
grant execute on function app_private.is_event_member(uuid, uuid) to authenticated;