/**
 * context/RoleContext.jsx
 * Provides the current user role to all pages via React context.
 *
 * In preview mode (no backend at all) and Entra production mode, behaviour
 * is unchanged from before: the role is controlled by the sidebar switcher
 * (preview) or will come from decoded MSAL claims (production, not yet
 * wired — see the original comment below, still accurate for that mode).
 *
 * NEW — in demo-backend mode (api.js apiMode.DEMO_MODE), role and persona
 * are derived from the real authenticated user (AuthContext) instead of the
 * switcher, and setRole becomes a no-op — there's a real logged-in user now,
 * switching roles arbitrarily wouldn't make sense (and isn't authorised
 * server-side regardless). AuthProvider must be an ancestor of RoleProvider
 * for this — see App.jsx.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { apiMode } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

export const ROLES = ['GlobalAdmin', 'Admin', 'Supervisor', 'Agent', 'Broker'];

export const PERSONAS = {
  GlobalAdmin: { id: 'globaladmin-001', displayName: 'Global Administrator', initials: 'GA', role: 'GlobalAdmin' },
  Admin:       { id: 'admin-001',       displayName: 'Admin User',           initials: 'AU', role: 'Admin' },
  Supervisor:  { id: 'sup-001',         displayName: 'Supervisor One',        initials: 'SO', role: 'Supervisor' },
  Agent:       { id: 'agent-001',       displayName: 'Thabo Molefe',          initials: 'TM', role: 'Agent' },
  Broker:      { id: 'broker-001',      displayName: 'Sandra van der Berg',   initials: 'SB', role: 'Broker' },
};

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

// Preview-mode only: remember the selected role across page refreshes.
// sessionStorage is scoped to the tab, so it survives a refresh but clears when
// the window closes. When real auth is connected, replace this with the role
// claim from the decoded MSAL token (claims.roles[0]) and drop the persistence.
const ROLE_STORAGE_KEY = 'medbroker.previewRole';

function getInitialRole() {
  try {
    const saved = sessionStorage.getItem(ROLE_STORAGE_KEY);
    if (saved && ROLES.includes(saved)) return saved;
  } catch {
    // sessionStorage unavailable (SSR, privacy settings) — fall back to default
  }
  return 'Admin';
}

function initialsFrom(displayName) {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function RoleProvider({ children }) {
  const [previewRole, setPreviewRole] = useState(getInitialRole);
  const demoMode = apiMode.DEMO_MODE;

  // AuthContext only exists meaningfully in demo mode, but AuthProvider wraps
  // this in both preview and Entra modes too (see App.jsx) so this hook call
  // is always safe — it just won't affect anything outside demo mode.
  const { user } = useAuth();

  useEffect(() => {
    if (demoMode) return; // real auth drives role in this mode — nothing to persist
    try {
      sessionStorage.setItem(ROLE_STORAGE_KEY, previewRole);
    } catch {
      // ignore — persistence is a convenience, not a requirement
    }
  }, [previewRole, demoMode]);

  let role, persona, setRole;

  if (demoMode && user) {
    role = user.role;
    persona = {
      id: user.id,
      displayName: user.displayName,
      initials: initialsFrom(user.displayName),
      role: user.role,
      email: user.email,
      avatarColour: user.avatarColour,
    };
    setRole = () => {}; // no-op — role comes from the real logged-in user
  } else {
    role = previewRole;
    persona = PERSONAS[previewRole];
    setRole = setPreviewRole;
  }

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
