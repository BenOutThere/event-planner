import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DirectoryContact } from "@/lib/directory";

type Ctx = {
  contacts: DirectoryContact[];
  canEdit: boolean;
  save: (c: Omit<DirectoryContact, "id" | "archived_at">) => Promise<boolean>;
};

const DirectoryCtx = createContext<Ctx>({ contacts: [], canEdit: false, save: async () => false });
export const DirectoryProvider = DirectoryCtx.Provider;
export function useDirectory() {
  return useContext(DirectoryCtx);
}

/** The shared contacts directory (staff only; the database returns nothing to anyone else). */
export function useDirectoryQuery(enabled = true) {
  const { user, isAdmin, roles } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["directory-contacts"],
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("directory_contacts").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as DirectoryContact[];
    },
  });
  const canEdit = isAdmin || roles.includes("lead") || roles.includes("member");
  const save: Ctx["save"] = async (c) => {
    const { error } = await supabase.from("directory_contacts").insert(c as any);
    if (error) return false;
    qc.invalidateQueries({ queryKey: ["directory-contacts"] });
    return true;
  };
  return { query: q, value: { contacts: (q.data ?? []).filter((c) => !c.archived_at), canEdit, save } satisfies Ctx };
}
