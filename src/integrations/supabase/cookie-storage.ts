/**
 * Cookie-backed implementation of the Supabase auth Storage interface.
 *
 * Supabase normally uses localStorage, which is per-origin. To share a session
 * across every OTG subdomain (controlcentre.outthereadmin.com.au,
 * wip.outthereadmin.com.au, …) we store the auth payload in a cookie scoped to
 * the parent domain. Every subdomain's Supabase client reads the same cookie
 * and is automatically authenticated.
 *
 * Sessions can exceed a single 4KB cookie, so values are chunked across
 * `<key>.0`, `<key>.1`, … the same way Supabase's own SSR helpers do it.
 */

const PARENT_DOMAIN = ".outthereadmin.com.au";
const MAX_CHUNK = 3000; // safe under most browsers' 4096-byte per-cookie limit

function isBrowser(): boolean {
  return typeof document !== "undefined";
}

function isProductionHost(): boolean {
  if (!isBrowser()) return false;
  return window.location.hostname.endsWith("outthereadmin.com.au");
}

function cookieAttributes(maxAgeSeconds: number): string {
  // On production subdomains: scope to parent domain + Secure.
  // On localhost/preview: stay host-only and skip Secure so dev still works.
  const parts = [
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=Lax`,
  ];
  if (isProductionHost()) {
    parts.push(`Domain=${PARENT_DOMAIN}`);
    parts.push(`Secure`);
  }
  return parts.join("; ");
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const p of parts) {
    if (p.startsWith(prefix)) {
      try {
        return decodeURIComponent(p.slice(prefix.length));
      } catch {
        return p.slice(prefix.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (!isBrowser()) return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${cookieAttributes(maxAgeSeconds)}`;
}

function deleteCookie(name: string) {
  if (!isBrowser()) return;
  // Delete from both the parent-domain scope and the host-only scope to be safe.
  const base = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = base;
  if (isProductionHost()) {
    document.cookie = `${base}; Domain=${PARENT_DOMAIN}; Secure`;
  }
}

function chunkKey(key: string, i: number): string {
  return `${key}.${i}`;
}

function readAll(key: string): string | null {
  // Try unchunked first.
  const direct = readCookie(key);
  if (direct !== null) return direct;
  // Then chunked.
  let out = "";
  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const part = readCookie(chunkKey(key, i));
    if (part === null) break;
    out += part;
    i += 1;
  }
  return out.length > 0 ? out : null;
}

function clearAll(key: string) {
  deleteCookie(key);
  // Best-effort: clear up to 16 chunks. Sessions never get close to this.
  for (let i = 0; i < 16; i++) deleteCookie(chunkKey(key, i));
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches Supabase refresh token

export const cookieStorage = {
  getItem(key: string): string | null {
    if (isBrowser() && !isProductionHost()) {
      return window.localStorage.getItem(key);
    }
    return readAll(key);
  },
  setItem(key: string, value: string): void {
    if (isBrowser() && !isProductionHost()) {
      window.localStorage.setItem(key, value);
      return;
    }
    // Always clear previous chunks before writing — value length may have changed.
    clearAll(key);
    if (value.length <= MAX_CHUNK) {
      writeCookie(key, value, SESSION_MAX_AGE);
      return;
    }
    let i = 0;
    for (let pos = 0; pos < value.length; pos += MAX_CHUNK, i++) {
      writeCookie(chunkKey(key, i), value.slice(pos, pos + MAX_CHUNK), SESSION_MAX_AGE);
    }
  },
  removeItem(key: string): void {
    if (isBrowser() && !isProductionHost()) {
      window.localStorage.removeItem(key);
      return;
    }
    clearAll(key);
  },
};