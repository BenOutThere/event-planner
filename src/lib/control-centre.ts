// Event Planner signs people in through the OTG Control Centre.
export const CONTROL_CENTRE_URL = String(
  import.meta.env.VITE_CONTROL_CENTRE_URL || "https://controlcentre.outthereadmin.com.au",
).replace(/\/+$/, "");

/** Sends a signed-out person to the Control Centre sign-in, then back to where they were. */
export function goToControlCentreLogin() {
  if (typeof window === "undefined") return;
  const back = window.location.href.split("#")[0];
  window.location.replace(`${CONTROL_CENTRE_URL}/login?redirect=${encodeURIComponent(back)}`);
}

/** Signs out of every OTG app (the session cookie is shared) and returns to the Control Centre. */
export function goToControlCentre() {
  if (typeof window === "undefined") return;
  window.location.replace(CONTROL_CENTRE_URL);
}
