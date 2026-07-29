/**
 * pages/portal/PortalActivate.jsx — NEW, 24 Jul 2026.
 * Fixes the gap Mark found: registration (PortalRegister.jsx) is entirely
 * event-anchored, so a manually-added attendee (Add Attendee, no portal
 * account created) had no way to get portal access once no event was
 * currently active. This page needs no qrToken — verifies email + date
 * of birth against an existing Lead instead.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { PortalCard } from '../../components/PortalCard.jsx';
import { useProspectAuth } from '../../context/ProspectAuthContext.jsx';
import { s } from '../../styles/tokens.js';

export default function PortalActivate() {
  const navigate = useNavigate();
  const { activateAccount, loading, error, setError } = useProspectAuth();
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await activateAccount(email, dateOfBirth, password);
      navigate('/portal/dashboard', { replace: true });
    } catch {
      // error already set on context
    }
  }

  return (
    <PortalCard
      title="Activate your account"
      subtitle="For attendees registered by a broker or agent, without portal access yet"
    >
      {error && <div style={{ ...s.errorBox, marginBottom: '16px' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={s.formGroup}>
          <label style={s.formLabel} htmlFor="activate-email">Email</label>
          <input
            id="activate-email"
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
          <label style={s.formLabel} htmlFor="activate-dob">Date of Birth</label>
          <input
            id="activate-dob"
            type="date"
            style={s.formInput}
            value={dateOfBirth}
            onChange={e => setDateOfBirth(e.target.value)}
            required
          />
          <p style={s.formHint}>Must match what was captured when you registered.</p>
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel} htmlFor="activate-password">Choose a Password</label>
          <input
            id="activate-password"
            type="password"
            autoComplete="new-password"
            style={s.formInput}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={12}
          />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel} htmlFor="activate-confirm">Confirm Password</label>
          <input
            id="activate-confirm"
            type="password"
            autoComplete="new-password"
            style={s.formInput}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={12}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', marginTop: '6px' }}
        >
          {loading ? 'Activating…' : 'Activate Account'}
        </button>
      </form>
      <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center', marginTop: '16px' }}>
        Already have an account? <Link to="/portal/login" style={{ color: 'var(--accent)' }}>Log in</Link>
      </p>
    </PortalCard>
  );
}
