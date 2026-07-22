/**
 * services/authStore.js
 * NEW — plain (non-React) module holding the local-auth session: JWT + user.
 *
 * Kept outside React so services/api.js (a plain module, no hooks) can read
 * the current token synchronously on every request without prop-drilling it
 * through every API call. context/AuthContext.jsx wraps this in React state
 * for components that need to re-render on login/logout; this module is the
 * single source of truth underneath it.
 *
 * Persisted to sessionStorage — same pattern as RoleContext's preview-role
 * persistence and Settings.jsx's display name/avatar: survives a refresh,
 * clears when the tab closes. A JWT surviving a refresh is the whole point
 * (so logging in isn't required on every page reload); tab-scoped clearing
 * is an intentional trade-off, not an oversight.
 */

const STORAGE_KEY = 'medbroker.session';

let session = loadFromStorage(); // { token, user } | null
let unauthorizedHandlers = [];

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.user) return parsed;
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

export function getToken() {
  return session?.token ?? null;
}

export function getUser() {
  return session?.user ?? null;
}

export function isAuthenticated() {
  return session !== null;
}

/**
 * @param {string} token
 * @param {{id: string, displayName: string, email: string, role: string}} user
 */
export function setSession(token, user) {
  session = { token, user };
  persist();
}

export function clearSession() {
  session = null;
  persist();
}

/**
 * Register a callback fired whenever a request comes back 401 while a
 * session was active — services/api.js calls this so a stale/expired token
 * clears itself and the app can redirect to Login without every call site
 * having to check for it individually.
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
