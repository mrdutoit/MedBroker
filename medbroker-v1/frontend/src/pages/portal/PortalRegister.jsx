/**
 * pages/portal/PortalRegister.jsx — NEW, 24 Jul 2026.
 * Reached at /portal/register/:qrToken — either a phone camera opening
 * the URL directly (the QR encodes this URL, nothing QR-specific needed
 * here) or the same link shared via WhatsApp/email (Mark's ask — no
 * physical scan required to register).
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { PortalCard } from '../../components/PortalCard.jsx';
import { useProspectAuth } from '../../context/ProspectAuthContext.jsx';
import { portalApi } from '../../services/portalApi.js';
import { TITLES, JOB_TITLES } from '../../constants/leadOptions.js';
import { s } from '../../styles/tokens.js';

export default function PortalRegister() {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  const { registerAndLogin, loading, error, setError } = useProspectAuth();

  const [event, setEvent] = useState(null);
  const [eventError, setEventError] = useState('');
  const [loadingEvent, setLoadingEvent] = useState(true);

  const [form, setForm] = useState({
    title: '', firstName: '', lastName: '', dateOfBirth: '',
    email: '', mobileNumber: '', occupation: '', password: '', confirmPassword: '',
  });
  const [popiConsent, setPopiConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    portalApi.getEvent(qrToken)
      .then(data => { if (!cancelled) setEvent(data.event); })
      .catch(err => { if (!cancelled) setEventError(err.message ?? 'This registration link is not valid.'); })
      .finally(() => { if (!cancelled) setLoadingEvent(false); });
    return () => { cancelled = true; };
  }, [qrToken]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const { confirmPassword, ...profileData } = form;
      await registerAndLogin(qrToken, { ...profileData, popiConsent }, form.password);
      navigate('/portal/dashboard', { replace: true });
    } catch {
      // error already set on context
    }
  }

  if (loadingEvent) {
    return <PortalCard title="Loading…" />;
  }
  if (eventError) {
    return (
      <PortalCard title="Registration unavailable">
        <div style={s.errorBox}>{eventError}</div>
      </PortalCard>
    );
  }

  return (
    <PortalCard
      title={`Register for ${event.name}`}
      subtitle={[event.university, format(new Date(event.eventDate), 'd MMMM yyyy'), event.venue].filter(Boolean).join(' · ')}
      width="440px"
    >
      {error && <div style={{ ...s.errorBox, marginBottom: '16px' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.formLabel}>Title *</label>
            <select value={form.title} onChange={set('title')} style={s.select} required>
              <option value="">–</option>
              {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={s.formLabel}>First Name *</label>
            <input value={form.firstName} onChange={set('firstName')} style={s.formInput} required />
          </div>
          <div>
            <label style={s.formLabel}>Last Name *</label>
            <input value={form.lastName} onChange={set('lastName')} style={s.formInput} required />
          </div>
        </div>

        <div style={s.formGroup}>
          <label style={s.formLabel}>Date of Birth *</label>
          <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} style={s.formInput} required />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Email *</label>
          <input type="email" autoComplete="username" value={form.email} onChange={set('email')} style={s.formInput} required />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Mobile Number *</label>
          <input value={form.mobileNumber} onChange={set('mobileNumber')} style={s.formInput} placeholder="0821234567" required />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Job Title *</label>
          <select value={form.occupation} onChange={set('occupation')} style={s.select} required>
            <option value="">Select…</option>
            {JOB_TITLES.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Password *</label>
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} style={s.formInput} required minLength={12} />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Confirm Password *</label>
          <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} style={s.formInput} required minLength={12} />
        </div>

        <div style={{ ...s.formGroup, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <input
            type="checkbox"
            id="popi-consent"
            checked={popiConsent}
            onChange={e => setPopiConsent(e.target.checked)}
            style={{ marginTop: '3px' }}
          />
          <label htmlFor="popi-consent" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>
            I consent to my details being captured and used to contact me about the products I've registered interest in. *
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !popiConsent}
          style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', marginTop: '6px' }}
        >
          {loading ? 'Registering…' : 'Register'}
        </button>
      </form>

      <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center', marginTop: '16px' }}>
        Already registered? <Link to="/portal/login" style={{ color: 'var(--accent)' }}>Log in</Link>
      </p>
    </PortalCard>
  );
}
