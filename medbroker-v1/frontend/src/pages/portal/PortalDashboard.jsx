/**
 * pages/portal/PortalDashboard.jsx — NEW, 24 Jul 2026.
 * Narrow v1 scope, agreed with Mark: appointment status + assigned
 * broker's display name only (not their contact details) + edit own
 * contact details. Medical aid/existing cover/ID number stay out —
 * deferred to a real POPIA SAR flow rather than ad hoc partial access.
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { format } from 'date-fns';
import { useProspectAuth } from '../../context/ProspectAuthContext.jsx';
import { portalApi } from '../../services/portalApi.js';
import { ATTENDANCE_META } from '../../constants/portalAttendance.js';
import { s } from '../../styles/tokens.js';

const STATUS_LABEL = {
  Unassigned:   'Not yet assigned to a broker',
  Assigned:     'Assigned — awaiting first contact',
  InProgress:   'In progress',
  ClosedWon:    'Completed',
  ClosedLost:   'Closed',
  Claimed:      'In progress',
  ReturnedToLeads: 'Being re-matched to a broker',
};

export default function PortalDashboard() {
  const navigate = useNavigate();
  const { logout } = useProspectAuth();
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ email: '', mobileNumber: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  function load() {
    setLoading(true);
    portalApi.getMe()
      .then(data => {
        setProfile(data.profile);
        setEvents(data.events ?? []);
        setForm({ email: data.profile.email ?? '', mobileNumber: data.profile.mobileNumber ?? '' });
      })
      .catch(err => setLoadError(err.message ?? 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleLogout() {
    logout();
    navigate('/portal/login', { replace: true });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      const data = await portalApi.updateMe(form);
      setProfile(data.profile);
      setEditing(false);
      setSaveOk(true);
    } catch (err) {
      setSaveError(err.message ?? 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mut)' }}>Loading…</div>;
  if (loadError) return (
    <div style={{ padding: '24px', maxWidth: '480px', margin: '0 auto' }}>
      <div style={s.errorBox}>{loadError}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
            Hi {profile.firstName}
          </h1>
          <button onClick={handleLogout} style={s.secondaryBtn}>Log out</button>
        </div>

        <div style={{ ...s.card, marginBottom: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            Appointment status
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: profile.brokerName ? '10px' : 0 }}>
            {profile.appointmentStatus ? (STATUS_LABEL[profile.appointmentStatus] ?? profile.appointmentStatus) : 'No appointment booked yet'}
          </div>
          {profile.brokerName && (
            <div style={{ fontSize: '0.875rem', color: 'var(--mut)' }}>
              Your broker: <strong style={{ color: 'var(--ink)' }}>{profile.brokerName}</strong>
            </div>
          )}
        </div>

        <div style={{ ...s.card, marginBottom: '16px' }}>
          <Link to="/portal/check-in" style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', display: 'flex', textDecoration: 'none' }}>
            Check in to an event
          </Link>
        </div>

        {events.length > 0 && (
          <div style={{ ...s.card, marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              Your Events
            </div>
            {events.map((ev, i) => {
              const attendanceType = ev.attended ? (ev.rsvp ? 'rsvp' : 'walkin') : 'registered';
              const meta = ATTENDANCE_META[attendanceType];
              // Only an already-confirmed attendance is safe to make
              // clickable — checkinProspect() is idempotent for a REPEAT
              // visit, so revisiting just re-shows the banner. Clicking a
              // 'registered' (not yet checked in) row would otherwise
              // silently trigger a real check-in as a side effect of
              // browsing the dashboard, which isn't the ask and would be
              // a real bug — those rows stay static.
              const clickable = ev.attended;
              return (
                <div
                  key={ev.eventId}
                  onClick={clickable ? () => navigate(`/portal/checkin/${ev.checkinToken}`) : undefined}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: i < events.length - 1 ? '1px solid var(--line)' : 'none',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink)' }}>{ev.eventName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--mut)' }}>{format(new Date(ev.eventDate), 'd MMM yyyy')}</div>
                  </div>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                    fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap',
                    background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
                  }}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Your contact details
            </div>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ ...s.secondaryBtn, padding: '4px 10px', fontSize: '0.75rem' }}>Edit</button>
            )}
          </div>

          {saveOk && !editing && (
            <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>Your details have been updated.</div>
          )}

          {editing ? (
            <form onSubmit={handleSave}>
              {saveError && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{saveError}</div>}
              <div style={s.formGroup}>
                <label style={s.formLabel}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={s.formInput}
                  required
                />
              </div>
              <div style={s.formGroup}>
                <label style={s.formLabel}>Mobile Number</label>
                <input
                  value={form.mobileNumber}
                  onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value }))}
                  style={s.formInput}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setEditing(false)} style={{ ...s.secondaryBtn, background: 'none', border: 'none' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={s.primaryBtn}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div style={{ fontSize: '0.875rem', color: 'var(--ink)', marginBottom: '4px' }}>{profile.email}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>{profile.mobileNumber}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
