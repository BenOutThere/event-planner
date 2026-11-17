create schema if not exists app_private;

grant usage on schema app_private to authenticated;

create or replace function app_private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

create or replace function app_private.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = 'admin'::public.app_role
  )
$$;

create or replace function app_private.can_view_event(_event_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = _event_id
      and (e.lead_user_id = _user_id or e.created_by = _user_id)
  ) or exists (
    select 1
    from public.event_members em
    where em.event_id = _event_id
      and em.user_id = _user_id
  )
$$;

create or replace function app_private.is_event_member(_event_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = _event_id
      and em.user_id = _user_id
  ) or exists (
    select 1
    from public.events e
    where e.id = _event_id
      and (e.lead_user_id = _user_id or e.created_by = _user_id)
  )
$$;

grant execute on function app_private.has_role(uuid, public.app_role) to authenticated;
grant execute on function app_private.is_admin(uuid) to authenticated;
grant execute on function app_private.can_view_event(uuid, uuid) to authenticated;
grant execute on function app_private.is_event_member(uuid, uuid) to authenticated;

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        qual ~ '(public\.)?(is_admin|has_role|can_view_event|is_event_member)\('
        or with_check ~ '(public\.)?(is_admin|has_role|can_view_event|is_event_member)\('
      )
  loop
    new_qual := pol.qual;
    new_check := pol.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'public.is_admin(', 'app_private.is_admin(');
      new_qual := replace(new_qual, 'public.has_role(', 'app_private.has_role(');
      new_qual := replace(new_qual, 'public.can_view_event(', 'app_private.can_view_event(');
      new_qual := replace(new_qual, 'public.is_event_member(', 'app_private.is_event_member(');
      new_qual := regexp_replace(new_qual, '(^|[^\.[:alnum:]_])is_admin\(', '\1app_private.is_admin(', 'g');
      new_qual := regexp_replace(new_qual, '(^|[^\.[:alnum:]_])has_role\(', '\1app_private.has_role(', 'g');
      new_qual := regexp_replace(new_qual, '(^|[^\.[:alnum:]_])can_view_event\(', '\1app_private.can_view_event(', 'g');
      new_qual := regexp_replace(new_qual, '(^|[^\.[:alnum:]_])is_event_member\(', '\1app_private.is_event_member(', 'g');
    end if;

    if new_check is not null then
      new_check := replace(new_check, 'public.is_admin(', 'app_private.is_admin(');
      new_check := replace(new_check, 'public.has_role(', 'app_private.has_role(');
      new_check := replace(new_check, 'public.can_view_event(', 'app_private.can_view_event(');
      new_check := replace(new_check, 'public.is_event_member(', 'app_private.is_event_member(');
      new_check := regexp_replace(new_check, '(^|[^\.[:alnum:]_])is_admin\(', '\1app_private.is_admin(', 'g');
      new_check := regexp_replace(new_check, '(^|[^\.[:alnum:]_])has_role\(', '\1app_private.has_role(', 'g');
      new_check := regexp_replace(new_check, '(^|[^\.[:alnum:]_])can_view_event\(', '\1app_private.can_view_event(', 'g');
      new_check := regexp_replace(new_check, '(^|[^\.[:alnum:]_])is_event_member\(', '\1app_private.is_event_member(', 'g');
    end if;

    stmt := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    execute stmt;
  end loop;
end $$;

revoke execute on function public.is_admin(uuid) from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.is_event_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_view_event(uuid, uuid) from public, anon, authenticated;