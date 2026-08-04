/**
 * services/authStore.js
 * NEW — plain (non-React) module holding the local-auth session: user only.
 *
 * UPDATED §113 (4 Aug 2026): no longer stores a token at all. The staff
 * JWT now lives in an httpOnly cookie (set by POST /api/auth/login,
 * see api-lib/http/helpers.js's setAuthCookie()) — JavaScript is never
 * given the raw token to hold in the first place, so there's nothing
 * here to protect it from being read by an injected script the way
 * sessionStorage-held credentials always were. The browser attaches the
 * cookie to every same-origin request automatically; services/api.js no
 * longer needs to manually attach an Authorization header for the
 * DEMO_MODE (local-auth) path at all.
 *
 * Kept outside React so services/api.js (a plain module, no hooks) can
 * read the current user synchronously without prop-drilling it through
 * every API call. context/AuthContext.jsx wraps this in React state for
 * components that need to re-render on login/logout; this module is the
 * single source of truth underneath it.
 *
 * Persisted to sessionStorage — same pattern as RoleContext's preview-role
 * persistence and Settings.jsx's display name/avatar: survives a refresh,
 * clears when the tab closes. This is now purely a display-data cache
 * (name, role, avatar colour, etc. — nothing an attacker couldn't already
 * see by looking over the user's shoulder), not a credential store. If
 * the cookie has expired or was never set, the first API call simply
 * 401s and the app redirects to Login regardless of what's cached here.
 */

const STORAGE_KEY = 'medbroker.session';

let session = loadFromStorage(); // { user } | null
let unauthorizedHandlers = [];

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.user) return parsed;
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

export function getUser() {
  return session?.user ?? null;
}

export function isAuthenticated() {
  return session !== null;
}

/**
 * @param {{id: string, displayName: string, email: string, role: string}} user
 */
export function setSession(user) {
  session = { user };
  persist();
}

/**
 * Merge a partial update into the cached user — used after a self-service
 * profile save (Settings.jsx) so persona.displayName/avatarColour/etc.
 * reflect the change immediately app-wide, without forcing a re-login.
 * No-op if there's no active session; callers should only invoke this
 * while authenticated.
 * @param {Object} patch
 */
export function updateUser(patch) {
  if (!session) return;
  session = { ...session, user: { ...session.user, ...patch } };
  persist();
}

export function clearSession() {
  session = null;
  persist();
}

/**
 * Register a callback fired whenever a request comes back 401 while a
 * session was active — services/api.js calls this so a stale/expired
 * (or already-cleared, server-side) cookie clears the cached display
 * data and the app can redirect to Login, rather than every page having
 * to check for it individually.
 * @param {() => void} handler
 */
export function onUnauthorized(handler) {
  unauthorizedHandlers.push(handler);
  return () => { unauthorizedHandlers = unauthorizedHandlers.filter(h => h !== handler); };
}

export function notifyUnauthorized() {
  clearSession();
  unauthorizedHandlers.forEach(h => h());
}
