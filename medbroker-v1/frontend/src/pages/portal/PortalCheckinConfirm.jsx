/**
 * pages/portal/PortalCheckinConfirm.jsx — NEW, 24 Jul 2026.
 * The page Event.checkinToken's URL actually points at
 * ({origin}/portal/checkin/:checkinToken) — reachable by a phone camera
 * opening the attendance QR directly, or by the in-app scanner
 * (PortalCheckIn.jsx) navigating here after decoding a scan. Public route
 * (not gated behind PortalProtectedRoute) because it has to work for a
 * genuine walk-in with no account at all, not just an already-logged-in
 * prospect.
 *
 * Two entirely different bodies depending on auth state:
 *   - Logged in: auto-confirms attendance on mount, shows a GREEN
 *     "RSVP Attendance" banner if they'd already RSVP'd, or a PINK
 *     "Walk-In Attendance" banner if they hadn't (Mark's explicit
 *     colour/copy split).
 *   - Not logged in: on-the-spot signup form — same required fields as
 *     registration (this still creates a real Lead + LeadPortalAccount,
 *     "quick" means fewer steps, not fewer fields), then immediately
 *     shows the PINK walk-in banner — a true walk-in by definition never
 *     RSVP'd.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router';
import { format } from 'date-fns';
import { PortalCard } from '../../components/PortalCard.jsx';
import { useProspectAuth } from '../../context/ProspectAuthContext.jsx';
import { portalApi } from '../../services/portalApi.js';
import { TITLES, JOB_TITLES } from '../../constants/leadOptions.js';
import { ATTENDANCE_META } from '../../constants/portalAttendance.js';
import { s } from '../../styles/tokens.js';

function AttendanceBanner({ attendanceType, alreadyCheckedIn }) {
  const meta = ATTENDANCE_META[attendanceType] ?? ATTENDANCE_META.walkin;
  return (
    <div style={{
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
      borderRadius: '10px', padding: '16px', textAlign: 'center', fontWeight: 600,
    }}>
      {meta.label}
      <div style={{ fontWeight: 400, fontSize: '0.8125rem', marginTop: '4px' }}>
        {alreadyCheckedIn ? "You're already checked in for this event." : "You're checked in — enjoy the event!"}
      </div>
    </div>
  );
}

export default function PortalCheckinConfirm() {
  const { checkinToken } = useParams();
  const { isAuthenticated, walkInAndLogin, loading, error, setError } = useProspectAuth();

  const [event, setEvent] = useState(null);
  const [eventError, setEventError] = useState('');
  const [loadingEvent, setLoadingEvent] = useState(true);

  const [confirmResult, setConfirmResult] = useState(null);
  const [confirmError, setConfirmError] = useState('');
  const confirmFired = useRef(false);

  const [form, setForm] = useState({
    title: '', firstName: '', lastName: '', dateOfBirth: '',
    email: '', mobileNumber: '', occupation: '', password: '', confirmPassword: '',
  });
  const [popiConsent, setPopiConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    portalApi.getCheckinEvent(checkinToken)
      .then(data => { if (!cancelled) setEvent(data.event); })
      .catch(err => { if (!cancelled) setEventError(err.message ?? 'This check-in code is not valid.'); })
      .finally(() => { if (!cancelled) setLoadingEvent(false); });
    return () => { cancelled = true; };
  }, [checkinToken]);

  // Already logged in — auto-confirm attendance once the event context is
  // loaded. confirmFired guards against a double-fire from React strict
  // re-renders rather than relying on state (which would need to be in
  // the dependency array, re-triggering the effect on its own change).
  useEffect(() => {
    if (!isAuthenticated || !event || confirmFired.current) return;
    confirmFired.current = true;
    portalApi.checkin(checkinToken)
      .then(setConfirmResult)
      .catch(err => setConfirmError(err.message ?? 'Could not confirm your attendance.'));
  }, [isAuthenticated, event, checkinToken]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleWalkInSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const { confirmPassword, ...profileData } = form;
      const data = await walkInAndLogin(checkinToken, profileData, form.password);
      confirmFired.current = true; // don't let the auto-confirm effect also fire now that we're authenticated
      setConfirmResult({ ok: true, alreadyCheckedIn: false, attendanceType: data.attendanceType });
    } catch {
      // error already set on context
    }
  }

  if (loadingEvent) return <PortalCard title="Loading…" />;
  if (eventError) return (
    <PortalCard title="Check-in unavailable">
      <div style={s.errorBox}>{eventError}</div>
    </PortalCard>
  );

  const subtitle = [event.university, format(new Date(event.eventDate), 'd MMMM yyyy'), event.venue].filter(Boolean).join(' · ');

  // Logged in — auto-confirm path
  if (isAuthenticated) {
    return (
      <PortalCard title={event.name} subtitle={subtitle}>
        {confirmError && <div style={s.errorBox}>{confirmError}</div>}
        {!confirmError && !confirmResult && <p style={{ textAlign: 'center', color: 'var(--mut)' }}>Confirming your attendance…</p>}
        {confirmResult && (
          <AttendanceBanner attendanceType={confirmResult.attendanceType} alreadyCheckedIn={confirmResult.alreadyCheckedIn} />
        )}
        <p style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link to="/portal/dashboard" style={{ color: 'var(--accent)', fontSize: '0.8125rem' }}>Go to your dashboard</Link>
        </p>
      </PortalCard>
    );
  }

  // Not logged in — walk-in signup
  if (confirmResult) {
    return (
      <PortalCard title={event.name} subtitle={subtitle}>
        <AttendanceBanner attendanceType={confirmResult.attendanceType} alreadyCheckedIn={confirmResult.alreadyCheckedIn} />
        <p style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link to="/portal/dashboard" style={{ color: 'var(--accent)', fontSize: '0.8125rem' }}>Go to your dashboard</Link>
        </p>
      </PortalCard>
    );
  }

  return (
    <PortalCard title={`Check in — ${event.name}`} subtitle={subtitle} width="440px">
      <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center', marginBottom: '8px' }}>
        Already have an account? <Link to="/portal/login" style={{ color: 'var(--accent)' }}>Log in</Link>, then scan again.
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center', marginBottom: '16px' }}>
        Didn't register beforehand? Quick details and you're checked in.
      </p>

      {error && <div style={{ ...s.errorBox, marginBottom: '16px' }}>{error}</div>}

      <form onSubmit={handleWalkInSubmit}>
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
          <label style={s.formLabel}>Choose a Password *</label>
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} style={s.formInput} required minLength={12} />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Confirm Password *</label>
          <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} style={s.formInput} required minLength={12} />
        </div>

        <div style={{ ...s.formGroup, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <input
            type="checkbox"
            id="walkin-popi-consent"
            checked={popiConsent}
            onChange={e => setPopiConsent(e.target.checked)}
            style={{ marginTop: '3px' }}
          />
          <label htmlFor="walkin-popi-consent" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>
            I consent to my details being captured and used to contact me about the products I've registered interest in. *
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !popiConsent}
          style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', marginTop: '6px' }}
        >
          {loading ? 'Checking in…' : 'Check In'}
        </button>
      </form>
    </PortalCard>
  );
}
