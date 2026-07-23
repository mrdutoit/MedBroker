/**
 * pages/AppointmentDetail.jsx
 *
 * The Appointment is the "active deal" entity — analogous to Salesforce Opportunity.
 * It is a child of Lead (1:1, enforced by UNIQUE leadId in the schema).
 *
 * This page is reached from the Appointments list (View →) and shows:
 *   - Lead/contact details (read-only — editable from Lead Detail)
 *   - Appointment logistics (broker, agent, portfolio, first appointment date/address)
 *   - Meeting tracking: First, Second, optional Third meeting
 *   - Appointment outcome: Signed?, Products sold, Broker switch?
 *   - Reassign Broker action (Admin/Supervisor only)
 *   - Return to Leads action (Admin/Supervisor only, hidden once signed)
 *
 * Book Appointment does NOT appear here — that action lives on Lead Detail
 * and is how a Lead is converted to an Appointment in the first place.
 *
 * AGENT FIELD — CRITICAL RULE:
 *   The Agent on an Appointment is always the user who booked it from Lead Detail.
 *   In production this is derived from the booking user's JWT at POST /api/appointments
 *   time and is never subsequently editable. The Reassign Broker modal mirrors the
 *   Assign Broker modal: agent is a read-only display field; only broker is editable.
 *
 * STATUS TRANSITIONS (server-side only — see leadStatusService.js):
 *   Saving outcome with customerSigned = true  → ClosedWon
 *   Saving outcome with customerSigned = false → ClosedLost
 *   First meeting marked Seen                  → InProgress
 *
 * ROW-LEVEL OWNERSHIP (production):
 *   Admin/Supervisor: all appointments
 *   Agent: appointments where agentId = req.user.id
 *   Broker (assign model): appointments where brokerId = req.user.id
 *   Broker (claim model): same as above + Available to Claim pool
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole, PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext';
import { useFlags }                           from '../context/FlagContext';
import { useWindowSize }                      from '../hooks/useWindowSize';
import { useFetch }                           from '../hooks/useFetch.js';
import { appointmentsApi, usersApi }          from '../services/api';
import { s, APPT_STATUS_META }                from '../styles/tokens.js';

// ─── Mock data ─────────────────────────────────────────────────────────────────
// In production: fetched from GET /api/appointments/:id
// The agent field is set at booking time from the JWT and is never editable.
// Neutral initial shape for the appt state, before the real fetch resolves
// — same fields meetingStatus/etc. throughout this file expect, but no
// fake person data. The loading gate below (near the main render) means
// this is never actually shown to a user; it exists only so state has a
// safe, complete shape to start from.
const EMPTY_APPOINTMENT = {
  id: '', leadId: '', leadName: '', occupation: '', mobile: '', currentInsurer: '',
  portfolio: '', source: '', productsInterested: [],
  status: '', firstDate: '', firstTime: '', address: '', brokerName: '', agentName: '',
  brokerSwitch: false, customerSigned: null, productsSold: [],
  meetings: [
    { number: 1, date: '', status: '', notes: '', required: true },
    { number: 2, date: '', status: '', notes: '', required: true },
    { number: 3, date: '', status: '', notes: '', required: false },
  ],
};


const MEETING_STATUSES = ['Seen', 'Rescheduled', 'Cancelled'];

// A meeting is "complete" once its outcome status has been recorded — that's
// what unlocks the button to create the next meeting in the sequence.
const isMeetingComplete = (meeting) => !!meeting.status;
// A meeting already "exists" if any of its fields already carry data — handles
// loading an appointment that already has a Second/Third meeting filled in,
// so it renders immediately rather than behind the Add-meeting button again.
const meetingHasData = (meeting) => !!(meeting.date || meeting.status || meeting.notes);

// ─── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const meta = APPT_STATUS_META[status] ?? { colour: 'var(--mut)', bg: 'var(--panel2)', border: 'var(--line)', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '20px',
      fontSize: '0.75rem', fontWeight: 500,
      color: meta.colour, background: meta.bg, border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  );
}

// ─── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem' }}>
      <span style={{ color:'var(--mut)', flexShrink: 0, marginRight: '16px' }}>{label}</span>
      <span style={{ color:'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

// ─── Meeting section ───────────────────────────────────────────────────────────
// Rendered only once a meeting has actually been created — see AddMeetingPrompt
// below and the secondMeetingCreated/thirdMeetingCreated state in the main
// component. No per-field disabling needed any more: if it's rendered, it's active.
function MeetingSection({ meeting, onChange, isMobile }) {
  const isOptional = meeting.number === 3;
  const titles = ['', 'First Meeting', 'Second Meeting', 'Third Meeting'];

  return (
    <div style={{ ...s.card, borderStyle: isOptional ? 'dashed' : 'solid', marginBottom: '12px' }}>
      <div style={s.cardTitle}>{titles[meeting.number]}</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={s.formLabel}>Date</label>
          <input
            type="date"
            style={s.formInput}
            value={meeting.date}
            onChange={e => onChange(meeting.number, 'date', e.target.value)}
          />
        </div>
        <div>
          <label style={s.formLabel}>Status</label>
          <select
            style={s.formInput}
            value={meeting.status}
            onChange={e => onChange(meeting.number, 'status', e.target.value)}
          >
            <option value="">Please select</option>
            {MEETING_STATUSES.map(st => <option key={st}>{st}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={s.formLabel}>Meeting Feedback</label>
        <textarea
          style={{ ...s.formInput, height: '60px', resize: 'vertical' }}
          placeholder="Notes from the meeting…"
          value={meeting.notes}
          onChange={e => onChange(meeting.number, 'notes', e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Add-meeting prompt ─────────────────────────────────────────────────────────
// Second and Third meetings don't exist until explicitly created here. The
// button stays disabled until the prior meeting's status has been recorded.
function AddMeetingPrompt({ label, unlocked, unlockHint, onClick }) {
  return (
    <div style={{ ...s.card, borderStyle: 'dashed', marginBottom: '12px', textAlign: 'center', padding: '20px' }}>
      <button
        style={{ ...s.secondaryBtn, opacity: unlocked ? 1 : 0.5, cursor: unlocked ? 'pointer' : 'not-allowed' }}
        disabled={!unlocked}
        onClick={onClick}
      >
        + {label}
      </button>
      {!unlocked && (
        <div style={{ ...s.formHint, marginTop: '8px' }}>{unlockHint}</div>
      )}
    </div>
  );
}

// ─── Portfolio pill ─────────────────────────────────────────────────────────────
// Same colour convention already used for portfolio badges in AppAdmin.jsx.
function PortfolioPill({ portfolio }) {
  const isMM = portfolio === 'Money and Medicine' || portfolio === 'M&M';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '20px',
      fontSize: '0.75rem', fontWeight: 500,
      color: isMM ? '#a78bfa' : 'var(--accent)',
      background: isMM ? 'color-mix(in srgb, #7c3aed 14%, var(--panel))' : 'color-mix(in srgb, #1d4ed8 14%, var(--panel))',
      border: `1px solid ${isMM ? 'color-mix(in srgb, #7c3aed 30%, var(--panel))' : 'color-mix(in srgb, #1d4ed8 30%, var(--panel))'}`,
    }}>
      {isMM ? 'M&M' : portfolio}
    </span>
  );
}

// ─── Reassign Broker modal ─────────────────────────────────────────────────────
//
// CRITICAL: Mirrors AssignBrokerModal behaviour exactly.
// The Agent field is ALWAYS read-only — it shows who booked the appointment
// and cannot be changed through this interface. Only the Broker field is editable.
//
// isAssign=false (this is always a reassign from AppointmentDetail).
// The current broker is pre-selected so the user can see who is assigned
// before choosing a replacement.
//
// Production: calls PUT /api/appointments/:id/reassign → { brokerId }
// The endpoint updates the broker, keeps the current status, and writes an audit
// log entry. It does NOT accept an agentId — agent is immutable at the API level.
function ReassignBrokerModal({ appointment, brokers, onSaved, onClose }) {
  const [broker, setBroker] = useState(appointment.brokerId ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const brokerChanged = broker !== (appointment.brokerId ?? '');

  async function handleSave() {
    if (!broker || !brokerChanged) return;
    setSaving(true);
    setError('');
    try {
      await appointmentsApi.reassign(appointment.id, broker);
      setSaved(true);
      await onSaved?.();
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '420px' }}>

        {/* Header */}
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Reassign Broker</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {/* Context line */}
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '16px' }}>
          {appointment.leadName} · Currently assigned to <strong>{appointment.brokerName}</strong>
        </p>

        {saved && (
          <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>
            ✓ Broker reassigned successfully
          </div>
        )}
        {error && (
          <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>
        )}

        {/* Agent — read-only, always */}
        <div style={{ marginBottom: '14px' }}>
          <label style={s.formLabel}>
            Agent
            <span style={{ marginLeft: '6px', fontSize: '0.6875rem', color:'var(--mut)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              (read only)
            </span>
          </label>
          <div style={{
            ...s.formInput,
            background:'var(--panel2)',
            color:'var(--mut)',
            cursor: 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13" style={{ flexShrink: 0, opacity: 0.5 }}>
              <rect x="4" y="7" width="8" height="6" rx="1"/><path d="M6 7V5a2 2 0 014 0v2"/>
            </svg>
            {appointment.agentName}
          </div>
          <p style={{ fontSize: '0.6875rem', color:'var(--mut)', marginTop: '4px' }}>
            Set when the appointment was booked. Cannot be changed here.
          </p>
        </div>

        {/* Broker — editable, pre-populated with current broker */}
        <div style={{ marginBottom: '20px' }}>
          <label style={s.formLabel}>Reassign broker *</label>
          {appointment.brokerName && (
            <p style={{ fontSize: '0.6875rem', color:'var(--mut)', marginBottom: '6px' }}>
              Current: {appointment.brokerName}
            </p>
          )}
          <select
            style={s.formInput}
            value={broker}
            onChange={e => setBroker(e.target.value)}
            disabled={saved}
          >
            <option value="">Select broker…</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>{b.displayName}</option>
            ))}
          </select>
          {broker && broker === (appointment.brokerId ?? '') && (
            <p style={{ fontSize: '0.6875rem', color:'var(--mut)', marginTop: '4px' }}>
              Select a different broker to reassign.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={s.modalFooter}>
          <button
            style={{ ...s.secondaryBtn, background: 'none', border: 'none' }}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            style={{ ...s.primaryBtn, opacity: (!broker || !brokerChanged || saving || saved) ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={!broker || !brokerChanged || saving || saved}
          >
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Return to Leads confirmation modal ────────────────────────────────────────
// Destructive action — red confirm button, plain-language consequences.
// Hidden when appointment is already ClosedWon (customerSigned = true).
// Production: PUT /api/appointments/:id/return validates customerSigned IS NOT TRUE.
function ReturnToLeadsModal({ appointment, onClose, onReturned }) {
  const [returning, setReturning] = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState(null);

  async function handleReturn() {
    setReturning(true);
    setError(null);
    try {
      await appointmentsApi.returnToLeads(appointment.id);
      setDone(true);
      setTimeout(onReturned, 900);
    } catch {
      setError('Could not return this appointment. Please try again.');
      setReturning(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '400px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Return to Leads?</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>
        <p style={{ fontSize: '0.875rem', color:'var(--ink)', marginBottom: '10px' }}>
          This appointment will be returned to the unassigned leads queue.
        </p>
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '20px', lineHeight: 1.5 }}>
          This appointment record will be removed. The lead will be available to assign to the next available agent.
        </p>
        {error && (
          <div style={{ ...s.noticeWarn, marginBottom: '12px' }}>{error}</div>
        )}
        {done && (
          <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>
            ✓ Returned to leads queue
          </div>
        )}
        <div style={s.modalFooter}>
          <button
            style={{ ...s.secondaryBtn, background: 'none', border: 'none' }}
            onClick={onClose}
            disabled={returning}
          >
            Cancel
          </button>
          <button
            style={{ ...s.primaryBtn, background: '#dc2626', opacity: returning || done ? 0.5 : 1 }}
            onClick={handleReturn}
            disabled={returning || done}
          >
            {done ? 'Done ✓' : returning ? 'Returning…' : 'Return to Leads'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function AppointmentDetail() {
  const { id }          = useParams();
  const navigate        = useNavigate();
  const { role }        = useRole();
  const { flag }        = useFlags();
  const { isMobile }    = useWindowSize();

  const canManage           = ['GlobalAdmin', 'Admin', 'Supervisor'].includes(role);
  const thirdMeetingEnabled = !!flag('appointments.thirdMeeting.enabled');

  // Real data — GET /api/appointments/:id. Transformed into the same
  // { meetings: [{number,date,status,notes,required}, ...] } shape the
  // rest of this file already expects, so nothing below needs touching —
  // only this mapping and the sync effect are new.
  const { data: apptData, loading: apptLoading, refetch: refetchAppt } = useFetch(() => appointmentsApi.get(id), [id]);
  const { data: brokersData } = useFetch(() => usersApi.list({ role: 'Broker' }), []);
  const realBrokers = brokersData?.users ?? [];

  const [appt,              setAppt]              = useState({ ...EMPTY_APPOINTMENT, id: id ?? '' });
  const [showReassign,      setShowReassign]      = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [outcomeSaved,      setOutcomeSaved]      = useState(false);
  const [savingOutcome,     setSavingOutcome]     = useState(false);
  const [outcomeError,      setOutcomeError]      = useState(null);
  const [secondMeetingCreated, setSecondMeetingCreated] = useState(() => meetingHasData(appt.meetings[1]));
  const [thirdMeetingCreated,  setThirdMeetingCreated]  = useState(() => meetingHasData(appt.meetings[2]));

  useEffect(() => {
    if (!apptData) return;
    setAppt({
      id:             apptData.id,
      leadId:         apptData.leadId,
      leadName:       `${apptData.title ?? ''} ${apptData.firstName} ${apptData.lastName}`.trim(),
      occupation:     apptData.occupation,
      mobile:         apptData.leadMobile,
      currentInsurer: apptData.currentInsurer,
      portfolio:      apptData.portfolio,
      source:         apptData.sourceLabel ?? '—',
      productsInterested: apptData.productsInterestedIn ?? [],
      status:         apptData.status,
      firstDate:      apptData.firstAppointmentDate,
      firstTime:      (apptData.firstAppointmentTime ?? '').slice(0, 5),
      address:        apptData.firstAppointmentAddress,
      brokerId:       apptData.brokerId,
      brokerName:     apptData.brokerName,
      agentId:        apptData.agentId,
      agentName:      apptData.agentName,
      brokerSwitch:   apptData.isBrokerSwitch ?? false,
      customerSigned: apptData.customerSigned,
      productsSold:   apptData.productsSold ?? [],
      meetings: [1, 2, 3].map((n) => ({
        number:   n,
        date:     apptData[`meeting${n}Date`] ?? '',
        status:   apptData[`meeting${n}Status`] ?? '',
        notes:    apptData[`meeting${n}Feedback`] ?? '',
        required: n < 3,
      })),
    });
  }, [apptData]);

  // Derived
  const isClosed    = appt.status === 'ClosedWon' || appt.status === 'ClosedLost';
  const canReturn   = canManage && !isClosed && appt.customerSigned !== true;
  const canReassign = canManage && !isClosed;
  const firstMeetingComplete  = isMeetingComplete(appt.meetings[0]);
  const secondMeetingComplete = isMeetingComplete(appt.meetings[1]);

  const productsForPortfolio = PRODUCTS_BY_PORTFOLIO[appt.portfolio === 'Discovery' ? 'disc' : 'mm'] ?? [];

  function handleMeetingChange(meetingNumber, field, value) {
    setAppt(prev => ({
      ...prev,
      meetings: prev.meetings.map(m =>
        m.number === meetingNumber ? { ...m, [field]: value } : m
      ),
    }));
  }

  function handleOutcomeChange(field, value) {
    setAppt(prev => ({ ...prev, [field]: value }));
  }

  function handleProductToggle(product) {
    setAppt(prev => ({
      ...prev,
      productsSold: prev.productsSold.includes(product)
        ? prev.productsSold.filter(p => p !== product)
        : [...prev.productsSold, product],
    }));
  }

  async function handleSaveOutcome() {
    setSavingOutcome(true);
    setOutcomeError(null);
    try {
      // The server computes the resulting status (ClosedWon/ClosedLost/InProgress)
      // via computeAppointmentStatus() — it is never written directly by the client.
      const result = await appointmentsApi.saveOutcome(appt.id, {
        customerSigned: appt.customerSigned,
        productsSold:   appt.productsSold,
        meetings:       appt.meetings,
      });
      // Production returns the updated record; preview returns null (mock mode).
      if (result?.status) setAppt(prev => ({ ...prev, status: result.status }));
      setOutcomeSaved(true);
      setTimeout(() => setOutcomeSaved(false), 3000);
    } catch (err) {
      setOutcomeError('Could not save the outcome. Please try again.');
    } finally {
      setSavingOutcome(false);
    }
  }

  // Still loading: show a simple loading state rather than the neutral
  // empty-appointment shape appt starts from — otherwise the page would
  // briefly render with blank fields before the real fetch resolves.
  if (apptLoading) {
    return (
      <div style={{ padding: isMobile ? '12px' : '24px' }}>
        <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button style={s.backBtn} onClick={() => navigate('/appointments')} aria-label="Back">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M10 3L5 8l5 5"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color:'var(--ink)' }}>{appt.leadName} — Appointment</div>
            <div style={{ fontSize: '0.8125rem', color:'var(--mut)', marginTop: '1px' }}>
              Booked from {appt.source} · Broker: {appt.brokerName}
            </div>
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {canReassign && (
              <button style={s.secondaryBtn} onClick={() => setShowReassign(true)}>
                Reassign Broker
              </button>
            )}
            {canReturn && (
              <button
                style={{ ...s.secondaryBtn, color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={() => setShowReturnConfirm(true)}
              >
                Return to Leads
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Detail cards ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div style={s.card}>
          <div style={s.cardTitle}>Lead Details</div>
          <FieldRow label="Name">{appt.leadName}</FieldRow>
          <FieldRow label="Occupation">{appt.occupation}</FieldRow>
          <FieldRow label="Mobile">{appt.mobile}</FieldRow>
          <FieldRow label="Current insurer">{appt.currentInsurer}</FieldRow>
          <FieldRow label="Products interested">{appt.productsInterested.join(', ')}</FieldRow>
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Appointment Details</div>
          <FieldRow label="Status"><StatusChip status={appt.status} /></FieldRow>
          <FieldRow label="Portfolio"><PortfolioPill portfolio={appt.portfolio} /></FieldRow>
          <FieldRow label="First appt date">{appt.firstDate}  {appt.firstTime}</FieldRow>
          <FieldRow label="Address">{appt.address}</FieldRow>
          <FieldRow label="Broker">{appt.brokerName}</FieldRow>
          <FieldRow label="Agent">{appt.agentName}</FieldRow>
          <FieldRow label="Source">{appt.source}</FieldRow>
        </div>
      </div>

      {/* ── Meeting tracking ────────────────────────────────────────────────── */}
      <MeetingSection meeting={appt.meetings[0]} onChange={handleMeetingChange} isMobile={isMobile} />

      {secondMeetingCreated ? (
        <MeetingSection meeting={appt.meetings[1]} onChange={handleMeetingChange} isMobile={isMobile} />
      ) : (
        <AddMeetingPrompt
          label="Add Second Meeting"
          unlocked={firstMeetingComplete}
          unlockHint="Record the First Meeting's status before adding a Second Meeting."
          onClick={() => setSecondMeetingCreated(true)}
        />
      )}

      {thirdMeetingEnabled && secondMeetingCreated && (
        thirdMeetingCreated ? (
          <MeetingSection meeting={appt.meetings[2]} onChange={handleMeetingChange} isMobile={isMobile} />
        ) : (
          <AddMeetingPrompt
            label="Add Third Meeting"
            unlocked={secondMeetingComplete}
            unlockHint="Record the Second Meeting's status before adding a Third Meeting."
            onClick={() => setThirdMeetingCreated(true)}
          />
        )
      )}

      {/* ── Appointment outcome ─────────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardTitle}>Appointment Outcome</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={s.formLabel}>Customer Signed?</label>
            <select
              style={s.formInput}
              value={appt.customerSigned === null ? '' : appt.customerSigned ? 'Yes' : 'No'}
              onChange={e => handleOutcomeChange('customerSigned', e.target.value === '' ? null : e.target.value === 'Yes')}
            >
              <option value="">Please select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          <div>
            <label style={s.formLabel}>Broker Switch?</label>
            <select
              style={s.formInput}
              value={appt.brokerSwitch === null ? '' : appt.brokerSwitch ? 'Yes' : 'No'}
              onChange={e => handleOutcomeChange('brokerSwitch', e.target.value === '' ? null : e.target.value === 'Yes')}
            >
              <option value="">Please select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={s.formLabel}>Products Sold</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            {productsForPortfolio.map(product => (
              <label key={product} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={appt.productsSold.includes(product)}
                  onChange={() => handleProductToggle(product)}
                />
                {product}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button style={s.primaryBtn} onClick={handleSaveOutcome} disabled={savingOutcome}>
            {savingOutcome ? 'Saving…' : 'Save Outcome'}
          </button>
          {outcomeSaved && (
            <span style={{ fontSize: '0.8125rem', color: '#15803d' }}>✓ Outcome saved</span>
          )}
        </div>
        {outcomeError && (
          <div style={{ ...s.noticeWarn, marginTop: '10px' }}>{outcomeError}</div>
        )}
        {appt.customerSigned === true && (
          <p style={{ fontSize: '0.8125rem', color: '#15803d', marginTop: '10px', fontWeight: 500 }}>
            ✓ This appointment is closed — ClosedWon
          </p>
        )}
        {appt.customerSigned === false && (
          <p style={{ fontSize: '0.8125rem', color: '#dc2626', marginTop: '10px', fontWeight: 500 }}>
            This appointment is closed — ClosedLost
          </p>
        )}
      </div>

      {/* ── Reassign Broker modal ────────────────────────────────────────────── */}
      {showReassign && (
        <ReassignBrokerModal
          appointment={appt}
          brokers={realBrokers}
          onSaved={refetchAppt}
          onClose={() => setShowReassign(false)}
        />
      )}

      {/* ── Return to Leads modal ────────────────────────────────────────────── */}
      {showReturnConfirm && (
        <ReturnToLeadsModal
          appointment={appt}
          onClose={() => setShowReturnConfirm(false)}
          onReturned={() => navigate('/appointments')}
        />
      )}
    </div>
  );
}
