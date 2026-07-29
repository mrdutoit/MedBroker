/**
 * pages/portal/PortalLogin.jsx — NEW, 24 Jul 2026.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { PortalCard } from '../../components/PortalCard.jsx';
import { useProspectAuth } from '../../context/ProspectAuthContext.jsx';
import { s } from '../../styles/tokens.js';

export default function PortalLogin() {
  const navigate = useNavigate();
  const { login, loading, error, setError } = useProspectAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/portal/dashboard', { replace: true });
    } catch {
      // error already set on context
    }
  }

  return (
    <PortalCard title="Log in" subtitle="Access your registration and appointment status">
      {error && <div style={{ ...s.errorBox, marginBottom: '16px' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={s.formGroup}>
          <label style={s.formLabel} htmlFor="portal-email">Email</label>
          <input
            id="portal-email"
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
          <label style={s.formLabel} htmlFor="portal-password">Password</label>
          <input
            id="portal-password"
            type="password"
            autoComplete="current-password"
            style={s.formInput}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', marginTop: '6px' }}
        >
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center', marginTop: '16px' }}>
        Registered by a broker or agent but don't have an account yet?{' '}
        <Link to="/portal/activate" style={{ color: 'var(--accent)' }}>Activate your account</Link>
      </p>
    </PortalCard>
  );
}
