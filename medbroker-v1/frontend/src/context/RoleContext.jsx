/**
 * context/RoleContext.jsx
 * Provides the current user role to all pages via React context.
 *
 * FIXED 1 Aug 2026 (§87 — dead Entra-branch cleanup): role and persona
 * are derived from the real authenticated user (AuthContext) always now
 * — this used to branch on apiMode.DEMO_MODE, with an "else" path that
 * ran a sidebar role-switcher against a fixed PERSONAS object
 * (previewRole/setPreviewRole, sessionStorage-persisted). That branch
 * never executed in this deployment and has been removed entirely, not
 * simplified in place.
 *
 * IMPORTANT — this Provider still needs a null-safe fallback: it wraps
 * the whole app, including the brief render before AuthContext resolves
 * and while the Login page itself is showing (user is null then). No
 * page that actually reads persona/role via useRole() renders before
 * authentication succeeds — confirmed by checking every call site
 * across the app — but RoleProvider's OWN render still executes on
 * every render regardless, so persona/role default to null rather than
 * assuming user is always truthy.
 */

import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext.jsx';

// Portfolios and products — matches App Admin seed data exactly
export const PORTFOLIOS = [
  { id: 'disc', name: 'Discovery' },
  { id: 'mm',   name: 'Money and Medicine' },
];

export const PRODUCTS_BY_PORTFOLIO = {
  disc: [
    'Life Insurance', 'Income Protection', 'Disability Cover',
    'Severe Illness Cover', 'Education Cover', 'Retirement Annuity',
    'Medical Aid', 'Gap Cover', 'Vitality', 'Bank',
  ],
  mm: ['Unit Trust', 'TFSA', 'Endowment Policy'],
};

const RoleContext = createContext(null);

function initialsFrom(displayName) {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function RoleProvider({ children }) {
  const { user } = useAuth();

  const role = user?.role ?? null;
  const persona = user ? {
    id: user.id,
    displayName: user.displayName,
    initials: initialsFrom(user.displayName),
    role: user.role,
    email: user.email,
    avatarColour: user.avatarColour,
  } : null;
  // No-op — role has only ever come from the real logged-in user since
  // real auth landed; kept so useRole()'s shape stays stable, not
  // because switching roles is ever a real action anymore.
  const setRole = () => {};

  return (
    <RoleContext.Provider value={{ role, setRole, persona }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}
