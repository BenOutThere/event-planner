// Server-side Supabase client with service role key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Set them in Vercel (see SETUP.md).`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database, "eventplanner">(SUPABASE_URL.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, ""), SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "eventplanner" },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    }
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
// Import like: import { supabaseAdmin } from "@/integrations/supabase/client.server";
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});

/**
 * Service-role client for the Control Centre's own tables (public schema:
 * profiles, user_roles, app_access). Server only.
 */
export function controlCentreAdmin() {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in Vercel (see SETUP.md).");
  return createClient(url, key, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
}

/**
 * Service-role client used only by the one-off move import. The
 * x-eventplanner-import header switches the database automations off for its
 * requests (see eventplanner.importing()), so history, versions, dates and
 * "last updated by" are loaded exactly as they were.
 */
export function moveImportAdmin() {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in Vercel (see SETUP.md).");
  return createClient(url, key, {
    db: { schema: "eventplanner" },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-eventplanner-import": "1" } },
  });
}
