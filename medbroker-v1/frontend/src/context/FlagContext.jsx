/**
 * context/FlagContext.jsx
 * Feature flag context. Fetches the flag set from the API on mount and
 * provides a flag() helper to all pages.
 *
 * DEFAULT_FLAGS is the initial state before the real fetch resolves, and
 * the fallback if the real flags API is unreachable or errors — not a
 * preview/mock mode (that concept was removed 22 July 2026, see
 * VERCEL_NOTES.md). Keeping a sensible default here is still good
 * practice on its own merits: flags gate UI behaviour throughout the
 * app, so a transient API failure shouldn't leave every page with no
 * flag values at all.
 *
 * Usage:
 *   const { flag, flags, loading, refetch } = useFlags();
 *   flag('auth.sso.enabled')              // returns true | false for boolean flags
 *   flag('appointments.claimModel')       // returns 'assign' | 'claim' for enum flags
 *   flag('appointments.claimModel', 'claim')  // shorthand equality check → boolean
 *
 * refetch() — NEW §124 (4 Aug 2026). Re-fetches the full flag set from
 * the server. FeatureFlags.jsx calls this after every save, not just
 * setFlag(key, value) for the one flag that changed — a save can
 * cascade-reset OTHER flags server-side (flagHandlers.js's
 * DEPENDENT_RESETS, e.g. turning auth.sso.enabled off also resets
 * auth.sso.provider/disableLocalFallback), and setFlag alone would leave
 * this context's cached state for those other flags stale until the
 * next full page load.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { flagsApi } from '../services/api.js';

// ─── Default flag values (initial state / API-failure fallback) ───────────────
// These must match the seed values in feature-flags.sql.
export const DEFAULT_FLAGS = {
  'auth.sso.enabled':                      false,
  'auth.sso.provider':                     'none',
  'appointments.claimModel':               'assign',
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
  'security.kmsEncryption.enabled':       false,
  'data.export.enabled':                  false,
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
        // A failed/unreachable API falls through to the catch below and
        // keeps the DEFAULT_FLAGS the state was initialised with.
        const data = await flagsApi.list();
        if (!cancelled && data?.flags) {
          setFlags({ ...DEFAULT_FLAGS, ...data.flags });
        }
      } catch (err) {
        // Demo/production mode with a real but failing/unreachable API —
        // use defaults silently, same as before.
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFlags();
    return () => { cancelled = true; };
  }, []);

  // §124 — separate from the mount-time effect above (that one closes
  // over a `cancelled` flag scoped to ITS OWN effect run, appropriate
  // for unmount-safety on the initial load; a manually-triggered refetch
  // doesn't need that same guard, it's a one-shot call, not tied to a
  // component lifecycle).
  async function refetch() {
    setLoading(true);
    try {
      const data = await flagsApi.list();
      if (data?.flags) setFlags({ ...DEFAULT_FLAGS, ...data.flags });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * flag(key)          — returns the raw value (boolean, string, number)
   * flag(key, compare) — returns true if value matches compare
   *
   * For enum flags (e.g. appointments.claimModel):
   *   flag('appointments.claimModel')          → 'assign' | 'claim'
   *   flag('appointments.claimModel', 'claim') → true | false
   *
   * For boolean flags stored as string '0'/'1'/'true'/'false':
   *   Coerced to actual boolean on return.
   */
  function flag(key, compare) {
    const raw = flags[key];

    // Coerce stored boolean strings to actual booleans
    let value = raw;
    if (raw === '0' || raw === 'false' || raw === false) value = false;
    else if (raw === '1' || raw === 'true' || raw === true) value = true;
    // String enum values (e.g. 'assign', 'claim', 'microsoft') pass through as-is

    if (compare !== undefined) {
      // Support both direct equality and string coercion
      return value === compare || String(raw) === String(compare);
    }
    return value;
  }

  function setFlag(key, value) {
    setFlags(prev => ({ ...prev, [key]: value }));
  }

  return (
    <FlagContext.Provider value={{ flag, flags, setFlag, refetch, loading, error }}>
      {children}
    </FlagContext.Provider>
  );
}

export function useFlags() {
  const ctx = useContext(FlagContext);
  if (!ctx) throw new Error('useFlags must be used inside FlagProvider');
  return ctx;
}
