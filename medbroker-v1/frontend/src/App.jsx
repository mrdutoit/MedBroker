/**
 * App.jsx — AUTH BYPASSED FOR PREVIEW
 * Role-aware navigation and routing. The role switcher in the sidebar
 * simulates different user personas for demonstration.
 *
 * To restore real authentication: replace RoleProvider + role switcher with
 * MsalProvider + AuthenticatedTemplate and derive role from JWT claims.
 *
 * Responsive — collapsible sidebar on mobile.
 */

import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { RoleProvider, useRole, PERSONAS, ROLES } from './context/RoleContext.jsx';
import { FlagProvider, useFlags }                 from './context/FlagContext.jsx';
import { useWindowSize }                           from './hooks/useWindowSize.js';

import LeadList        from './pages/LeadList.jsx';
import AppointmentList from './pages/AppointmentList.jsx';

const LeadDetail        = lazy(() => import('./pages/LeadDetail.jsx'));
const AppointmentDetail = lazy(() => import('./pages/AppointmentDetail.jsx'));
const LeadImport        = lazy(() => import('./pages/LeadImport.jsx'));
const EventList         = lazy(() => import('./pages/EventList.jsx'));
const EventDetail       = lazy(() => import('./pages/EventDetail.jsx'));
const Reports           = lazy(() => import('./pages/Reports.jsx'));
const AgentDetail       = lazy(() => import('./pages/AgentDetail.jsx'));
const BrokerDetail      = lazy(() => import('./pages/BrokerDetail.jsx'));
const UserAdmin         = lazy(() => import('./pages/UserAdmin.jsx'));
const AppAdmin          = lazy(() => import('./pages/AppAdmin.jsx'));
const Notifications     = lazy(() => import('./pages/Notifications.jsx'));
const Tasks             = lazy(() => import('./pages/Tasks.jsx'));
const SingleSignOn      = lazy(() => import('./pages/SingleSignOn.jsx'));
const FeatureFlags      = lazy(() => import('./pages/FeatureFlags.jsx'));

// ─── Nav section label style ───────────────────────────────────────────────────
const NAV_SECTION_LABEL = {
  fontSize: '0.625rem', fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  padding: '10px 10px 4px', userSelect: 'none',
};

// ─── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ to, label, badge, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
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
          fontSize: '0.625rem', fontWeight: 600, padding: '1px 5px',
        }}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}

// ─── AppLayout ─────────────────────────────────────────────────────────────────
function AppLayout({ children }) {
  const { role, setRole, persona } = useRole();
  const { flag }                   = useFlags();
  const navigate                   = useNavigate();
  const { isMobile, isTablet }     = useWindowSize();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isGlobalAdmin  = role === 'GlobalAdmin';
  const isAdmin        = role === 'Admin' || isGlobalAdmin;
  const isAgent        = role === 'Agent';
  const isBroker       = role === 'Broker';
  const isAdminOrAbove = isAdmin;

  // ── Flag-controlled visibility ──────────────────────────────────────────────
  const showEvents = flag('events.enabled');
  const showTasks  = flag('tasks.enabled');
  const showSso    = flag('auth.sso.enabled') && isAdminOrAbove;

  // Section-level visibility — never render a section label when all items
  // beneath it are hidden (critical rule from Project_Context)
  const showEventsSection      = showEvents;
  const showProductivitySection = true; // Notifications always visible
  const showAdminSection       = isAdminOrAbove;

  function closeNav() { if (isMobile) setSidebarOpen(false); }

  const sidebarWidth = isMobile
    ? (sidebarOpen ? '240px' : '0px')
    : isTablet ? '200px' : '220px';

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif', position: 'relative' }}>

      {/* Mobile dark overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <nav style={{
        width: sidebarWidth, flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column', background: 'white',
        overflowY: 'auto', overflowX: 'hidden',
        transition: 'width 0.25s ease',
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0,
          zIndex: 50,
          boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.15)' : 'none',
        } : {}),
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', background: '#1d4ed8', borderRadius: '7px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>M</span>
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

        {/* Nav items */}
        <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>

          {/* Pipeline — always visible; items filtered by role */}
          <div style={NAV_SECTION_LABEL}>Pipeline</div>
          {!isBroker && <NavItem to="/leads"        label="Leads"        onClick={closeNav} />}
          {!isAgent  && <NavItem to="/appointments" label="Appointments" onClick={closeNav} />}

          {/* Events — only shown when events.enabled flag is on */}
          {showEventsSection && (
            <>
              <div style={NAV_SECTION_LABEL}>Events</div>
              <NavItem to="/events" label="Events" onClick={closeNav} />
            </>
          )}

          {/* Productivity — always visible; Tasks shown only when tasks.enabled */}
          {showProductivitySection && (
            <>
              <div style={NAV_SECTION_LABEL}>Productivity</div>
              <NavItem to="/notifications" label="Notifications" badge={5} onClick={closeNav} />
              {showTasks && <NavItem to="/tasks" label="Tasks" onClick={closeNav} />}
            </>
          )}

          {/* Analytics — always visible */}
          <div style={NAV_SECTION_LABEL}>Analytics</div>
          <NavItem to="/reports" label="Reports" onClick={closeNav} />

          {/* Admin — only Admin and GlobalAdmin */}
          {showAdminSection && (
            <>
              <div style={NAV_SECTION_LABEL}>Admin</div>
              <NavItem to="/admin/users" label="User Admin" onClick={closeNav} />
              <NavItem to="/admin/app"   label="App Admin"  onClick={closeNav} />
              {showSso && <NavItem to="/admin/sso" label="Single Sign-On" onClick={closeNav} />}
              {/* Feature Flags — GlobalAdmin only, never visible to customer-facing roles */}
              {isGlobalAdmin && <NavItem to="/admin/flags" label="Feature Flags" onClick={closeNav} />}
            </>
          )}
        </div>

        {/* ── Sidebar footer — role switcher (preview only) ──────────────── */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
            padding: '5px 8px', fontSize: '0.6875rem', color: '#92400e',
            textAlign: 'center', marginBottom: '8px',
          }}>
            Preview mode — auth bypassed
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#9ca3af', padding: '2px 4px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Switch role
          </div>
          {['GlobalAdmin', 'Admin', 'Supervisor', 'Agent', 'Broker'].map(r => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                navigate(r === 'Broker' ? '/appointments' : '/leads');
                closeNav();
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', border: 'none', borderRadius: '5px',
                fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                background: role === r ? '#eff6ff' : 'transparent',
                color: role === r ? '#1d4ed8' : '#374151',
                fontWeight: role === r ? 600 : 400,
              }}
            >
              {PERSONAS[r]?.displayName ?? r}
              <span style={{ fontSize: '0.6875rem', color: '#9ca3af', marginLeft: '5px' }}>({r})</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Mobile topbar with hamburger */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
            background: 'white', flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#374151' }}
              aria-label="Open navigation"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" />
              </svg>
            </button>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>MedBroker</div>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Suspense fallback={
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
              Loading…
            </div>
          }>
            {children}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ─── AppLayoutWrapper — routes ─────────────────────────────────────────────────
function AppLayoutWrapper() {
  const { role }    = useRole();
  const { flag }    = useFlags();
  const isGlobalAdmin  = role === 'GlobalAdmin';
  const isAdmin        = role === 'Admin' || isGlobalAdmin;
  const isAgent        = role === 'Agent';
  const isBroker       = role === 'Broker';
  const isAdminOrAbove = isAdmin;
  const defaultPath    = isBroker ? '/appointments' : '/leads';

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />

        {/* Leads — hidden from Broker */}
        <Route path="/leads"        element={isBroker ? <Navigate to="/appointments" replace /> : <LeadList />} />
        <Route path="/leads/import" element={isBroker ? <Navigate to="/appointments" replace /> : <LeadImport />} />
        <Route path="/leads/:id"    element={isBroker ? <Navigate to="/appointments" replace /> : <LeadDetail />} />

        {/* Appointments — hidden from Agent */}
        <Route path="/appointments"     element={isAgent ? <Navigate to="/leads" replace /> : <AppointmentList />} />
        <Route path="/appointments/:id" element={isAgent ? <Navigate to="/leads" replace /> : <AppointmentDetail />} />

        {/* Events — gated by flag */}
        <Route path="/events"     element={flag('events.enabled') ? <EventList />   : <Navigate to={defaultPath} replace />} />
        <Route path="/events/:id" element={flag('events.enabled') ? <EventDetail /> : <Navigate to={defaultPath} replace />} />

        {/* Productivity */}
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/tasks"         element={flag('tasks.enabled') ? <Tasks /> : <Navigate to={defaultPath} replace />} />

        {/* Analytics */}
        <Route path="/reports"            element={<Reports />} />
        <Route path="/reports/agent/:id"  element={<AgentDetail />} />
        <Route path="/reports/broker/:id" element={<BrokerDetail />} />

        {/* Admin — gated by role */}
        <Route path="/admin/users" element={isAdminOrAbove ? <UserAdmin />   : <Navigate to={defaultPath} replace />} />
        <Route path="/admin/app"   element={isAdminOrAbove ? <AppAdmin />    : <Navigate to={defaultPath} replace />} />
        <Route path="/admin/sso"   element={isAdminOrAbove && flag('auth.sso.enabled') ? <SingleSignOn /> : <Navigate to={defaultPath} replace />} />

        {/* Feature Flags — GlobalAdmin only */}
        <Route path="/admin/flags" element={isGlobalAdmin ? <FeatureFlags /> : <Navigate to={defaultPath} replace />} />
      </Routes>
    </AppLayout>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
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
