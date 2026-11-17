import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { AccessLevel } from "@/lib/access";

export type MyAccess = { access: AccessLevel; isStaff: boolean };

/** Effective access to every event the signed-in person can see, computed by the database. */
export function useMyEventAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-event-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_event_access");
      if (error) throw error;
      const map = new Map<string, MyAccess>();
      for (const r of data ?? []) map.set(r.event_id, { access: r.access as AccessLevel, isStaff: !!r.is_staff });
      return map;
    },
  });
}

export type AreaPermission = { restricted_to: string | null; can_read: boolean };

/** Which areas of an event the signed-in person can read, and how each is restricted. */
export function useAreaPermissions(eventId: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["area-permissions", eventId, user?.id],
    enabled: enabled && !!user && eventId !== "preview",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_area_permissions", { _event_id: eventId });
      if (error) throw error;
      const map = new Map<string, AreaPermission>();
      for (const r of data ?? []) map.set(r.area_id, { restricted_to: r.restricted_to, can_read: !!r.can_read });
      return map;
    },
  });
}

export function useAllAreaPermissions(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["all-area-permissions", user?.id],
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_area_permissions");
      if (error) throw error;
      const map = new Map<string, boolean>();
      for (const r of data ?? []) map.set(`${r.event_id}:${r.area_id}`, !!r.can_read);
      return map;
    },
  });
}
