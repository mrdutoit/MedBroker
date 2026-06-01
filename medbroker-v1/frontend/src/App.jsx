/**
 * App.jsx — AUTH BYPASSED FOR PREVIEW
 * Role-aware navigation and routing. The role switcher in the sidebar footer
 * simulates different user personas for demonstration purposes.
 *
 * To restore real authentication: replace RoleProvider + role switcher with
 * MsalProvider + AuthenticatedTemplate and derive role from JWT claims.
 *
 * Responsive — collapsible sidebar on mobile.
 */

import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { RoleProvider, useRole, PERSONAS } from './context/RoleContext.jsx';
import { FlagProvider, useFlags }           from './context/FlagContext.jsx';
import { useWindowSize }                     from './hooks/useWindowSize.js';

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

// ─── Nav section label ─────────────────────────────────────────────────────────
const SECTION = {
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

// ─── Report drill-down guard ────────────────────────────────────────────────
// Self-service roles (Agent, Broker) may open only their own report detail.
// selfId === null means unrestricted (management, supervisors).
function ReportDrillGuard({ selfId, fallback, children }) {
  const { id } = useParams();
  if (selfId !== null && id !== selfId) return <Navigate to={fallback} replace />;
  return children;
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

  // Section labels only rendered when at least one item beneath them is visible
  const showAdminSection = isAdminOrAbove;

  // Unread notification count — in production fetched from GET /api/notifications?unread=true
  // Matches the 4 unread items in MOCK_NOTIFICATIONS in Notifications.jsx
  const [unreadCount] = useState(4);

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
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
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
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827', letterSpacing: '-0.01em' }}>MedBroker</div>
              <div style={{ fontSize: '0.625rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lead Management</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>

          <div style={SECTION}>Pipeline</div>
          {!isBroker && <NavItem to="/leads"        label="Leads"        onClick={closeNav} />}
          {!isAgent  && <NavItem to="/appointments" label="Appointments" onClick={closeNav} />}

          {showEvents && (
            <>
              <div style={SECTION}>Events</div>
              <NavItem to="/events" label="Events" onClick={closeNav} />
            </>
          )}

          <div style={SECTION}>Productivity</div>
          <NavItem to="/notifications" label="Notifications" badge={unreadCount > 0 ? unreadCount : null} onClick={closeNav} />
          {showTasks && <NavItem to="/tasks" label="Tasks" onClick={closeNav} />}

          {/* Analytics — visible to all roles; data is scoped per role in Reports */}
          <div style={SECTION}>Analytics</div>
          <NavItem to="/reports" label="Reports" onClick={closeNav} />

          {showAdminSection && (
            <>
              <div style={SECTION}>Admin</div>
              <NavItem to="/admin/users" label="User Admin" onClick={closeNav} />
              <NavItem to="/admin/app"   label="App Admin"  onClick={closeNav} />
              {showSso       && <NavItem to="/admin/sso"   label="Single Sign-On" onClick={closeNav} />}
              {isGlobalAdmin && <NavItem to="/admin/flags" label="Feature Flags"  onClick={closeNav} />}
            </>
          )}
        </div>

        {/* ── Sidebar footer — role switcher (preview only) ─────────────── */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '7px 10px', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#92400e', marginBottom: '5px' }}>
              ⚠ Preview mode
            </div>
            {/* Role switcher — compact dropdown, same pattern as the HTML demo */}
            <select
              value={role}
              onChange={e => {
                const next = e.target.value;
                setRole(next);
                navigate(next === 'Broker' ? '/appointments' : '/leads');
                closeNav();
              }}
              style={{
                width: '100%', border: '1px solid #fde68a', borderRadius: '4px',
                padding: '3px 6px', fontSize: '0.75rem',
                background: '#fffbeb', color: '#92400e',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <option value="GlobalAdmin">Global Administrator</option>
              <option value="Admin">Admin</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Agent">Agent (T. Molefe)</option>
              <option value="Broker">Broker (S. van der Berg)</option>
            </select>
          </div>

          {/* Current user display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: isGlobalAdmin ? '#fdf2ff' : '#eff6ff',
              color: isGlobalAdmin ? '#7e22ce' : '#1d4ed8',
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

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>

        {/* Mobile topbar */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', fontSize: '1.375rem', cursor: 'pointer', color: '#374151', lineHeight: 1 }}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '22px', height: '22px', background: '#1d4ed8', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: '11px' }}>M</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>MedBroker</span>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#6b7280' }}>{persona.role}</div>
          </div>
        )}

        <main style={{ flex: 1, overflowY: 'auto', background: '#f9fafb', minWidth: 0 }}>
          <Suspense fallback={<div style={{ padding: '24px', color: '#6b7280', fontSize: '0.875rem' }}>Loading…</div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// ─── AppLayoutWrapper — routes ─────────────────────────────────────────────────
function AppLayoutWrapper() {
  const { role } = useRole();
  const { flag } = useFlags();

  const isGlobalAdmin  = role === 'GlobalAdmin';
  const isAdminOrAbove = role === 'Admin' || isGlobalAdmin;
  const isAgent        = role === 'Agent';
  const isBroker       = role === 'Broker';
  const defaultPath    = isBroker ? '/appointments' : '/leads';

  // Reports drill-down scope. Management and Supervisors are unrestricted (null);
  // self-service roles may open only their own record. Production derives this id
  // from the authenticated user — these values match the preview personas.
  const SELF_REPORT_ID = { Agent: 'tm', Broker: 'sb' };
  const selfReportId   = SELF_REPORT_ID[role] ?? null;

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

        {/* Analytics — all roles; self-service roles see only their own data */}
        <Route path="/reports" element={<Reports />} />
        <Route
          path="/reports/agent/:id"
          element={
            isBroker
              ? <Navigate to={defaultPath} replace />
              : <ReportDrillGuard selfId={isAgent ? selfReportId : null} fallback="/reports"><AgentDetail /></ReportDrillGuard>
          }
        />
        <Route
          path="/reports/broker/:id"
          element={
            isAgent
              ? <Navigate to={defaultPath} replace />
              : <ReportDrillGuard selfId={isBroker ? selfReportId : null} fallback="/reports"><BrokerDetail /></ReportDrillGuard>
          }
        />

        {/* Admin — gated by role */}
        <Route path="/admin/users" element={isAdminOrAbove ? <UserAdmin />  : <Navigate to={defaultPath} replace />} />
        <Route path="/admin/app"   element={isAdminOrAbove ? <AppAdmin />   : <Navigate to={defaultPath} replace />} />
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
