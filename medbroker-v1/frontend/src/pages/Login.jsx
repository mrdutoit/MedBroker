/**
 * pages/Login.jsx
 * Local email/password login. Rendered by App.jsx's AuthGate whenever
 * there's no authenticated session.
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { s, colors, radius } from '../styles/tokens.js';

export default function Login() {
  const { login, loading, error, setError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
