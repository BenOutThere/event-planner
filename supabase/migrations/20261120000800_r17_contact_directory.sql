-- R17: a shared directory of contacts and suppliers, so the same person or
-- company is typed once and picked in every event's contact tables.
--
-- Staff (Admin, Lead, Member, Viewer) can read it. Admins, Leads and Members
-- can add and change entries. External stakeholders can't see it at all; they
-- only see the contact details copied into the events they can open.
-- Entries are archived rather than deleted (admins can delete).

CREATE TABLE IF NOT EXISTS eventplanner.directory_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    kind text NOT NULL DEFAULT 'person' CHECK (kind IN ('person', 'supplier')),
    name text NOT NULL CHECK (btrim(name) <> ''),
    organisation text,
    role_title text,
    phone text,
    email text,
    website text,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS directory_contacts_name_idx ON eventplanner.directory_contacts (lower(name));

CREATE OR REPLACE FUNCTION eventplanner_private.can_edit_directory(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'eventplanner'
    AS $$
  SELECT EXISTS (SELECT 1 FROM eventplanner.user_roles WHERE user_id = _uid AND role IN ('admin','lead','member'))
     AND eventplanner_private.is_member(_uid)
$$;

CREATE OR REPLACE FUNCTION eventplanner.touch_directory_contact() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'eventplanner'
    AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_contacts_touch ON eventplanner.directory_contacts;
CREATE TRIGGER trg_directory_contacts_touch BEFORE INSERT OR UPDATE ON eventplanner.directory_contacts
  FOR EACH ROW EXECUTE FUNCTION eventplanner.touch_directory_contact();

ALTER TABLE eventplanner.directory_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS directory_contacts_read ON eventplanner.directory_contacts;
CREATE POLICY directory_contacts_read ON eventplanner.directory_contacts FOR SELECT TO authenticated
  USING (eventplanner_private.is_staff(auth.uid()));
DROP POLICY IF EXISTS directory_contacts_insert ON eventplanner.directory_contacts;
CREATE POLICY directory_contacts_insert ON eventplanner.directory_contacts FOR INSERT TO authenticated
  WITH CHECK (eventplanner_private.can_edit_directory(auth.uid()));
DROP POLICY IF EXISTS directory_contacts_update ON eventplanner.directory_contacts;
CREATE POLICY directory_contacts_update ON eventplanner.directory_contacts FOR UPDATE TO authenticated
  USING (eventplanner_private.can_edit_directory(auth.uid()))
  WITH CHECK (eventplanner_private.can_edit_directory(auth.uid()));
DROP POLICY IF EXISTS directory_contacts_delete ON eventplanner.directory_contacts;
CREATE POLICY directory_contacts_delete ON eventplanner.directory_contacts FOR DELETE TO authenticated
  USING (eventplanner_private.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON eventplanner.directory_contacts TO authenticated;
GRANT ALL ON eventplanner.directory_contacts TO service_role;
REVOKE EXECUTE ON FUNCTION eventplanner_private.can_edit_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eventplanner_private.can_edit_directory(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION eventplanner.touch_directory_contact() FROM PUBLIC, anon;
