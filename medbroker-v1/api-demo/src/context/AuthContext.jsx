/**
 * context/AuthContext.jsx
 * NEW — React state layer over services/authStore.js. Only meaningful in
 * demo-backend mode (api.js's DEMO_MODE); in preview mode and Entra
 * production mode this provider is inert (isAuthenticated stays true so
 * nothing gets gated behind a Login page that doesn't apply to those modes).
 *
 * Usage:
 *   const { isAuthenticated, user, login, logout, loading } = useAuth();
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, apiMode } from '../services/api.js';
import * as authStore from '../services/authStore.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const demoMode = apiMode.DEMO_MODE;

  // Preview mode and Entra mode: not gated by this provider at all.
  // Entra's own MSAL flow handles its authentication separately (see
  // services/api.js getAccessToken()) — this context only drives the
  // local-auth Login page used in demo-backend mode.
  const [user, setUser] = useState(demoMode ? authStore.getUser() : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isAuthenticated = demoMode ? user !== null : true;

  useEffect(() => {
    if (!demoMode) return undefined;
    // If a request anywhere comes back 401, the session is stale — reflect
    // that here so the app re-renders into the Login page.
    return authStore.onUnauthorized(() => setUser(null));
  }, [demoMode]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.login(email, password);
      authStore.setSession(data.token, data.user);
      setUser(data.user);
      return data; // caller can check data.passwordMustChange
    } catch (err) {
      setError(err.body?.error ?? err.message ?? 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authStore.clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ demoMode, isAuthenticated, user, login, logout, loading, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
