import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { goToControlCentre } from "@/lib/control-centre";

export type AppRole = "admin" | "lead" | "member" | "supplier" | "viewer";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  /** Signed in, but not allowed into Event Planner (no tile, or deactivated). */
  noAccess: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  roles: [],
  isAdmin: false,
  noAccess: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [noAccess, setNoAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loadedFor: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        if (loadedFor !== s.user.id) {
          loadedFor = s.user.id;
          setTimeout(() => loadAccess(s.user.id), 0);
        }
      } else {
        loadedFor = null;
        setRoles([]);
        setNoAccess(false);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadedFor = s.user.id;
        loadAccess(s.user.id).finally(() => setLoading(false));
      } else setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadAccess(uid: string) {
    // Creates or refreshes this person's Event Planner profile from their Control
    // Centre account, and says whether they may open Event Planner at all.
    const { data: allowed, error } = await supabase.rpc("ensure_member");
    if (error || allowed !== true) {
      setNoAccess(true);
      setRoles([]);
      return;
    }
    setNoAccess(false);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        roles,
        isAdmin: roles.includes("admin"),
        noAccess,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
          goToControlCentre();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
