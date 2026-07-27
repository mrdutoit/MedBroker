/**
 * context/ProspectAuthContext.jsx — NEW, 24 Jul 2026.
 * Mirrors context/AuthContext.jsx, but entirely separate — not nested
 * under RoleProvider/FlagProvider/staff AuthProvider (none of those
 * concepts apply to a prospect). See App.jsx for how /portal/* routes are
 * split off from the staff route tree before either provider tree mounts.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { portalApi } from '../services/portalApi.js';
import * as portalAuthStore from '../services/portalAuthStore.js';

const ProspectAuthContext = createContext(null);

export function ProspectAuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(portalAuthStore.isPortalAuthenticated());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    return portalAuthStore.onPortalUnauthorized(() => setIsAuthenticated(false));
  }, []);

  const registerAndLogin = useCallback(async (qrToken, profileData, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalApi.register({ qrToken, ...profileData, password });
      portalAuthStore.setPortalSession(data.token);
      setIsAuthenticated(true);
      return data;
    } catch (err) {
      setError(err.message ?? 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const walkInAndLogin = useCallback(async (checkinToken, profileData, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalApi.walkIn({ checkinToken, ...profileData, password });
      portalAuthStore.setPortalSession(data.token);
      setIsAuthenticated(true);
      return data;
    } catch (err) {
      setError(err.message ?? 'Could not check you in');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const activateAccount = useCallback(async (email, dateOfBirth, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalApi.activate({ email, dateOfBirth, password });
      portalAuthStore.setPortalSession(data.token);
      setIsAuthenticated(true);
      return data;
    } catch (err) {
      setError(err.message ?? 'Could not activate your account');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalApi.login(email, password);
      portalAuthStore.setPortalSession(data.token);
      setIsAuthenticated(true);
      return data;
    } catch (err) {
      setError(err.message ?? 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    portalAuthStore.clearPortalSession();
    setIsAuthenticated(false);
  }, []);

  return (
    <ProspectAuthContext.Provider value={{ isAuthenticated, registerAndLogin, activateAccount, walkInAndLogin, login, logout, loading, error, setError }}>
      {children}
    </ProspectAuthContext.Provider>
  );
}

export function useProspectAuth() {
  const ctx = useContext(ProspectAuthContext);
  if (!ctx) throw new Error('useProspectAuth must be used inside ProspectAuthProvider');
  return ctx;
}
