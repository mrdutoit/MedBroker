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
 *
 * PORTFOLIOS/PRODUCTS (added 1 Aug 2026, §90): previously a static,
 * hardcoded pair of exported constants — meaning no portfolio or
 * product could ever actually be added anywhere in the app, regardless
 * of what App Admin's own UI claimed. Real Portfolio/Product tables
 * already existed in the database and were already correctly related
 * (Product.portfolioId), just never exposed over the API — now fetched
 * once here and exposed through the same useRole() hook every consumer
 * already calls, so a portfolio added in App Admin shows up everywhere
 * (Lead Detail, Lead Import, Appointment Detail, User Admin's
 * assignment checkboxes) without each page needing its own fetch.
 */

import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { leadsApi } from '../services/api.js';

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

  // Gated on `user` — the Login page renders before authentication
  // succeeds, and this endpoint requires a valid session; matches the
  // same "don't fetch before login" reasoning as persona/role above.
  const { data: portfolioData, refetch: refetchPortfolios } = useFetch(
    () => user ? leadsApi.listPortfolios() : Promise.resolve(null),
    [user?.id]
  );
  const portfolios = portfolioData?.portfolios ?? [];
  // Name-keyed, not id-keyed — every consumer already worked with
  // portfolio NAMES throughout (User.portfolios/products are both
  // string-name arrays, matching the wider app convention — see
  // userService.js's USER_LIST_SELECT), so this is what lets each of
  // them switch from the old static import to this fetched data with a
  // small, mechanical change rather than a deeper rewrite.
  const productsByPortfolio = Object.fromEntries(
    portfolios.map(p => [p.name, p.products.map(prod => prod.name)])
  );

  return (
    <RoleContext.Provider value={{ role, setRole, persona, portfolios, productsByPortfolio, refetchPortfolios }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}
