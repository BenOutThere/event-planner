-- Sample people, events, areas and files for the permission tests (scratch database only).
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@x.au'),
 ('00000000-0000-0000-0000-0000000000a2','lead@x.au'),
 ('00000000-0000-0000-0000-0000000000a3','member@x.au'),
 ('00000000-0000-0000-0000-0000000000a4','viewer@x.au'),
 ('00000000-0000-0000-0000-0000000000a5','member.edit@x.au'),
 ('00000000-0000-0000-0000-0000000000a6','member.manage@x.au'),
 ('00000000-0000-0000-0000-0000000000a7','eventlead@x.au'),
 ('00000000-0000-0000-0000-0000000000a8','ext.view@x.au'),
 ('00000000-0000-0000-0000-0000000000a9','ext.edit@x.au'),
 ('00000000-0000-0000-0000-0000000000b1','norole@x.au'),
 ('00000000-0000-0000-0000-0000000000b2','notile@x.au'),
 ('00000000-0000-0000-0000-0000000000b3','cc.deactivated@x.au'),
 ('00000000-0000-0000-0000-0000000000b4','ep.inactive@x.au'),
 ('00000000-0000-0000-0000-0000000000b5','ccadmin@x.au'),
 ('00000000-0000-0000-0000-0000000000b6','otherapp@x.au');

-- Control Centre side (its "new user" trigger made the profiles; set roles exactly).
update public.profiles set status='deactivated' where id='00000000-0000-0000-0000-0000000000b3';
delete from public.user_roles;
insert into public.user_roles (user_id, role) select id, case when email in ('ccadmin@x.au') then 'admin'::public.app_role else 'member'::public.app_role end from auth.users;
insert into public.apps (id,name,tagline,description,category,status,icon_key,gradient) values
 ('events','Event Planner','t','d','Operations','Live','Globe','#000'),('assets','Asset Manager','t','d','Operations','Live','Boxes','#000') on conflict (id) do nothing;
insert into public.app_access (user_id, app_id) select id,'events' from auth.users where email not in ('notile@x.au','ccadmin@x.au','otherapp@x.au');
insert into public.app_access (user_id, app_id) select id,'assets' from auth.users where email='otherapp@x.au';

-- Event Planner side
insert into eventplanner.profiles (id,email,display_name,is_active) select id,email,split_part(email,'@',1), email<>'ep.inactive@x.au' from auth.users where email not in ('ccadmin@x.au','otherapp@x.au');
insert into eventplanner.user_roles (user_id, role) values
 ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a2','lead'),
 ('00000000-0000-0000-0000-0000000000a3','member'),('00000000-0000-0000-0000-0000000000a4','viewer'),
 ('00000000-0000-0000-0000-0000000000a5','member'),('00000000-0000-0000-0000-0000000000a6','member'),
 ('00000000-0000-0000-0000-0000000000a7','member'),('00000000-0000-0000-0000-0000000000a8','supplier'),
 ('00000000-0000-0000-0000-0000000000a9','supplier'),('00000000-0000-0000-0000-0000000000b2','member'),
 ('00000000-0000-0000-0000-0000000000b3','member'),('00000000-0000-0000-0000-0000000000b4','member');

-- Areas: open (O), staff only (S), managers only (M)
insert into eventplanner.template_sections (id,key,title,restricted_to) values
 ('10000000-0000-0000-0000-0000000000a0','open_area','Open area',null),
 ('10000000-0000-0000-0000-0000000000b0','staff_area','Staff-only area','staff'),
 ('10000000-0000-0000-0000-0000000000c0','manager_area','Managers-only area','managers');
insert into eventplanner.template_fields (section_id,key,label,kind) values
 ('10000000-0000-0000-0000-0000000000a0','f','Field','text'),('10000000-0000-0000-0000-0000000000b0','f','Field','text'),('10000000-0000-0000-0000-0000000000c0','f','Field','text');

insert into eventplanner.events (id,name,lead_user_id,created_by) values
 ('20000000-0000-0000-0000-00000000000a','Event A','00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a1'),
 ('20000000-0000-0000-0000-00000000000b','Event B',null,'00000000-0000-0000-0000-0000000000a1');
insert into eventplanner.event_members (event_id,user_id,access_level) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a5','edit'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a6','manage'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a8','view'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a9','edit');

insert into eventplanner.event_field_values (event_id,section_id,field_key,kind,value_text) values
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a0','f','text','open secretword'),
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000b0','f','text','staff secretword'),
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000c0','f','text','manager secretword'),
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000a0','f','text','event b secretword');

insert into storage.objects (bucket_id,name) values
 ('eventplanner-files','20000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000a0/open.pdf'),
 ('eventplanner-files','20000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000b0/staff.pdf'),
 ('eventplanner-files','20000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000c0/manager.pdf'),
 ('eventplanner-files','20000000-0000-0000-0000-00000000000b/10000000-0000-0000-0000-0000000000a0/b.pdf'),
 ('eventplanner-ops-plans','sop/company-sop.pdf'),
 ('eventplanner-ops-plans','events/20000000-0000-0000-0000-00000000000a/plan.pdf');
insert into eventplanner.document_text (event_id,path,file_name,status,content) values
 ('20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000a0/open.pdf','open.pdf','indexed','open file secretword'),
 ('20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000b0/staff.pdf','staff.pdf','indexed','staff file secretword'),
 ('20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000c0/manager.pdf','manager.pdf','indexed','manager file secretword');
insert into eventplanner.ops_categories (id,name) values ('30000000-0000-0000-0000-000000000001','Safety');
insert into eventplanner.ops_documents (title,storage_path,file_name,status,content,event_id) values
 ('Company SOP','sop/company-sop.pdf','company-sop.pdf','indexed','sop secretword',null),
 ('Event A plan','events/20000000-0000-0000-0000-00000000000a/plan.pdf','plan.pdf','indexed','plan secretword','20000000-0000-0000-0000-00000000000a');
