export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || `item_${Date.now()}`;
}

export function nextAvailableKey(baseKey: string, existingKeys: string[]) {
  const taken = new Set(existingKeys);
  if (!taken.has(baseKey)) return baseKey;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${baseKey}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseKey}_${Date.now()}`;
}

export async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Event Planner admins only (and only while they still have Event Planner access). */
export async function assertAdmin(userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Only Event Planner admins can do this.");
}
export const EVENT_PLANNER_APP_ID = "events";

/** Looks up an OTG login by email (case-insensitive). */
export async function findUserByEmail(email: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const target = email.trim().toLowerCase();
  for (let page = 1; page < 100; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Ticks the Event Planner tile for this person in the Control Centre. */
export async function grantEventPlannerTile(userId: string, grantedBy: string | null) {
  const { controlCentreAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await controlCentreAdmin()
    .from("app_access")
    .upsert({ user_id: userId, app_id: EVENT_PLANNER_APP_ID, granted_by: grantedBy }, { onConflict: "user_id,app_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Unticks the Event Planner tile (their OTG login and other apps are untouched). */
export async function revokeEventPlannerTile(userId: string) {
  const { controlCentreAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await controlCentreAdmin().from("app_access").delete().eq("user_id", userId).eq("app_id", EVENT_PLANNER_APP_ID);
  if (error) throw new Error(error.message);
}
