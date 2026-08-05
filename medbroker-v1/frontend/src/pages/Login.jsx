/**
 * pages/Login.jsx
 * Local email/password login. Rendered by App.jsx's AuthGate whenever
 * there's no authenticated session.
 *
 * UPDATED §120 (4 Aug 2026, SSO stage 4): "Sign in with Microsoft" added
 * below the local form, shown only when auth.sso.enabled is on (checked
 * via GET /api/flags, genuinely public — no auth required, see
 * flagHandlers.js — so this works before any session exists). Off by
 * default; local email/password stays the only option until a
 * deployment's GlobalAdmin turns SSO on for that customer.
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { s, colors, radius } from '../styles/tokens.js';

export default function Login() {
  const { login, ssoLogin, loading, error, setError } = useAuth();
  const { flag } = useFlags();
  const ssoEnabled = flag('auth.sso.enabled');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      // Success — AuthContext's user state flips, App.jsx re-renders. If
      // passwordMustChange is true, AuthGate renders <ChangePassword
      // forced /> instead of the app itself — built in §72, nothing
      // further needed here.
    } catch {
      // error is already set on the context by login(); nothing else to do here.
    }
  }

  // Separate loading flag from AuthContext's own `loading` — that one
  // also covers the local-password submit button above, and disabling
  // BOTH buttons while only one form is actually in flight would be
  // confusing (e.g. the password field greying out while a Microsoft
  // popup is open, for no reason relevant to it).
  async function handleSsoSignIn() {
    setError(null);
    setSsoLoading(true);
    try {
      await ssoLogin();
    } catch {
      // error is already set on the context by ssoLogin(); nothing else to do here.
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{
        width: '380px', maxWidth: '100%',
        background: colors.surface, border: `1px solid ${colors.line}`,
        borderRadius: radius.lg, padding: '32px', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <Logo size={36} withWordmark />
        </div>

        <h1 style={{ ...s.pageTitle, fontSize: '1.125rem', textAlign: 'center', marginBottom: '4px' }}>
          Sign in
        </h1>
        <p style={{ ...s.pageSubtitle, textAlign: 'center', marginBottom: '22px' }}>
          MedBroker demo
        </p>

        {error && (
          <div style={{ ...s.errorBox, marginBottom: '16px' }}>{error}</div>
        )}

        {ssoEnabled && (
          <>
            <button
              type="button"
              onClick={handleSsoSignIn}
              disabled={ssoLoading}
              style={{
                ...s.secondaryBtn, width: '100%', justifyContent: 'center',
                marginBottom: '18px', opacity: ssoLoading ? 0.6 : 1,
              }}
            >
              {ssoLoading ? 'Opening Microsoft sign-in…' : 'Sign in with Microsoft'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 18px' }}>
              <div style={{ flex: 1, height: '1px', background: colors.line }} />
              <span style={{ fontSize: '0.75rem', color: colors.ink500 }}>or</span>
              <div style={{ flex: 1, height: '1px', background: colors.line }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div style={s.formGroup}>
            <label style={s.formLabel} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              style={s.formInput}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.formLabel} htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                style={{ ...s.formInput, paddingRight: '56px' }}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: colors.ink500,
                  fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', padding: '4px',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', marginTop: '6px' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
