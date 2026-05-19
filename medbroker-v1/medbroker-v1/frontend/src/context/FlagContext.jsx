/**
 * context/FlagContext.jsx
 * Feature flag context. Fetches the flag set from the API on mount and
 * provides a flag() helper to all pages.
 *
 * In preview mode (no API) the DEFAULT_FLAGS object is used directly.
 * When the API is connected, flags are fetched from GET /api/flags and
 * cached with a 5-minute TTL.
 *
 * Usage:
 *   const { flag, flags, loading } = useFlags();
 *   flag('auth.sso.enabled')              // returns true | false for boolean flags
 *   flag('appointments.claimModel')       // returns 'assign' | 'claim' for enum flags
 *   flag('appointments.claimModel', 'claim')  // shorthand equality check → boolean
 */

import { createContext, useContext, useState, useEffect } from 'react';

// ─── Default flag values (preview mode / API fallback) ────────────────────────
// These must match the seed values in feature-flags.sql.
export const DEFAULT_FLAGS = {
  'auth.sso.enabled':                      false,
  'auth.sso.provider':                     'none',
  'appointments.claimModel':               'assign',
  'appointments.tokens.enabled':           false,
  'appointments.tokens.paymentProvider':   'none',
  'events.enabled':                        true,
  'leads.autoUnassign.enabled':            true,
  'leads.importCsv.enabled':              true,
  'leads.importSubscription.enabled':     true,
  'leads.occupationFilter.enabled':       true,
  'reports.agentDetail.enabled':          true,
  'reports.brokerDetail.enabled':         true,
  'notifications.email.enabled':          false,
  'appointments.thirdMeeting.enabled':    false,
  'tasks.enabled':                        false,
  'broker.tokenIncentives.enabled':       false,
  'popia.subjectAccessRequest.enabled':   false,
};

const FlagContext = createContext(null);

export function FlagProvider({ children }) {
  const [flags,   setFlags]   = useState(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFlags() {
      setLoading(true);
      try {
        // Attempt to fetch from the API. Falls back to DEFAULT_FLAGS on any error.
        const res = await fetch('/api/flags');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // API returns { flags: { key: value, ... } }
        if (!cancelled && data.flags) {
          setFlags({ ...DEFAULT_FLAGS, ...data.flags });
        }
      } catch (err) {
        // In preview mode (no API) this is expected — use defaults silently.
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFlags();
    return () => { cancelled = true; };
  }, []);

  /**
   * flag(key)          — returns the raw value (boolean, string)
   * flag(key, compare) — returns true if value === compare (useful for enums)
   */
  function flag(key, compare) {
    const value = flags[key];
    if (compare !== undefined) return value === compare || String(value) === String(compare);
    // Coerce stored booleans
    if (value === '0' || value === 'false') return false;
    if (value === '1' || value === 'true')  return true;
    return value;
  }

  function setFlag(key, value) {
    setFlags(prev => ({ ...prev, [key]: value }));
  }

  return (
    <FlagContext.Provider value={{ flag, flags, setFlag, loading, error }}>
      {children}
    </FlagContext.Provider>
  );
}

export function useFlags() {
  const ctx = useContext(FlagContext);
  if (!ctx) throw new Error('useFlags must be used inside FlagProvider');
  return ctx;
}
