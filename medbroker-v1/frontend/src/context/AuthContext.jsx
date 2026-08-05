/**
 * context/AuthContext.jsx
 * React state layer over services/authStore.js, gating the app behind
 * the local-auth Login page.
 *
 * FIXED 1 Aug 2026 (§87 — dead Entra-branch cleanup): this used to
 * branch on apiMode.DEMO_MODE, with an "else" path where this provider
 * was inert (isAuthenticated hardcoded true, nothing gated behind
 * Login). That branch never executed in this deployment and was removed.
 *
 * UPDATED §120 (4 Aug 2026, SSO stage 4): ssoLogin() added alongside
 * login() — same response shape, same session handling, the only
 * difference is how the credential is obtained (a Microsoft popup via
 * msalAuth.js vs a typed password). This is a DIFFERENT piece of Entra
 * code than the apiMode.DEMO_MODE branch §87 removed — that was a dead,
 * never-executed fork; this is the real, working SSO login path §114
 * built the backend for.
 *
 * Usage:
 *   const { isAuthenticated, user, login, ssoLogin, logout, updateUser, loading } = useAuth();
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

  // §120 — SSO stage 4. Same shape as login() above deliberately —
  // handleEntraLogin (authHandlers.js, §114) returns the identical
  // { user, passwordMustChange } response shape handleLogin does, so
  // everything downstream of getting that response back (session
  // caching, theme application, passwordMustChange handling) is
  // identical too. The only real difference is how the credential is
  // obtained: a Microsoft popup (msalAuth.js) instead of a typed password.
  //
  // Dynamic import, not a static one at the top of this file — msalAuth.js
  // pulls in @azure/msal-browser, a sizeable library. A static import
  // here put MSAL in AuthContext's own module graph, which App.jsx loads
  // eagerly for every single user regardless of whether their deployment
  // has SSO enabled at all — confirmed by the production build: the main
  // bundle nearly doubled (272kB -> 539kB) with a static import in place.
  // A dynamic import only fetches MSAL the moment someone actually
  // attempts SSO login, which can only happen if the "Sign in with
  // Microsoft" button is even showing (Login.jsx gates it on
  // auth.sso.enabled) — so a deployment that never turns SSO on never
  // ships MSAL to its users at all.
  const ssoLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { acquireEntraIdToken } = await import('../services/msalAuth.js');
      const idToken = await acquireEntraIdToken();
      const data = await authApi.entraLogin(idToken);
      const userWithFlag = { ...data.user, passwordMustChange: !!data.passwordMustChange };
      authStore.setSession(userWithFlag);
      setUser(userWithFlag);
      if (data.user.themePreference && THEME_IDS.includes(data.user.themePreference)) {
        setTheme(data.user.themePreference);
      }
      return data;
    } catch (err) {
      // MSAL's own errors (user closed the popup, network issue talking
      // to Microsoft, etc.) don't carry the same err.body?.error shape a
      // backend ApiError does — err.message still gives a reasonable
      // fallback either way.
      setError(err.body?.error ?? err.message ?? 'Microsoft sign-in failed');
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
    <AuthContext.Provider value={{ isAuthenticated, user, login, ssoLogin, logout, updateUser, loading, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
