/**
 * services/portalAuthStore.js — NEW, 24 Jul 2026.
 * Mirrors services/authStore.js, but for the Lead Portal — a completely
 * separate storage key so a staff session and a prospect session can
 * never collide, even in the same browser.
 *
 * UPDATED §115 (4 Aug 2026): no longer stores a token at all. The portal
 * JWT now lives in an httpOnly cookie (mb_portal_session, set by
 * POST /api/portal/register|activate|login|walkin — see
 * api-lib/http/helpers.js's setPortalAuthCookie()) — JavaScript is never
 * given the raw token to hold in the first place, closing the same
 * sessionStorage-XSS-theft vector §113 already closed for staff auth.
 * The browser attaches the cookie to every same-origin request
 * automatically; services/portalApi.js no longer attaches a manual
 * Authorization header at all.
 *
 * What's left to cache is smaller than authStore.js's — the Lead Portal
 * never shows cached profile data before its own fetch (PortalDashboard
 * always calls portalApi.getMe() on mount regardless), so there's no
 * display data worth persisting. This is now purely a lightweight
 * "was authenticated as of last check" flag, letting isPortalAuthenticated()
 * answer synchronously on first render (avoiding a route-guard flash)
 * without needing a network round trip first. If the cookie has since
 * expired or was cleared server-side, the first real API call simply
 * 401s and notifyPortalUnauthorized() corrects this flag — same
 * self-correcting behaviour authStore.js's cached display data already
 * relies on.
 */

const STORAGE_KEY = 'medbroker.portal.session';

let session = loadFromStorage(); // { authenticated: true } | null
let unauthorizedHandlers = [];

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.authenticated) return parsed;
  } catch {
    // corrupted or inaccessible sessionStorage — treat as logged out
  }
  return null;
}

function persist() {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // persistence is a convenience, not a requirement — session still works in-memory
  }
}

export function isPortalAuthenticated() {
  return session !== null;
}

/**
 * Called after a successful register/activate/login/walkin response — the
 * server has already set the httpOnly cookie by the time this runs; this
 * only updates the local UX flag.
 */
export function setPortalAuthenticated() {
  session = { authenticated: true };
  persist();
}

export function clearPortalSession() {
  session = null;
  persist();
}

/** @param {() => void} handler */
export function onPortalUnauthorized(handler) {
  unauthorizedHandlers.push(handler);
  return () => { unauthorizedHandlers = unauthorizedHandlers.filter(h => h !== handler); };
}

export function notifyPortalUnauthorized() {
  clearPortalSession();
  unauthorizedHandlers.forEach(h => h());
}
