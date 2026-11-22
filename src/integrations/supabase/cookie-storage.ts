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
// Browsers drop (silently) any cookie whose name + value is over 4096 bytes.
// Chunks are measured AFTER URL-encoding, because encoding grows the JSON
// session a lot (every quote becomes %22). Measuring before encoding let a
// bigger session (e.g. one with a Microsoft identity linked) write chunks
// that were too big, so they were thrown away and the person looked signed out.
const MAX_CHUNK = 3000;

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
  const parts = [`Path=/`, `Max-Age=${maxAgeSeconds}`, `SameSite=Lax`];
  if (isProductionHost()) {
    parts.push(`Domain=${PARENT_DOMAIN}`);
    parts.push(`Secure`);
  }
  return parts.join("; ");
}

/** The cookie's value exactly as stored (still URL-encoded). */
function readRawCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const p of parts) {
    if (p.startsWith(prefix)) return p.slice(prefix.length);
  }
  return null;
}

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Writes an already URL-encoded value. */
function writeRawCookie(name: string, encodedValue: string, maxAgeSeconds: number) {
  if (!isBrowser()) return;
  document.cookie = `${encodeURIComponent(name)}=${encodedValue}; ${cookieAttributes(maxAgeSeconds)}`;
}

/** Splits an encoded string into pieces of at most `size`, never cutting a %XX escape in half. */
function splitEncoded(encoded: string, size: number): string[] {
  const out: string[] = [];
  let pos = 0;
  while (pos < encoded.length) {
    let end = Math.min(pos + size, encoded.length);
    if (end < encoded.length) {
      if (encoded[end - 1] === "%") end -= 1;
      else if (encoded[end - 2] === "%") end -= 2;
    }
    out.push(encoded.slice(pos, end));
    pos = end;
  }
  return out;
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
  const direct = readRawCookie(key);
  if (direct !== null) return decode(direct);
  // Then chunked. Join the encoded pieces and decode once. (Older cookies,
  // encoded piece by piece, read back exactly the same way.)
  let out = "";
  let i = 0;

  while (true) {
    const part = readRawCookie(chunkKey(key, i));
    if (part === null) break;
    out += part;
    i += 1;
  }
  return out.length > 0 ? decode(out) : null;
}

function clearAll(key: string) {
  deleteCookie(key);
  // Best-effort: clear up to 16 chunks (about 48 KB). Sessions never get close.
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
    const encoded = encodeURIComponent(value);
    if (encoded.length <= MAX_CHUNK) {
      writeRawCookie(key, encoded, SESSION_MAX_AGE);
      return;
    }
    splitEncoded(encoded, MAX_CHUNK).forEach((piece, i) =>
      writeRawCookie(chunkKey(key, i), piece, SESSION_MAX_AGE),
    );
  },
  removeItem(key: string): void {
    if (isBrowser() && !isProductionHost()) {
      window.localStorage.removeItem(key);
      return;
    }
    clearAll(key);
  },
};
