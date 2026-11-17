// Browser Supabase client for Event Planner.
//
// Event Planner shares its login with the OTG Control Centre:
// - The session is stored in a cookie on `.outthereadmin.com.au`, so signing
//   in to the Control Centre signs you in here too (see ./cookie-storage).
// - When opened from a Control Centre tile, the session can also arrive in the
//   URL as `#sso=<access>.~.<refresh>`; src/routes/index.tsx picks that up.
// - All Event Planner tables live in the `eventplanner` schema of the shared
//   OTG project, so this client reads and writes there by default.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { cookieStorage } from "./cookie-storage";

export const EP_SCHEMA = "eventplanner" as const;

function supabaseUrl() {
  // Tolerate a pasted address that ends in "/" or "/rest/v1" (Supabase shows both).
  return String(import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth)\/v1$/, "");
}

function createSupabaseClient() {
  const SUPABASE_URL = supabaseUrl();
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const message = "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Set them in Vercel (see SETUP.md).";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database, typeof EP_SCHEMA>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    db: { schema: EP_SCHEMA },
    auth: {
      // On the server (no document) there are no cookies to read; stay in memory.
      storage: typeof document !== "undefined" ? cookieStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
