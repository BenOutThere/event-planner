"""Event Planner permission tests.

Runs every check as each kind of person against a scratch copy of OTG Shared
(Supabase stand-ins + Control Centre + Asset Manager + Event Planner, plus
supabase/tests/seed.sql) and compares the result with what the rules should allow.

Usage: python3 permissions_test.py <psql connection args...>
Prints a markdown report and exits 1 if anything differs from what's expected.
"""
import json, subprocess, sys

PSQL = sys.argv[1:] or ['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'shared']

P = {  # person -> user id suffix
    'Admin': 'a1', 'Lead': 'a2', 'Member': 'a3', 'Viewer': 'a4',
    'Member, edit on A': 'a5', 'Member, manage on A': 'a6', 'Event lead of A': 'a7',
    'External, view on A': 'a8', 'External, edit on A': 'a9',
    'Tile but no role': 'b1', 'Role but no tile': 'b2', 'Deactivated in CC': 'b3',
    'Deactivated in EP': 'b4', 'CC admin, no EP role': 'b5', 'Other app only': 'b6',
}
def uid(p): return '00000000-0000-0000-0000-0000000000' + P[p]
A = '20000000-0000-0000-0000-00000000000a'; B = '20000000-0000-0000-0000-00000000000b'
O = '10000000-0000-0000-0000-0000000000a0'; S = '10000000-0000-0000-0000-0000000000b0'; M = '10000000-0000-0000-0000-0000000000c0'

STAFF = {'Admin', 'Lead', 'Member', 'Viewer', 'Member, edit on A', 'Member, manage on A', 'Event lead of A'}
EXT = {'External, view on A', 'External, edit on A'}
READ_A = STAFF | EXT
READ_B = STAFF
MANAGE_A = {'Admin', 'Member, manage on A', 'Event lead of A'}
EDIT_A = MANAGE_A | {'Member, edit on A', 'External, edit on A'}
CREATORS = STAFF - {'Viewer'}
OPS_MANAGERS = {'Admin', 'Lead'}
MEMBERS = READ_A | {'Tile but no role', 'CC admin, no EP role'}  # may open Event Planner at all
NOBODY = set()
ALL = set(P)

def visible(p, area):
    if area == O: return p in READ_A
    if area == S: return p in STAFF or p in MANAGE_A
    return p in MANAGE_A

def n_values(p):  # field values containing "secretword" a person can find
    return sum(visible(p, a) for a in (O, S, M)) + (p in READ_B)
def n_docs(p): return sum(visible(p, a) for a in (O, S, M))

COMPLETED = f"update eventplanner.events set stage='completed' where id='{A}';"
ARCHIVED = COMPLETED + f" update eventplanner.events set stage='archived' where id='{A}';"

CHECKS = [
 # (group, label, sql, expected: set of people allowed, or function person -> expected count)
 ('Events', 'See Event A', f"select count(*) from eventplanner.events where id='{A}'", READ_A),
 ('Events', 'See Event B', f"select count(*) from eventplanner.events where id='{B}'", READ_B),
 ('Events', 'Create an event', "insert into eventplanner.events (name, created_by) values ('New', auth.uid()) returning 1", CREATORS),
 ('Events', 'Change Event A details', f"update eventplanner.events set name='x' where id='{A}' returning 1", MANAGE_A),
 ('Events', 'Change Event A\'s lead', f"update eventplanner.events set lead_user_id='{uid('Member')}' where id='{A}' returning 1", {'Admin'}),
 ('Events', 'Delete Event A', f"delete from eventplanner.events where id='{A}' returning 1", {'Admin'}),
 ('Events', 'Event directory for other apps (count)', "select count(*) from eventplanner.event_directory()",
   lambda p: 0 if p == 'Deactivated in CC' else 1 if p in EXT else 2),
 ('Areas', 'Read open area (A)', f"select count(*) from eventplanner.event_field_values where event_id='{A}' and section_id='{O}'", lambda p: int(visible(p, O))),
 ('Areas', 'Read staff-only area (A)', f"select count(*) from eventplanner.event_field_values where event_id='{A}' and section_id='{S}'", lambda p: int(visible(p, S))),
 ('Areas', 'Read managers-only area (A)', f"select count(*) from eventplanner.event_field_values where event_id='{A}' and section_id='{M}'", lambda p: int(visible(p, M))),
 ('Areas', 'Edit open area (A)', f"update eventplanner.event_field_values set value_text='x' where event_id='{A}' and section_id='{O}' returning 1", EDIT_A),
 ('Areas', 'Edit staff-only area (A)', f"update eventplanner.event_field_values set value_text='x' where event_id='{A}' and section_id='{S}' returning 1", EDIT_A & STAFF),
 ('Areas', 'Edit managers-only area (A)', f"update eventplanner.event_field_values set value_text='x' where event_id='{A}' and section_id='{M}' returning 1", MANAGE_A),
 ('Areas', 'Edit Event B', f"update eventplanner.event_field_values set value_text='x' where event_id='{B}' returning 1", {'Admin'}),
 ('Areas', 'Change who can see an area', f"insert into eventplanner.event_area_meta (event_id, area_id, restricted_to) values ('{A}','{O}','managers') returning 1", {'Admin'}),
 ('Areas', 'Mark open area reviewed (A)', f"insert into eventplanner.event_area_meta (event_id, area_id, reviewed_at, reviewed_by) values ('{A}','{O}', now(), auth.uid()) returning 1", EDIT_A),
 ('History', 'Change history visible on A (entries)', f"select count(*) from eventplanner.event_changes where event_id='{A}'", lambda p: sum(visible(p, a) for a in (O, S, M))),
 ('History', 'Write a history entry directly', f"insert into eventplanner.event_changes (event_id, change_kind, summary) values ('{A}','value','fake') returning 1", NOBODY),
 ('Search', 'Search field values ("secretword")', "select count(*) from eventplanner.search_event_values('secretword')", n_values),
 ('Search', 'Search inside files ("secretword")', "select count(*) from eventplanner.search_document_text('secretword')", n_docs),
 ('Files', 'Open file in open area (A)', f"select count(*) from storage.objects where bucket_id='eventplanner-files' and name like '{A}/{O}/%'", lambda p: int(visible(p, O))),
 ('Files', 'Open file in staff-only area (A)', f"select count(*) from storage.objects where bucket_id='eventplanner-files' and name like '{A}/{S}/%'", lambda p: int(visible(p, S))),
 ('Files', 'Open file in managers-only area (A)', f"select count(*) from storage.objects where bucket_id='eventplanner-files' and name like '{A}/{M}/%'", lambda p: int(visible(p, M))),
 ('Files', 'Open file in Event B', f"select count(*) from storage.objects where bucket_id='eventplanner-files' and name like '{B}/%'", lambda p: int(p in READ_B)),
 ('Files', 'Upload to open area (A)', f"insert into storage.objects (bucket_id,name) values ('eventplanner-files','{A}/{O}/new.pdf') returning 1", EDIT_A),
 ('Files', 'Upload to managers-only area (A)', f"insert into storage.objects (bucket_id,name) values ('eventplanner-files','{A}/{M}/new.pdf') returning 1", MANAGE_A),
 ('Files', 'Upload to Event B', f"insert into storage.objects (bucket_id,name) values ('eventplanner-files','{B}/{O}/new.pdf') returning 1", {'Admin'}),
 ('Ops plans', 'Read company SOPs', "select count(*) from eventplanner.ops_documents where event_id is null", lambda p: int(p in STAFF)),
 ('Ops plans', "Read Event A's plan", f"select count(*) from eventplanner.ops_documents where event_id='{A}'", lambda p: int(p in READ_A)),
 ('Ops plans', 'Search plans ("secretword")', "select count(*) from eventplanner.search_ops_documents('secretword', null, true)", lambda p: int(p in STAFF) + int(p in READ_A)),
 ('Ops plans', 'Open company SOP file', "select count(*) from storage.objects where bucket_id='eventplanner-ops-plans' and name like 'sop/%'", lambda p: int(p in STAFF)),
 ('Ops plans', 'Upload a company SOP', "insert into storage.objects (bucket_id,name) values ('eventplanner-ops-plans','sop/new.pdf') returning 1", OPS_MANAGERS),
 ('Ops plans', "Upload Event A's plan", f"insert into storage.objects (bucket_id,name) values ('eventplanner-ops-plans','events/{A}/new.pdf') returning 1", OPS_MANAGERS | MANAGE_A),
 ('Ops plans', 'Read categories', "select count(*) from eventplanner.ops_categories", lambda p: int(p in STAFF)),
 ('Ops plans', 'Add a category', "insert into eventplanner.ops_categories (name) values ('Medical') returning 1", OPS_MANAGERS),
 ('Template', 'Read the template', "select count(*) from eventplanner.template_sections", lambda p: 3 if p in MEMBERS else 0),
 ('Template', 'Change the template', f"update eventplanner.template_sections set title='x' where id='{O}' returning 1", {'Admin'}),
 ('People', 'See names (profiles)', "select count(*) > 0 from eventplanner.profiles", lambda p: 't' if p in MEMBERS else 'f'),
 ('People', 'Give someone the Admin role', f"insert into eventplanner.user_roles (user_id, role) values ('{uid('Tile but no role')}','admin') returning 1", {'Admin'}),
 ('People', 'Assign someone to Event A', f"insert into eventplanner.event_members (event_id, user_id, access_level) values ('{A}','{uid('Tile but no role')}','view') returning 1", MANAGE_A),
 ('People', 'Reactivate / deactivate yourself', "update eventplanner.profiles set is_active = true where id = auth.uid() returning 1", NOBODY),
 ('People', 'Open Event Planner (ensure_member)', "select eventplanner.ensure_member()", lambda p: 't' if p in MEMBERS else 'f'),
 # R5: lifecycle status and archiving (Event A archived by the setup step)
 ('Archive', 'Archive Event A while Draft', f"update eventplanner.events set stage='archived' where id='{A}' returning 1", NOBODY),
 ('Archive', 'Archive Event A once Completed', f"update eventplanner.events set stage='archived' where id='{A}' returning 1", MANAGE_A, COMPLETED),
 ('Archive', 'See archived Event A', f"select count(*) from eventplanner.events where id='{A}'", READ_A, ARCHIVED),
 ('Archive', 'Restore archived Event A', f"update eventplanner.events set stage='completed' where id='{A}' returning 1", MANAGE_A, ARCHIVED),
 ('Archive', 'Rename archived Event A', f"update eventplanner.events set name='x' where id='{A}' returning 1", NOBODY, ARCHIVED),
 ('Archive', 'Read archived A (open area)', f"select count(*) from eventplanner.event_field_values where event_id='{A}' and section_id='{O}'", lambda p: int(visible(p, O)), ARCHIVED),
 ('Archive', 'Edit archived A (open area)', f"update eventplanner.event_field_values set value_text='x' where event_id='{A}' and section_id='{O}' returning 1", NOBODY, ARCHIVED),
 ('Archive', 'Upload file to archived A', f"insert into storage.objects (bucket_id,name) values ('eventplanner-files','{A}/{O}/new.pdf') returning 1", NOBODY, ARCHIVED),
 ('Archive', 'Assign someone to archived A', f"insert into eventplanner.event_members (event_id, user_id, access_level) values ('{A}','{uid('Tile but no role')}','view') returning 1", NOBODY, ARCHIVED),
 ('Archive', 'Mark archived A reviewed', f"insert into eventplanner.event_area_meta (event_id, area_id, reviewed_at, reviewed_by) values ('{A}','{O}', now(), auth.uid()) returning 1", NOBODY, ARCHIVED),
 ('Archive', "Upload archived A's plan", f"insert into storage.objects (bucket_id,name) values ('eventplanner-ops-plans','events/{A}/new.pdf') returning 1", NOBODY, ARCHIVED),
 ('Archive', 'All-events search skips archived A', "select count(*) from eventplanner.search_event_values('secretword')", lambda p: int(p in READ_B), ARCHIVED),
 ('Archive', 'Search inside archived A still works', f"select count(*) from eventplanner.search_event_values('secretword', '{A}')", lambda p: sum(visible(p, a) for a in (O, S, M)), ARCHIVED),
 ('Archive', 'All-events plan search skips archived A', "select count(*) from eventplanner.search_ops_documents('secretword', null, true)", lambda p: int(p in STAFF), ARCHIVED),
]

def run(person, sql, setup=''):
    claims = json.dumps({'sub': uid(person), 'role': 'authenticated'})
    script = f"begin; {setup} set local role authenticated; set local request.jwt.claims = '{claims}'; {sql}; rollback;"
    p = subprocess.run(PSQL + ['-X', '-q', '-tA'], input=script, capture_output=True, text=True)
    if p.returncode or 'ERROR' in p.stderr:
        return 'blocked'
    out = [l for l in p.stdout.split('\n') if l.strip()]
    if sql.lstrip().startswith('select'):
        return out[0] if out else '?'
    return 'allowed' if out else 'blocked'

def expected(exp, person, sql):
    if callable(exp): return str(exp(person))
    if sql.lstrip().startswith('select'): return '1' if person in exp else '0'
    return 'allowed' if person in exp else 'blocked'

people = list(P)
fails = 0; total = 0
print('| Group | Check | ' + ' | '.join(people) + ' |')
print('|---|---|' + '---|' * len(people))
for group, label, sql, exp, *setup in CHECKS:
    cells = []
    for person in people:
        got, want = run(person, sql, *setup), expected(exp, person, sql)
        total += 1
        short = {'allowed': '✅', 'blocked': '⛔', 't': '✅', 'f': '⛔'}.get(got, got)
        if got != want:
            fails += 1
            cells.append(f'**{short} (expected {want})**')
        else:
            cells.append(short)
    print(f'| {group} | {label} | ' + ' | '.join(cells) + ' |')
print(f'\n{total - fails} of {total} checks match the rules.' + (f' {fails} DIFFER.' if fails else ''))
sys.exit(1 if fails else 0)
