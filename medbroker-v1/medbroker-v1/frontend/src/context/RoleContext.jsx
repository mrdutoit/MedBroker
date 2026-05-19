/**
 * context/RoleContext.jsx
 * Provides the current user role to all pages via React context.
 * In preview mode, the role is controlled by a switcher in the sidebar.
 * When real auth is connected, replace MOCK_CURRENT_USER with the decoded
 * JWT claims from MSAL (role from claims.roles[0]).
 */

import { createContext, useContext, useState } from 'react';

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

export function RoleProvider({ children }) {
  const [role, setRole] = useState('Admin');
  const persona = PERSONAS[role];

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
