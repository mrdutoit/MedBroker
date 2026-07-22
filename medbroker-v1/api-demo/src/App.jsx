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
import { ThemeProvider, useTheme }          from './context/ThemeContext.jsx';
import { AuthProvider, useAuth }            from './context/AuthContext.jsx';
import { apiMode }                          from './services/api.js';
import { useWindowSize }                     from './hooks/useWindowSize.js';
import { Logo }                              from './components/Logo.jsx';
import Login                                 from './pages/Login.jsx';

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
const Settings          = lazy(() => import('./pages/Settings.jsx'));

// ─── Nav section label ─────────────────────────────────────────────────────────
const SECTION = {
  fontSize: '0.625rem', fontWeight: 700, color: 'var(--mut)',
  textTransform: 'uppercase', letterSpacing: '0.16em',
  padding: '14px 10px 5px', userSelect: 'none', opacity: 0.85,
};

// ─── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ to, label, badge, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 11px', borderRadius: '10px', textDecoration: 'none',
        fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400,
        color: 'var(--ink)',
        opacity: isActive ? 1 : 0.78,
        background: isActive ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'transparent'}`,
        transition: 'background 0.15s, opacity 0.15s',
      })}
    >
      <span>{label}</span>
      {badge != null && (
        <span style={{
          background: 'var(--accent)', color: 'white', borderRadius: '999px',
          fontSize: '0.625rem', fontWeight: 700, padding: '1px 7px',
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
  const { theme, setTheme, themes } = useTheme();
  const { demoMode, logout }        = useAuth();
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
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--body)', position: 'relative' }}>

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
        borderRight: isMobile ? 'none' : '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
        background: 'color-mix(in srgb, var(--panel) 78%, transparent)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        overflowY: 'auto', overflowX: 'hidden',
        transition: 'width 0.25s ease',
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
          boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.25)' : 'none',
        } : {}),
      }}>

        {/* Logo */}
        <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <Logo size={34} withWordmark />
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

          {/* Analytics — visible to all roles; self-service roles go to their own detail */}
          <div style={SECTION}>Analytics</div>
          <NavItem
            to={isAgent ? '/reports/agent/tm' : isBroker ? '/reports/broker/sb' : '/reports'}
            label="Reports"
            onClick={closeNav}
          />

          <div style={SECTION}>Account</div>
          <NavItem to="/settings" label="Settings" onClick={closeNav} />

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

        {/* ── Sidebar footer ─────────────────────────────────────────────── */}
        <div style={{ padding: '10px 10px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>

          {/* Theme switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '2px 4px 10px' }}>
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--mut)', marginRight: '2px' }}>Theme</span>
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                title={t.name}
                aria-label={`${t.name} theme`}
                style={{
                  width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})`,
                  border: `2px solid ${theme === t.id ? 'var(--ink)' : 'transparent'}`,
                  transform: theme === t.id ? 'scale(1.12)' : 'none', transition: '0.15s',
                }}
              />
            ))}
          </div>

          {demoMode ? (
            <div style={{
              background: 'color-mix(in srgb, var(--live) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--live) 34%, transparent)',
              borderRadius: '10px', padding: '7px 10px', marginBottom: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--live)' }}>
                ● Signed in
              </span>
              <button
                onClick={() => { logout(); closeNav(); }}
                style={{
                  background: 'none', border: '1px solid var(--line)', borderRadius: '7px',
                  padding: '3px 9px', fontSize: '0.6875rem', color: 'var(--ink)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Log out
              </button>
            </div>
          ) : (
            <div style={{
              background: 'color-mix(in srgb, var(--limited) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--limited) 34%, transparent)',
              borderRadius: '10px', padding: '7px 10px', marginBottom: '8px',
            }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--limited)', marginBottom: '5px' }}>
                ⚠ Preview mode
              </div>
              <select
                value={role}
                onChange={e => {
                  const next = e.target.value;
                  setRole(next);
                  navigate(next === 'Broker' ? '/appointments' : '/leads');
                  closeNav();
                }}
                style={{
                  width: '100%', border: '1px solid var(--line)', borderRadius: '7px',
                  padding: '4px 7px', fontSize: '0.75rem',
                  background: 'var(--glass)', color: 'var(--ink)',
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
          )}

          {/* Current user display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 6px' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6875rem', fontWeight: 700,
            }}>
              {persona.initials}
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)' }}>{persona.displayName}</div>
              <div style={{ fontSize: '0.625rem', color: 'var(--mut)' }}>{persona.role}</div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>

        {/* Mobile topbar */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'color-mix(in srgb, var(--panel) 70%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', fontSize: '1.375rem', cursor: 'pointer', color: 'var(--ink)', lineHeight: 1 }}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Logo size={22} />
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--ink)', letterSpacing: '-0.02em' }}>MedBroker</span>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--mut)' }}>{persona.role}</div>
          </div>
        )}

        <main style={{ flex: 1, overflowY: 'auto', background: 'transparent', minWidth: 0 }}>
          <Suspense fallback={<div style={{ padding: '24px', color: 'var(--mut)', fontSize: '0.875rem' }}>Loading…</div>}>
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

  // Self-service roles skip the Reports overview and land on their own detail.
  // Management and Supervisors get the overview so they can choose what to view.
  const reportsLanding =
      isAgent  ? `/reports/agent/${SELF_REPORT_ID.Agent}`
    : isBroker ? `/reports/broker/${SELF_REPORT_ID.Broker}`
    :            null;

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

        {/* Account — all roles */}
        <Route path="/settings"      element={<Settings />} />

        {/* Analytics — all roles; self-service roles see only their own data */}
        <Route path="/reports" element={reportsLanding ? <Navigate to={reportsLanding} replace /> : <Reports />} />
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

// ─── Auth gate — only meaningful in demo-backend mode ──────────────────────────
function AuthGate() {
  const { isAuthenticated } = useAuth();

  if (apiMode.DEMO_MODE && !isAuthenticated) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <AppLayoutWrapper />
    </BrowserRouter>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RoleProvider>
          <FlagProvider>
            <AuthGate />
          </FlagProvider>
        </RoleProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
