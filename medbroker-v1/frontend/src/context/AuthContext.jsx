/**
 * context/AuthContext.jsx
 * React state layer over services/authStore.js, gating the app behind
 * the local-auth Login page.
 *
 * FIXED 1 Aug 2026 (§87 — dead Entra-branch cleanup): this used to
 * branch on apiMode.DEMO_MODE, with an "else" path where this provider
 * was inert (isAuthenticated hardcoded true, nothing gated behind
 * Login). That branch never executed in this deployment and has been
 * removed — this provider is now unconditionally the real auth gate.
 *
 * Usage:
 *   const { isAuthenticated, user, login, logout, updateUser, loading } = useAuth();
 *
 * ThemeContext dependency (added 28 Jul 2026, §55): AuthProvider sits
 * BELOW ThemeProvider in App.jsx's tree (ThemeProvider wraps BrowserRouter,
 * which renders StaffApp, which renders AuthProvider) specifically so pages
 * outside the staff auth gate — Login, the Lead Portal — still theme
 * correctly. That means useTheme() is safely callable here: login() applies
 * the user's saved themePreference (now returned in the login response,
 * see authHandlers.js) so a fresh login on a new tab/device shows the
 * user's own theme immediately, not just whatever ThemeContext's own
 * sessionStorage happened to default to. A same-tab refresh is already
 * covered without this — ThemeContext's own sessionStorage persistence
 * carries the previously-applied theme forward on its own.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api.js';
import * as authStore from '../services/authStore.js';
import { useTheme, THEME_IDS } from './ThemeContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setTheme } = useTheme();

  const [user, setUser] = useState(authStore.getUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isAuthenticated = user !== null;

  useEffect(() => {
    // If a request anywhere comes back 401, the session is stale — reflect
    // that here so the app re-renders into the Login page.
    return authStore.onUnauthorized(() => setUser(null));
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.login(email, password);
      // §72 — passwordMustChange arrives as a top-level field on the login
      // response, not nested inside data.user, so it wasn't being
      // persisted anywhere before — a page refresh right after login
      // would have silently lost it, since only data.user was stored.
      const userWithFlag = { ...data.user, passwordMustChange: !!data.passwordMustChange };
      // §113 — no token to pass anymore; it's already in an httpOnly
      // cookie the server just set (setAuthCookie(), authHandlers.js).
      // setSession() now only ever caches non-sensitive display data.
      authStore.setSession(userWithFlag);
      setUser(userWithFlag);
      if (data.user.themePreference && THEME_IDS.includes(data.user.themePreference)) {
        setTheme(data.user.themePreference);
      }
      return data; // caller can still check data.passwordMustChange directly too
    } catch (err) {
      setError(err.body?.error ?? err.message ?? 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  // §113 — logout is now a real server round-trip, not just a local
  // state clear: an httpOnly cookie can only be cleared by the server
  // that set it, JavaScript has no way to touch it directly (that's the
  // whole point of using one). Clears local display-data state either
  // way, even if the network call itself fails — a logout the user
  // asked for should never appear to silently do nothing.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Server round-trip failed (offline, etc.) — still clear local
      // state below so the UI reflects "logged out" regardless. Worst
      // case the cookie outlives its own expiry window server-side,
      // same as it always would on a hard browser crash.
    }
    authStore.clearSession();
    setUser(null);
  }, []);

  // Patches the cached user after a self-service profile save (Settings.jsx)
  // so persona.displayName/avatarColour/etc. update immediately app-wide —
  // no re-login needed. See authStore.updateUser() for the underlying merge.
  const updateUser = useCallback((patch) => {
    authStore.updateUser(patch);
    setUser(authStore.getUser());
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, updateUser, loading, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
