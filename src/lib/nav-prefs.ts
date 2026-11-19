// R14: small per-device memory for the event side menu. Stored in the
// browser only; if storage isn't available everything still works.

const COLLAPSED = "ep.nav.collapsed.v1";
const LAST_AREA = "ep.nav.lastArea.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ }
}

/** Menu groups (by name) the person has folded away. Shared across events. */
export function loadCollapsed(): string[] { return read<string[]>(COLLAPSED, []); }
export function saveCollapsed(groups: string[]) { write(COLLAPSED, groups); }

/** The last area opened in each event. */
export function loadLastArea(eventId: string): string | null { return read<Record<string, string>>(LAST_AREA, {})[eventId] ?? null; }
export function saveLastArea(eventId: string, areaId: string) {
  const all = read<Record<string, string>>(LAST_AREA, {});
  if (all[eventId] === areaId) return;
  all[eventId] = areaId;
  // Keep the 50 most recent events.
  const keys = Object.keys(all);
  if (keys.length > 50) delete all[keys[0]];
  write(LAST_AREA, all);
}
