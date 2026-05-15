/**
 * App.jsx
 * Application root — MSAL authentication provider + React Router setup.
 * All routes are protected by Entra ID authentication via MSAL.
 */

import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { msalInstance, loginRequest } from './services/authConfig.js';
import LeadList from './pages/LeadList.jsx';

// Lazy-load additional pages to keep the initial bundle small
import { lazy, Suspense } from 'react';
const LeadDetail       = lazy(() => import('./pages/LeadDetail.jsx'));
const LeadImport       = lazy(() => import('./pages/LeadImport.jsx'));
const AppointmentList  = lazy(() => import('./pages/AppointmentList.jsx'));
const EventList        = lazy(() => import('./pages/EventList.jsx'));
const EventDetail      = lazy(() => import('./pages/EventDetail.jsx'));
const Reports          = lazy(() => import('./pages/Reports.jsx'));
const UserAdmin        = lazy(() => import('./pages/UserAdmin.jsx'));

function SignInPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '16px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>MedBroker</h1>
      <p style={{ color: '#6b7280', margin: 0 }}>Lead Management System</p>
      <button
        onClick={() => msalInstance.loginRedirect(loginRequest)}
        style={{
          background: '#1d4ed8', color: 'white', border: 'none',
          borderRadius: '6px', padding: '10px 24px', cursor: 'pointer',
          fontSize: '1rem', fontWeight: 500, marginTop: '8px',
        }}
      >
        Sign in with Microsoft
      </button>
    </div>
  );
}

function AppLayout({ children }) {
  const navStyle = ({ isActive }) => ({
    display: 'block',
    padding: '8px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
    color: isActive ? '#1d4ed8' : '#374151',
    background: isActive ? '#eff6ff' : 'transparent',
    fontWeight: isActive ? 600 : 400,
    fontSize: '0.875rem',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <nav style={{
        width: '220px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
        padding: '24px 12px', display: 'flex', flexDirection: 'column', gap: '4px',
        background: 'white',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111827', marginBottom: '20px', padding: '0 4px' }}>
          MedBroker
        </div>
        <NavLink to="/leads"        style={navStyle}>Leads</NavLink>
        <NavLink to="/appointments" style={navStyle}>Appointments</NavLink>
        <NavLink to="/events"       style={navStyle}>Events</NavLink>
        <NavLink to="/reports"      style={navStyle}>Reports</NavLink>
        <NavLink to="/admin/users"  style={navStyle}>User Admin</NavLink>
        <div style={{ marginTop: 'auto' }}>
          <button
            onClick={() => msalInstance.logoutRedirect()}
            style={{
              width: '100%', background: 'none', border: '1px solid #e5e7eb',
              borderRadius: '6px', padding: '8px', cursor: 'pointer',
              fontSize: '0.875rem', color: '#6b7280',
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', background: '#f9fafb' }}>
        <Suspense fallback={<div style={{ padding: '24px', color: '#6b7280' }}>Loading...</div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <BrowserRouter>
        <UnauthenticatedTemplate>
          <SignInPage />
        </UnauthenticatedTemplate>

        <AuthenticatedTemplate>
          <AppLayout>
            <Routes>
              <Route path="/"                  element={<Navigate to="/leads" replace />} />
              <Route path="/leads"             element={<LeadList />} />
              <Route path="/leads/import"      element={<LeadImport />} />
              <Route path="/leads/:id"         element={<LeadDetail />} />
              <Route path="/appointments"      element={<AppointmentList />} />
              <Route path="/events"            element={<EventList />} />
              <Route path="/events/:id"        element={<EventDetail />} />
              <Route path="/reports"           element={<Reports />} />
              <Route path="/admin/users"       element={<UserAdmin />} />
            </Routes>
          </AppLayout>
        </AuthenticatedTemplate>
      </BrowserRouter>
    </MsalProvider>
  );
}
