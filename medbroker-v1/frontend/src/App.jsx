/**
 * App.jsx — AUTH BYPASSED FOR PREVIEW
 * Role-aware navigation and routing. The role switcher in the sidebar
 * simulates different user personas for demonstration.
 *
 * To restore real authentication: replace RoleProvider + role switcher with
 * MsalProvider + AuthenticatedTemplate and derive role from JWT claims.
 */

import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { RoleProvider, useRole, PERSONAS, ROLES } from './context/RoleContext.jsx';
import { FlagProvider, useFlags } from './context/FlagContext.jsx';

// Eagerly loaded — always needed
import LeadList        from './pages/LeadList.jsx';
import AppointmentList from './pages/AppointmentList.jsx';

// Lazy loaded
const LeadDetail      = lazy(() => import('./pages/LeadDetail.jsx'));
const LeadImport      = lazy(() => import('./pages/LeadImport.jsx'));
const EventList       = lazy(() => import('./pages/EventList.jsx'));
const EventDetail     = lazy(() => import('./pages/EventDetail.jsx'));
const Reports         = lazy(() => import('./pages/Reports.jsx'));
const AgentDetail     = lazy(() => import('./pages/AgentDetail.jsx'));
const BrokerDetail    = lazy(() => import('./pages/BrokerDetail.jsx'));
const UserAdmin       = lazy(() => import('./pages/UserAdmin.jsx'));
const AppAdmin        = lazy(() => import('./pages/AppAdmin.jsx'));
const Notifications   = lazy(() => import('./pages/Notifications.jsx'));
const Tasks           = lazy(() => import('./pages/Tasks.jsx'));
const SingleSignOn    = lazy(() => import('./pages/SingleSignOn.jsx'));
const FeatureFlags    = lazy(() => import('./pages/FeatureFlags.jsx'));

const NAV_SECTION_LABEL = {
  fontSize: '0.625rem', fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  padding: '10px 10px 4px', userSelect: 'none',
};

function NavItem({ to, label, badge, hidden }) {
  if (hidden) return null;
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderRadius: '6px', textDecoration: 'none',
        fontSize: '0.8125rem', fontWeight: isActive ? 500 : 400,
        color: isActive ? '#1d4ed8' : '#374151',
        background: isActive ? '#eff6ff' : 'transparent',
        transition: 'background 0.1s',
      })}
    >
      <span>{label}</span>
      {badge != null && (
        <span style={{
          background: '#dc2626', color: 'white', borderRadius: '10px',
          fontSize: '0.625rem', fontWeight: 600, padding: '1px 5px', minWidth: '16px',
          textAlign: 'center',
        }}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function AppLayout({ children }) {
  const { role, setRole, persona } = useRole();
  const { flag } = useFlags();
  const navigate = useNavigate();

  const isGlobalAdmin = role === 'GlobalAdmin';
  const isAdmin       = role === 'Admin' || isGlobalAdmin;
  const isAgent       = role === 'Agent';
  const isBroker      = role === 'Broker';
  // Roles that see admin sections (User Admin, App Admin, SSO)
  const isAdminOrAbove = isAdmin;

  // ── Flag-controlled visibility ────────────────────────────────────────────
  const showEvents        = flag('events.enabled');
  const showTasks         = flag('tasks.enabled');
  const showSso           = flag('auth.sso.enabled') && isAdminOrAbove;
  // Section-level visibility — only render the section label if at least
  // one item in that section will be visible for the current role and flags
  const showEventsSection     = showEvents;
  const showProductivitySection = true; // Notifications always visible
  const showAdminSection      = isAdminOrAbove;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Sidebar ── */}
      <nav style={{
        width: '220px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column', background: 'white',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', background: '#1d4ed8', borderRadius: '7px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: 'white', fontSize: '14px' }}>M</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827', letterSpacing: '-0.01em' }}>
                MedBroker
              </div>
              <div style={{ fontSize: '0.625rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Lead Management
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: '8px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>

          {/* Pipeline — always visible, items filtered by role */}
          <div style={NAV_SECTION_LABEL}>Pipeline</div>
          <NavItem to="/leads"        label="Leads"        hidden={isBroker} />
          <NavItem to="/appointments" label="Appointments" hidden={isAgent} />

          {/* Events — only shown when events.enabled flag is on */}
          {showEventsSection && (
            <>
              <div style={NAV_SECTION_LABEL}>Events</div>
              <NavItem to="/events" label="Events" />
            </>
          )}

          {/* Productivity — always visible; Tasks shown only when tasks.enabled flag is on */}
          {showProductivitySection && (
            <>
              <div style={NAV_SECTION_LABEL}>Productivity</div>
              <NavItem to="/notifications" label="Notifications" badge={5} />
              {showTasks && <NavItem to="/tasks" label="Tasks" />}
            </>
          )}

          {/* Analytics — always visible */}
          <div style={NAV_SECTION_LABEL}>Analytics</div>
          <NavItem to="/reports" label="Reports" />

          {/* Admin — only visible to Admin and GlobalAdmin roles */}
          {showAdminSection && (
            <>
              <div style={NAV_SECTION_LABEL}>Admin</div>
              <NavItem to="/admin/users" label="User Admin" />
              <NavItem to="/admin/app"   label="App Admin" />
              {/* SSO only shown when auth.sso.enabled flag is on */}
              {showSso && <NavItem to="/admin/sso" label="Single Sign-On" />}
              {/* Feature Flags — GlobalAdmin only, never visible to customers */}
              {isGlobalAdmin && <NavItem to="/admin/flags" label="Feature Flags" />}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid #e5e7eb' }}>
          {/* Preview role switcher */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
            padding: '7px 10px', marginBottom: '8px', fontSize: '0.75rem', color: '#92400e',
          }}>
            <div style={{ marginBottom: '4px', fontWeight: 500 }}>⚠ Preview mode</div>
            <select
              value={role}
              onChange={e => {
                const next = e.target.value;
                setRole(next);
                if (next === 'Broker') navigate('/appointments');
                else if (next === 'Agent') navigate('/leads');
                else navigate('/leads');
              }}
              style={{
                width: '100%', border: '1px solid #fde68a', borderRadius: '4px',
                padding: '3px 6px', fontSize: '0.75rem', background: '#fffbeb',
                color: '#92400e', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <option value="GlobalAdmin">Global Administrator</option>
              <option value="Admin">Admin</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Agent">Agent (T. Molefe)</option>
              <option value="Broker">Broker (S. van der Berg)</option>
            </select>
          </div>
          {/* User identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: isGlobalAdmin ? '#fdf2ff' : '#eff6ff',
              color:      isGlobalAdmin ? '#7e22ce'  : '#1d4ed8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6875rem', fontWeight: 600,
            }}>
              {persona.initials}
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 500, color: '#111827' }}>{persona.displayName}</div>
              <div style={{ fontSize: '0.625rem', color: '#9ca3af' }}>{persona.role}</div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflowY: 'auto', background: '#f9fafb', minWidth: 0 }}>
        <Suspense fallback={
          <div style={{ padding: '24px', color: '#6b7280', fontSize: '0.875rem' }}>Loading…</div>
        }>
          {children}
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <RoleProvider>
      <FlagProvider>
        <BrowserRouter>
          <AppLayoutWrapper />
        </BrowserRouter>
      </FlagProvider>
    </RoleProvider>
  );
}

function AppLayoutWrapper() {
  const { role } = useRole();
  const { flag } = useFlags();

  const defaultPath = role === 'Broker' ? '/appointments' : '/leads';

  // Route guard — redirect if the user navigates to a route that the current
  // role or flag state does not permit. React Router renders the first matching
  // route so these guards must be placed before the real routes.
  const isGlobalAdmin  = role === 'GlobalAdmin';
  const isAdminOrAbove = role === 'Admin' || isGlobalAdmin;
  const isAgent        = role === 'Agent';
  const isBroker       = role === 'Broker';

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />

        {/* Pipeline */}
        <Route path="/leads"            element={isBroker ? <Navigate to="/appointments" replace /> : <LeadList />} />
        <Route path="/leads/import"     element={isBroker ? <Navigate to="/appointments" replace /> : <LeadImport />} />
        <Route path="/leads/:id"        element={isBroker ? <Navigate to="/appointments" replace /> : <LeadDetail />} />
        <Route path="/appointments"     element={isAgent  ? <Navigate to="/leads"        replace /> : <AppointmentList />} />
        <Route path="/appointments/:id" element={isAgent  ? <Navigate to="/leads"        replace /> : <LeadDetail />} />

        {/* Events — gated by flag */}
        <Route path="/events"    element={flag('events.enabled') ? <EventList />   : <Navigate to={defaultPath} replace />} />
        <Route path="/events/:id" element={flag('events.enabled') ? <EventDetail /> : <Navigate to={defaultPath} replace />} />

        {/* Productivity */}
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/tasks"         element={flag('tasks.enabled') ? <Tasks /> : <Navigate to={defaultPath} replace />} />

        {/* Analytics */}
        <Route path="/reports"             element={<Reports />} />
        <Route path="/reports/agent/:id"   element={<AgentDetail />} />
        <Route path="/reports/broker/:id"  element={<BrokerDetail />} />

        {/* Admin — gated by role */}
        <Route path="/admin/users" element={isAdminOrAbove ? <UserAdmin />    : <Navigate to={defaultPath} replace />} />
        <Route path="/admin/app"   element={isAdminOrAbove ? <AppAdmin />     : <Navigate to={defaultPath} replace />} />
        <Route path="/admin/sso"   element={isAdminOrAbove && flag('auth.sso.enabled') ? <SingleSignOn /> : <Navigate to={defaultPath} replace />} />
        {/* Feature Flags — GlobalAdmin only */}
        <Route path="/admin/flags" element={isGlobalAdmin ? <FeatureFlags /> : <Navigate to={defaultPath} replace />} />
      </Routes>
    </AppLayout>
  );
}
