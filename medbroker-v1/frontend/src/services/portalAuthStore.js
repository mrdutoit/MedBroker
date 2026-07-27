/**
 * services/portalAuthStore.js — NEW, 24 Jul 2026.
 * Mirrors services/authStore.js exactly, but for the Lead Portal — a
 * completely separate storage key so a staff session and a prospect
 * session can never collide, even in the same browser (e.g. Mark testing
 * both flows in one session while building this).
 */

const STORAGE_KEY = 'medbroker.portal.session';

let session = loadFromStorage(); // { token } | null
let unauthorizedHandlers = [];

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token) return parsed;
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

export function getPortalToken() {
  return session?.token ?? null;
}

export function isPortalAuthenticated() {
  return session !== null;
}

/** @param {string} token */
export function setPortalSession(token) {
  session = { token };
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
