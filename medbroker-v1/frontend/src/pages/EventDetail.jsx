/**
 * pages/EventDetail.jsx
 * Single event view — attendee list, RSVP vs walk-in breakdown, real QR
 * code, status transitions, and report export.
 *
 * Rewired to real data, 24 Jul 2026. The QR code now renders event.qrToken
 * as an actual scannable image (qrcode package, client-side) rather than a
 * decorative placeholder SVG — this is the prerequisite for the Lead
 * Portal's registration flow (next build): the encoded URL points at
 * /portal/register/:qrToken, which will go live once that page exists.
 * Share-via-WhatsApp/Email buttons use the same URL — Mark's ask that
 * registration not be gated to a physical scan at the event.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch } from '../hooks/useFetch.js';
import { useRole } from '../context/RoleContext.jsx';
import { eventsApi } from '../services/api.js';
import { TITLES, JOB_TITLES } from '../constants/leadOptions.js';

// Mirrors ALLOWED_STATUS_TRANSITIONS in api-lib/models/event.js — kept as a
// small, separate copy rather than importing backend code into the Vite
// bundle (api-lib is deliberately excluded from the frontend build, see
// Status.md §24.2). Update both together if transitions ever change.
const NEXT_STATUS_ACTIONS = {
  Draft:     [{ status: 'Active',    label: 'Activate Event' },  { status: 'Cancelled', label: 'Cancel Event' }],
  Active:    [{ status: 'Closed',    label: 'Close Event' },      { status: 'Cancelled', label: 'Cancel Event' }],
  Closed:    [{ status: 'Active',    label: 'Reopen Event' }],
  Cancelled: [{ status: 'Draft',     label: 'Reactivate as Draft' }],
};

function YesNo({ value }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: '20px',
      fontSize: '0.75rem', fontWeight: 500,
      background: value ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel2)',
      color:      value ? '#15803d' : 'var(--mut)',
    }}>
      {value ? 'Yes' : 'No'}
    </span>
  );
}

function toCsv(event, attendees) {
  const header = ['Name', 'Email', 'Occupation', 'RSVP', 'Attended', 'Attended At', 'Registered'];
  const rows = attendees.map(a => [
    a.name, a.email, a.occupation ?? '',
    a.rsvp ? 'Yes' : 'No', a.attended ? 'Yes' : 'No',
    a.attendedAt ? format(new Date(a.attendedAt), 'yyyy-MM-dd HH:mm') : '',
    format(new Date(a.registeredAt), 'yyyy-MM-dd HH:mm'),
  ]);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

function AddAttendeeModal({ eventId, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', firstName: '', lastName: '', dateOfBirth: '',
    email: '', mobileNumber: '', occupation: '', attended: false,
  });
  const [popiConsentConfirmed, setPopiConsentConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await eventsApi.addAttendee(eventId, { ...form, popiConsentConfirmed });
      setResult(res);
      await onSaved?.();
    } catch (err) {
      setError(err.message ?? 'Could not add attendee.');
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '440px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Add Attendee</h2>
          <button onClick={onClose} style={s.closeBtn}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {result ? (
          <>
            <div style={{ ...s.noticeSuccess, marginBottom: '14px' }}>
              {result.alreadyRegistered
                ? 'This person is already registered for this event.'
                : result.createdNewLead
                  ? 'Attendee added — a new Lead record was created and linked to this event.'
                  : 'Attendee added — matched to an existing Lead record.'}
            </div>
            <div style={s.modalFooter}>
              <button onClick={onClose} style={s.primaryBtn}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}

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
              <input type="email" value={form.email} onChange={set('email')} style={s.formInput} required />
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
            <div style={{ ...s.formGroup, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="attended-now"
                checked={form.attended}
                onChange={e => setForm(f => ({ ...f, attended: e.target.checked }))}
              />
              <label htmlFor="attended-now" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>
                Mark as attended now (they're here at the venue)
              </label>
            </div>
            <div style={{ ...s.formGroup, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <input
                type="checkbox"
                id="popi-consent"
                checked={popiConsentConfirmed}
                onChange={e => setPopiConsentConfirmed(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <label htmlFor="popi-consent" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>
                I confirm this person has given POPIA consent to have their details captured. *
              </label>
            </div>

            <div style={s.modalFooter}>
              <button type="button" onClick={onClose} style={{ ...s.secondaryBtn, background: 'none', border: 'none' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !popiConsentConfirmed} style={s.primaryBtn}>
                {saving ? 'Adding…' : 'Add Attendee'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isMobile } = useWindowSize();
  const { role } = useRole();
  const isAdmin      = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const canManage    = isAdmin || isSupervisor;

  const { data, loading, error, refetch } = useFetch(() => eventsApi.get(id), [id]);
  const event = data?.event ?? null;
  const attendees = data?.attendees ?? [];

  const [attendeeFilter, setAttendeeFilter] = useState('all');
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showAttendanceQr, setShowAttendanceQr] = useState(false);
  const [attendanceQrDataUrl, setAttendanceQrDataUrl] = useState('');
  const [statusChanging, setStatusChanging] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [showAddAttendee, setShowAddAttendee] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const regUrl = event ? `${window.location.origin}/portal/register/${event.qrToken}` : '';
  // Deliberately a DIFFERENT URL/token from regUrl above — see
  // Event.checkinToken's schema comment for why sharing a single token
  // between pre-event registration and on-the-day attendance would be a
  // real gap (anyone who ever received the registration link could
  // "check in" from anywhere, no proof they were at the venue).
  const checkinUrl = event ? `${window.location.origin}/portal/checkin/${event.checkinToken}` : '';

  useEffect(() => {
    if (!showQr || !regUrl) return;
    QRCode.toDataURL(regUrl, { width: 320, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [showQr, regUrl]);

  useEffect(() => {
    if (!showAttendanceQr || !checkinUrl) return;
    QRCode.toDataURL(checkinUrl, { width: 320, margin: 2 })
      .then(setAttendanceQrDataUrl)
      .catch(() => setAttendanceQrDataUrl(''));
  }, [showAttendanceQr, checkinUrl]);

  async function handleStatusChange(newStatus) {
    setStatusChanging(true);
    setStatusError('');
    try {
      await eventsApi.updateStatus(id, newStatus);
      await refetch();
    } catch (err) {
      setStatusError(err.message ?? 'Could not update status.');
    } finally {
      setStatusChanging(false);
    }
  }

  function handleDownloadPng() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${event.name.replace(/[^a-z0-9]+/gi, '-')}-qr.png`;
    a.click();
  }

  function handleDownloadAttendancePng() {
    if (!attendanceQrDataUrl) return;
    const a = document.createElement('a');
    a.href = attendanceQrDataUrl;
    a.download = `${event.name.replace(/[^a-z0-9]+/gi, '-')}-attendance-qr.png`;
    a.click();
  }

  async function handleDownloadReport() {
    const report = await eventsApi.report(id);
    const csv = toCsv(report.event, report.attendees);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.event.name.replace(/[^a-z0-9]+/gi, '-')}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Register for ${event.name}: ${regUrl}`)}`, '_blank');
  }
  function shareEmail() {
    window.location.href = `mailto:?subject=${encodeURIComponent(`Register for ${event.name}`)}&body=${encodeURIComponent(`You're invited — register here: ${regUrl}`)}`;
  }

  async function handleToggleAttendance(attendee) {
    setTogglingId(attendee.id);
    try {
      await eventsApi.setAttendance(id, attendee.id, !attendee.attended);
      await refetch();
    } catch (err) {
      setStatusError(err.message ?? 'Could not update attendance.');
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--mut)' }}>Loading event…</div>;
  if (error) return (
    <div style={{ padding: '24px' }}>
      <div style={s.errorBox}>Could not load this event: {error.message}</div>
      <button onClick={() => refetch()} style={{ ...s.secondaryBtn, marginTop: '12px' }}>Try again</button>
    </div>
  );
  if (!event) return <div style={{ padding: '24px', color: 'var(--mut)' }}>Event not found.</div>;

  // "No-show" only means something once the event is over — before that,
  // someone who RSVP'd but hasn't checked in yet might still show up.
  // Mark's explicit ask: don't brand a manually-added attendee (or anyone
  // else) a no-show the moment they're added while the event is still
  // Draft/Active — only once Closed does an unconfirmed RSVP become one.
  const isClosed = event.status === 'Closed';
  const pendingCheckinLabel = isClosed ? 'No-shows' : 'Not Checked In';

  const filtered = attendees.filter(a => {
    if (attendeeFilter === 'rsvp')     return a.rsvp;
    if (attendeeFilter === 'walkin')   return !a.rsvp && a.attended;
    if (attendeeFilter === 'noshow')   return a.rsvp && !a.attended;
    if (attendeeFilter === 'attended') return a.attended;
    return true;
  });

  const noShows = event.rsvpCount - event.attendedCount;
  const attendancePct = event.rsvpCount > 0
    ? Math.round(((event.attendedCount + event.walkinCount) / event.rsvpCount) * 100)
    : 0;
  const nextActions = NEXT_STATUS_ACTIONS[event.status] ?? [];

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px' }}>

      {/* Header */}
      <button onClick={() => navigate('/events')} style={s.backBtn}>← Back to Events</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '8px 0 20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color:'var(--ink)', margin: '0 0 4px' }}>{event.name}</h1>
          <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
            {[event.university, format(new Date(event.eventDate), 'd MMMM yyyy'), event.venue].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {event.status === 'Active' && (
            <button onClick={() => setShowQr(true)} style={s.primaryBtn}>Show Registration QR</button>
          )}
          {event.status === 'Active' && (
            <button onClick={() => setShowAttendanceQr(true)} style={s.secondaryBtn}>Show Attendance QR</button>
          )}
          {canManage && event.status === 'Active' && (
            <button onClick={() => setShowAddAttendee(true)} style={s.secondaryBtn}>+ Add Attendee</button>
          )}
          <button onClick={handleDownloadReport} style={s.secondaryBtn}>Download Report</button>
          {canManage && nextActions.map(a => (
            <button
              key={a.status}
              disabled={statusChanging}
              onClick={() => handleStatusChange(a.status)}
              style={a.status === 'Cancelled' ? s.dangerBtn : s.secondaryBtn}
            >
              {statusChanging ? 'Updating…' : a.label}
            </button>
          ))}
        </div>
      </div>

      {statusError && <div style={{ ...s.errorBox, marginBottom: '16px' }}>{statusError}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'RSVPs',           value: event.rsvpCount,      colour: 'var(--accent)' },
          { label: 'Attended',        value: event.attendedCount,  colour: '#15803d' },
          { label: 'Walk-ins',        value: event.walkinCount,    colour: '#db2777' },
          { label: pendingCheckinLabel, value: Math.max(noShows, 0), colour: isClosed ? '#dc2626' : 'var(--mut)' },
          { label: 'Attendance rate', value: `${attendancePct}%`,  colour: '#0891b2' },
        ].map(c => (
          <div key={c.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.colour }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Attendance rate bar */}
      {event.rsvpCount > 0 && (
        <div style={{ ...s.card, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.875rem', color:'var(--ink)', fontWeight: 500 }}>Overall attendance</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#15803d' }}>
              {event.attendedCount + event.walkinCount} of {event.rsvpCount} RSVPs ({attendancePct}%)
            </span>
          </div>
          <div style={{ background: 'var(--panel2)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: '100%' }}>
              <div style={{ background: '#10b981', width: `${Math.round((event.attendedCount / event.rsvpCount) * 100)}%` }} />
              <div style={{ background: '#db2777', width: `${Math.round((event.walkinCount  / event.rsvpCount) * 100)}%` }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
            <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}><span style={{ color: '#10b981' }}>■</span> RSVP attended</span>
            <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}><span style={{ color: '#db2777' }}>■</span> Walk-ins</span>
          </div>
        </div>
      )}

      {/* Attendee list */}
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Attendees</h2>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[['all','All'],['attended','Attended'],['rsvp','RSVP'],['walkin','Walk-in'],['noshow',pendingCheckinLabel]].map(([key, label]) => (
              <button key={key} onClick={() => setAttendeeFilter(key)} style={{
                padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 500, border: '1px solid',
                background:   attendeeFilter === key ? 'var(--accent)' : 'var(--panel)',
                color:        attendeeFilter === key ? 'white'   : 'var(--mut)',
                borderColor:  attendeeFilter === key ? 'var(--accent)' : 'var(--line)',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <table style={{ ...s.table, minWidth: '700px' }}>
          <thead>
            <tr>
              {['Name','Email','Occupation','RSVP','Attended','Registered'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} style={s.tr}>
                <td style={{ ...s.td, fontWeight: 500 }}>{a.name}</td>
                <td style={{ ...s.td, color:'var(--mut)' }}>{a.email}</td>
                <td style={s.td}>{a.occupation ?? '—'}</td>
                <td style={s.td}><YesNo value={a.rsvp} /></td>
                <td style={s.td}>
                  {canManage ? (
                    <button
                      onClick={() => handleToggleAttendance(a)}
                      disabled={togglingId === a.id}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      title={a.attended ? 'Click to mark not attended' : 'Click to check in'}
                    >
                      <YesNo value={a.attended} />
                    </button>
                  ) : (
                    <YesNo value={a.attended} />
                  )}
                </td>
                <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>
                  {format(new Date(a.registeredAt), 'd MMM HH:mm')}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color:'var(--mut)' }}>
                No attendees match this filter.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Registration QR modal */}
      {showQr && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowQr(false); }}>
          <div style={{ ...s.modal, width: '420px', textAlign: 'center' }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Registration QR Code</h2>
              <button onClick={() => setShowQr(false)} style={s.closeBtn}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                  <path d="M3 3l10 10M13 3L3 13"/>
                </svg>
              </button>
            </div>
            <div style={{ background:'#ffffff', border: '1px solid var(--line)', borderRadius: '8px', padding: '24px', marginBottom: '14px', display: 'inline-block' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} width={160} height={160} alt="Event registration QR code" />
                : <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.75rem' }}>Generating…</div>}
            </div>
            <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '4px' }}>Prospects scan this beforehand to register and RSVP</p>
            <p style={{ fontSize: '0.75rem', color:'var(--mut)', wordBreak: 'break-all', marginBottom: '16px' }}>{regUrl}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
              <button onClick={handleDownloadPng} disabled={!qrDataUrl} style={s.primaryBtn}>Download PNG</button>
              <button onClick={shareWhatsApp} style={s.secondaryBtn}>Share via WhatsApp</button>
              <button onClick={shareEmail} style={s.secondaryBtn}>Share via Email</button>
            </div>
            <button onClick={() => setShowQr(false)} style={s.secondaryBtn}>Close</button>
          </div>
        </div>
      )}

      {/* Attendance QR modal — deliberately NO share buttons. This code is
          only ever meant to exist at the venue on the day; sharing it the
          way the registration QR is shared would recreate the exact gap
          having a separate token was meant to close. */}
      {showAttendanceQr && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowAttendanceQr(false); }}>
          <div style={{ ...s.modal, width: '420px', textAlign: 'center' }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Attendance QR Code</h2>
              <button onClick={() => setShowAttendanceQr(false)} style={s.closeBtn}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                  <path d="M3 3l10 10M13 3L3 13"/>
                </svg>
              </button>
            </div>
            <div style={{ background:'#ffffff', border: '1px solid var(--line)', borderRadius: '8px', padding: '24px', marginBottom: '14px', display: 'inline-block' }}>
              {attendanceQrDataUrl
                ? <img src={attendanceQrDataUrl} width={160} height={160} alt="Event attendance QR code" />
                : <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.75rem' }}>Generating…</div>}
            </div>
            <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '4px' }}>
              Display this at the venue only — attendees scan it on the day to confirm they're here
            </p>
            <p style={{ fontSize: '0.75rem', color:'var(--mut)', marginBottom: '16px' }}>
              Don't share this link — printing/displaying it at the venue is the intended use
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
              <button onClick={handleDownloadAttendancePng} disabled={!attendanceQrDataUrl} style={s.primaryBtn}>Download PNG</button>
            </div>
            <button onClick={() => setShowAttendanceQr(false)} style={s.secondaryBtn}>Close</button>
          </div>
        </div>
      )}

      {showAddAttendee && (
        <AddAttendeeModal
          eventId={id}
          onClose={() => setShowAddAttendee(false)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
