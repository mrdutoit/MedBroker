/**
 * pages/AppointmentDetail.jsx
 *
 * The Appointment is the "active deal" entity — analogous to Salesforce Opportunity.
 * It is a child of Lead — one-to-many since 23 Jul 2026 (Mark's request, see
 * Status.md §35): a Lead can have several Appointments over its lifetime
 * (Closed Lost -> manual Reopen on Lead Detail -> a new Book Appointment
 * attempt). Full history is preserved; "the" appointment shown on Lead
 * Detail is the most recent one by createdAt, resolved server-side in
 * leadService.getLeadById().
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
import { useParams, useNavigate } from 'react-router';
import { format } from 'date-fns';
import { useRole } from '../context/RoleContext';
import { useFlags }                           from '../context/FlagContext';
import { useWindowSize }                      from '../hooks/useWindowSize';
import { useFetch }                           from '../hooks/useFetch.js';
import { appointmentsApi, usersApi }          from '../services/api';
import { s, APPT_STATUS_META, MEETING_STATUS_META, MEETING_STATUS_LABELS } from '../styles/tokens.js';
import { formatDate, formatTime }             from '../utils/dateFormat.js';
import AuditLogList                           from '../components/AuditLogList.jsx';

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
  portfolio: '', portfolios: [], source: '', productsInterested: [], region: '',
  status: '', firstDate: '', firstTime: '', address: '', brokerName: '', agentName: '',
  brokerSwitch: false, customerSigned: null, lostReason: null, productsSold: [],
  // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
  // replaces the fixed three-slot meetings array; a real appointment
  // always has at least the meeting-1 row by the time this component
  // ever renders it (created atomically at booking, appointmentService.
  // createAppointment()) — empty here only because this is the
  // never-actually-shown loading-state placeholder.
  meetingAttempts: [],
};

// 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
// MEETING_STATUSES (the old three-value Seen/Rescheduled/Cancelled
// dropdown options) and meetingHasData() (which only ever needed to ask
// "does this flat-column slot have anything in it") both removed —
// meetingAttempts.length > 0 already answers "does meeting N exist" for
// the new model, no helper needed. The three SAVEABLE statuses now live
// directly on the save form component below (MEETING_ATTEMPT_STATUSES) —
// 'Scheduled' is deliberately excluded from that list, since it's a
// row's own creation default, never something chosen to save it AS.
const MEETING_ATTEMPT_STATUSES = [
  { value: 'HeldInterested',    label: 'Held – Interested' },
  { value: 'HeldNotInterested', label: 'Held – Not Interested' },
  { value: 'Rescheduled',       label: 'Rescheduled' },
  // 15 Aug 2026 (§172) — added back, one day after being collapsed into
  // Rescheduled (§164) — Mark's real-world case: a client cancelling or
  // not showing, with no reschedule happening at that moment, is
  // genuinely different from one being actively rebooked, and worth
  // reporting on separately.
  { value: 'Cancelled',         label: 'Cancelled' },
  { value: 'Missed',            label: 'Missed / No-show' },
];

// 15 Aug 2026 (§172, migration 034) — mirrors AppointmentDetail's own
// lostReason dropdown exactly (same six-ish-category pattern, same
// "only shown once the triggering status is actually selected" UX).
const CANCEL_REASONS = [
  { value: 'NoLongerInterested', label: 'No longer interested' },
  { value: 'FoundAlternative',   label: 'Found an alternative broker/solution' },
  { value: 'SchedulingConflict', label: 'Scheduling conflict, wants to rebook' },
  { value: 'Uncontactable',      label: 'Uncontactable' },
  { value: 'Other',              label: 'Other' },
];
const CANCEL_REASON_LABELS = Object.fromEntries(CANCEL_REASONS.map(r => [r.value, r.label]));

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

// ─── Meeting attempt history row ────────────────────────────────────────────
// Read-only. Matches LeadDetail.jsx's own Call History row pattern
// exactly (left-border colour by outcome, badge, date, notes below) —
// the spec's own explicit "matching the Lead call-log pattern" applied
// to how a decided attempt actually renders, not just how it's stored.
function MeetingAttemptHistoryRow({ attempt, index }) {
  const meta = MEETING_STATUS_META[attempt.status] ?? { colour: 'var(--mut)', bg: 'var(--panel2)' };
  return (
    <div
      style={{
        borderLeft: `3px solid ${meta.colour}`, padding: '8px 0 8px 10px',
        background: index % 2 === 1 ? 'var(--panel2)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.6875rem' }}>
          {MEETING_STATUS_LABELS[attempt.status] ?? attempt.status}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--mut)' }}>
          {attempt.date ? format(new Date(`${attempt.date}T00:00:00`), 'd MMM yyyy') : 'No date set'}
        </span>
      </div>
      {/* 15 Aug 2026 (§172) — the structured reason, shown distinctly from
          free-text notes below it, matching how the two are captured as
          genuinely different kinds of information (a fixed category vs
          situational context). */}
      {attempt.cancelReason && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink)', marginTop: '4px', fontWeight: 500 }}>
          {CANCEL_REASON_LABELS[attempt.cancelReason] ?? attempt.cancelReason}
        </p>
      )}
      {attempt.notes && <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', marginTop: '4px' }}>{attempt.notes}</p>}
    </div>
  );
}

// ─── Meeting attempt edit form ──────────────────────────────────────────────
// The ONE row (across the whole appointment) that's still 'Scheduled' —
// not yet decided. No lock/unlock, no "Mark Held" as a separate action
// from Save — replaces MeetingSection entirely. Saving this IS the
// transition away from 'Scheduled'; the server's own routing decision
// (saveMeetingAttemptOutcome, appointmentService.js) then either reveals
// the Outcome section or creates the next row automatically — nothing
// here manually decides what happens next, it just submits the decision.
function MeetingAttemptForm({ attempt, meetingNumber, isLastMeeting, onSave, saving, disabled }) {
  const titles = { 1: 'First Meeting', 2: 'Second Meeting', 3: 'Third Meeting' };
  const [date, setDate]   = useState(attempt.date ?? '');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState(attempt.notes ?? '');
  const [followUpRequired, setFollowUpRequired] = useState(null);
  const [cancelReason, setCancelReason] = useState(null);

  // 15 Aug 2026 — the real signal for "should this date be locked", not
  // just meetingNumber === 1 on its own (see the input's own comment
  // below for the bug this replaced). True only for the ORIGINAL
  // meeting-1 row created directly by createAppointment() at booking —
  // every subsequent meeting-1 row (born from Cancelled/Rescheduled/
  // Missed) starts with attempt.date === null the moment it's created,
  // so this correctly evaluates false for those, leaving them editable.
  const isOriginalMeeting1Date = meetingNumber === 1 && !!attempt.date;

  // Follow-up is only ever asked for Held-Interested on a NON-last
  // meeting — matches saveMeetingAttemptOutcome()'s own server-side gate
  // exactly (appointmentService.js); asking it anywhere else would be a
  // dead end the spec explicitly rules out (nowhere left to advance to).
  const followUpApplicable = status === 'HeldInterested' && !isLastMeeting;
  // 15 Aug 2026 (§172) — only Cancelled has a reason to categorise;
  // Missed is by definition uncommunicated. Required before saving,
  // same enforcement pattern as Appointment.lostReason (§163) — the
  // Zod schema itself stays optional, this is the layer that actually
  // makes sure it gets captured rather than left theoretically possible.
  const cancelReasonApplicable = status === 'Cancelled';
  const canSave = !!date && !!status
    && (!followUpApplicable || followUpRequired !== null)
    && (!cancelReasonApplicable || !!cancelReason);

  function handleSave() {
    onSave(attempt.id, {
      date, status, notes: notes || null,
      followUpRequired: followUpApplicable ? followUpRequired : null,
      cancelReason: cancelReasonApplicable ? cancelReason : null,
    });
  }

  return (
    <div style={{ ...s.card, marginBottom: '12px', opacity: disabled ? 0.6 : 1 }}>
      <div style={{ ...s.cardTitle }}>{titles[meetingNumber] ?? `Meeting ${meetingNumber}`}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={s.formLabel}>Date</label>
          <input
            type="date"
            style={{
              ...s.formInput,
              // 14 Aug 2026 (§166 follow-up) — Mark's explicit follow-up:
              // the field WAS already disabled (functionally read-only),
              // but this design system's own s.formInput doesn't visibly
              // change on native :disabled, so it looked identical to an
              // editable field — no visual signal it couldn't be
              // touched. Explicit override here, not relying on the
              // browser's own default disabled appearance.
              ...(isOriginalMeeting1Date ? { background: 'var(--panel2)', color: 'var(--mut)', cursor: 'not-allowed' } : {}),
            }}
            value={date ?? ''}
            // 14 Aug 2026 — Mark's explicit request: the First Meeting's
            // date is what the Agent captured at booking time
            // (firstAppointmentDate, carried into this row's own date at
            // creation — createAppointment(), appointmentService.js).
            // Leaving it editable here let it silently drift out of sync
            // with the Appointment's own firstAppointmentDate, with
            // nothing showing which one was "real" afterward.
            //
            // 15 Aug 2026 — REAL BUG Mark found and fixed here: the
            // original version locked this field for EVERY meetingNumber
            // === 1 row unconditionally. That's wrong once a meeting 1
            // row can be Cancelled/Rescheduled/Missed — each of those
            // creates a NEW row for meeting 1 (still meeting 1, same
            // meeting number, per Mark's own explicit request), and that
            // new row starts with date=null (createMeetingAttempt() is
            // always called with date: null for this exact case,
            // appointmentService.js) — there's genuinely no captured
            // value to protect there. Locking it anyway left the field
            // both blank AND uneditable, with no way to ever set a date
            // for that new attempt at all.
            //
            // isOriginalMeeting1Date (below) is the real signal — true
            // only when meetingNumber is 1 AND attempt.date already has
            // a value, which is only ever the row created directly by
            // createAppointment() at booking time. Every other
            // meeting-1 row (born from Cancelled/Rescheduled/Missed) has
            // date=null the moment it's created, so this correctly
            // falls through to editable, matching meeting 2/3's own rows.
            disabled={disabled || isOriginalMeeting1Date}
            onChange={e => setDate(e.target.value)}
          />
          {isOriginalMeeting1Date && !disabled && (
            <p style={{ ...s.formHint, marginTop: '4px' }}>Set when this appointment was booked — not editable here.</p>
          )}
        </div>
        <div>
          <label style={s.formLabel}>Status</label>
          <select style={s.formInput} value={status} disabled={disabled} onChange={e => setStatus(e.target.value)}>
            <option value="">Please select</option>
            {MEETING_ATTEMPT_STATUSES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
          </select>
        </div>
      </div>
      {followUpApplicable && (
        <div style={{ marginBottom: '12px' }}>
          <label style={s.formLabel}>Follow-up required?</label>
          <select
            style={s.formInput} disabled={disabled}
            value={followUpRequired === null ? '' : followUpRequired ? 'Yes' : 'No'}
            onChange={e => setFollowUpRequired(e.target.value === '' ? null : e.target.value === 'Yes')}
          >
            <option value="">Please select</option>
            <option value="Yes">Yes — book a Meeting {meetingNumber + 1}</option>
            <option value="No">No — this is the outcome</option>
          </select>
        </div>
      )}
      {cancelReasonApplicable && (
        <div style={{ marginBottom: '12px' }}>
          <label style={s.formLabel}>Reason for cancellation</label>
          <select
            style={s.formInput} disabled={disabled}
            value={cancelReason ?? ''}
            onChange={e => setCancelReason(e.target.value || null)}
          >
            <option value="">Please select</option>
            {CANCEL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <label style={s.formLabel}>Notes</label>
        <textarea
          style={{ ...s.formInput, height: '60px', resize: 'vertical' }}
          placeholder="Notes from the meeting…" value={notes} disabled={disabled}
          onChange={e => setNotes(e.target.value)}
        />
      </div>
      {!disabled && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button" style={{ ...s.primaryBtn, opacity: (!canSave || saving) ? 0.5 : 1 }}
            disabled={!canSave || saving} onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
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

// ─── Reassign Broker / Agent modal ─────────────────────────────────────────────
//
// Broker was always editable here. Agent was previously hardcoded read-only
// — "the user who booked it, never subsequently editable" — which is exactly
// the rule Mark asked to reverse: the Agent should be the Lead's assigned
// agent, and correctable via this same Reassign action if it's ever wrong
// (e.g. the Lead gets reassigned to a different agent after the appointment
// already exists). The backend (ReassignAppointmentSchema / reassignAppointment())
// already accepted an optional agentId — only this modal enforced read-only.
//
// Production: calls PUT /api/appointments/:id/reassign → { brokerId, agentId }
function ReassignBrokerModal({ appointment, brokers, agents, onSaved, onClose }) {
  const [broker, setBroker] = useState(appointment.brokerId ?? '');
  const [agent,  setAgent]  = useState(appointment.agentId ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const brokerChanged = broker !== (appointment.brokerId ?? '');
  const agentChanged  = agent  !== (appointment.agentId ?? '');
  const hasChange = (brokerChanged && !!broker) || (agentChanged && !!agent);

  async function handleSave() {
    if (!hasChange) return;
    setSaving(true);
    setError('');
    try {
      await appointmentsApi.reassign(
        appointment.id,
        brokerChanged ? broker : undefined,
        agentChanged  ? agent  : undefined
      );
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
          <h2 style={s.modalTitle}>Reassign Broker / Agent</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {/* Context line */}
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '16px' }}>
          {appointment.leadName} · Currently: <strong>{appointment.agentName}</strong> (agent) / <strong>{appointment.brokerName}</strong> (broker)
        </p>

        {saved && (
          <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>
            ✓ Reassigned successfully
          </div>
        )}
        {error && (
          <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>
        )}

        {/* Agent — editable */}
        <div style={{ marginBottom: '14px' }}>
          <label style={s.formLabel}>Agent</label>
          {appointment.agentName && (
            <p style={{ fontSize: '0.6875rem', color:'var(--mut)', marginBottom: '6px' }}>
              Current: {appointment.agentName}
            </p>
          )}
          <select style={s.formInput} value={agent} onChange={e => setAgent(e.target.value)} disabled={saved}>
            <option value="">Select agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName}</option>
            ))}
          </select>
        </div>

        {/* Broker — editable, pre-populated with current broker */}
        <div style={{ marginBottom: '20px' }}>
          <label style={s.formLabel}>Broker</label>
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
            style={{ ...s.primaryBtn, opacity: (!hasChange || saving || saved) ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={!hasChange || saving || saved}
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
          This appointment record is kept, locked, as history — not deleted
          — so it stays available for reporting and audit. The lead will be
          available to assign to the next available agent.
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
  const { role, productsByPortfolio, displayName } = useRole();
  const { flag }        = useFlags();
  const { isMobile }    = useWindowSize();

  const canManage           = ['GlobalAdmin', 'Admin', 'Supervisor'].includes(role);
  // Mirrors saveMeetingAttemptOutcome()'s own server-side check exactly
  // (appointmentService.js) — used here only to decide whether the
  // follow-up question renders at all for the CURRENT active attempt,
  // never trusted for anything the server itself decides authoritatively.
  const thirdMeetingEnabled = !!flag('appointments.thirdMeeting.enabled');

  // Real data — GET /api/appointments/:id. meetingAttempts (§164) comes
  // back as its own array now, not flattened flat columns — nothing to
  // transform here beyond what getAppointmentById() already shapes it as.
  const { data: apptData, loading: apptLoading, refetch: refetchAppt } = useFetch(() => appointmentsApi.get(id), [id]);
  const { data: brokersData } = useFetch(() => usersApi.list({ role: 'Broker' }), []);
  const realBrokers = brokersData?.users ?? [];
  const { data: agentsData } = useFetch(() => usersApi.list({ role: 'Agent' }), []);
  const realAgents = agentsData?.users ?? [];
  // Change Log — GET /api/appointments/:id/audit, same generic AuditLog
  // table the Lead side reads from. Refetched alongside the appointment
  // itself whenever an action (outcome save, reassign, meeting held) writes
  // a new entry, via the same refetchAppt-triggered re-render pattern.
  // §133 (6 Aug 2026) — CORRECTED: same gap LeadDetail.jsx's Audit Log
  // had (see that file's own comment) — error was available from
  // useFetch and simply never checked here either.
  const { data: auditData, error: auditError, refetch: refetchAudit } = useFetch(() => appointmentsApi.auditLog(id), [id]);
  const auditEntries = auditData?.entries ?? [];

  const [appt,              setAppt]              = useState({ ...EMPTY_APPOINTMENT, id: id ?? '' });
  const [showReassign,      setShowReassign]      = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [outcomeSaved,      setOutcomeSaved]      = useState(false);
  const [savingOutcome,     setSavingOutcome]     = useState(false);
  const [outcomeError,      setOutcomeError]      = useState(null);
  // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) — the
  // whole markingHeld/savingMeetingNum/savedMeetingNum/heldMeetingNums/
  // unlockedMeetingNums/secondMeetingCreated/thirdMeetingCreated block
  // this replaced existed to manage manual lock/unlock and manual
  // "add the next meeting" state on top of three fixed flat-column
  // slots. None of that has an equivalent need in the new model: a
  // meeting's history is just whatever's actually in meetingAttempts
  // (nothing to separately "unlock" — an append-only row is never
  // edited again once decided, so there's no lock/unlock toggle to
  // manage), and the next meeting number's row is created automatically
  // by the server's own routing decision (saveMeetingAttemptOutcome),
  // not a manual "Add Meeting" button. There is only ever at most ONE
  // attempt row genuinely awaiting a decision (status 'Scheduled') at a
  // time — computed directly from meetingAttempts below, not tracked as
  // separate state that could drift out of sync with it.
  const [savingAttempt,     setSavingAttempt]     = useState(false);
  const [justSavedAttempt,  setJustSavedAttempt]  = useState(false);
  // 14 Aug 2026 — true only immediately after a save that just attached
  // the current user as broker (see handleSaveMeetingAttempt below).
  // Transient, same 3-second window as justSavedAttempt — this is a
  // one-time confirmation of what happened, not a persistent status
  // indicator (appt.brokerName itself is that, shown normally elsewhere
  // on this page already).
  const [staffBrokerAssigned, setStaffBrokerAssigned] = useState(false);


  useEffect(() => {
    if (!apptData) return;
    setAppt({
      id:             apptData.id,
      leadId:         apptData.leadId,
      leadName:       `${apptData.title ?? ''} ${apptData.firstName} ${apptData.lastName}`.trim(),
      occupation:     apptData.occupation,
      mobile:         apptData.leadMobile,
      currentInsurer: apptData.currentInsurer,
      // 14 Aug 2026 (§166 follow-up) — Mark's explicit request: shown
      // nowhere on this page before. apptData.region is Appointment's
      // own carried-over copy of Lead.region at booking time
      // (createAppointment(), appointmentService.js), not re-fetched
      // from the Lead here.
      region:         apptData.region ?? '',
      portfolio:      apptData.portfolio,
      portfolios:     apptData.portfolios ?? (apptData.portfolio ? [apptData.portfolio] : []),
      source:         apptData.sourceLabel ?? '—',
      productsInterested: apptData.productsInterestedIn ?? [],
      status:         apptData.status,
      firstDate:      apptData.firstAppointmentDate,
      firstTime:      (apptData.firstAppointmentTime ?? '').slice(0, 5),
      meetingType:    apptData.meetingType ?? 'InPerson', // §140d — defensive default for any row from before the column existed
      address:        apptData.firstAppointmentAddress,
      virtualMeetingLink: apptData.virtualMeetingLink,
      brokerId:       apptData.brokerId,
      brokerName:     apptData.brokerName,
      agentId:        apptData.agentId,
      agentName:      apptData.agentName,
      brokerSwitch:   apptData.isBrokerSwitch ?? false,
      customerSigned: apptData.customerSigned,
      lostReason:     apptData.lostReason ?? null,
      // apptData.productsSold is [{name, value}] from the API (§44) — map
      // to {product, value} to match this component's own field naming.
      productsSold:   (apptData.productsSold ?? []).map(p => ({ product: p.name, value: p.value })),
      // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
      // meetingAttempts replaces the old meetings: [1,2,3].map(...) flat-
      // column transform entirely. Same .slice(0, 10) date fix still
      // applies here — MeetingAttempt.date is the same Postgres DATE
      // column type as the old meeting{N}Date columns were, so it comes
      // back from node-postgres as a full ISO timestamp the same way;
      // <input type="date"> needs exactly 'YYYY-MM-DD' or it silently
      // renders empty, same root cause §137 already found and fixed once
      // — applying the same fix here rather than rediscovering it.
      meetingAttempts: (apptData.meetingAttempts ?? []).map(a => ({
        ...a,
        date: a.date ? a.date.slice(0, 10) : null,
      })),
    });
  }, [apptData]);

  // Derived
  // isClosed = a genuine sales outcome was reached (won or lost) — used only
  // for messaging that specifically talks about winning/losing the deal.
  // isLocked = ANY terminal state, including ReturnedToLeads (23 Jul 2026,
  // §36 — Return to Leads no longer deletes the appointment, it locks it as
  // its own terminal status so the history and audit trail survive; see
  // returnToLeads() in appointmentService.js). Everywhere that previously
  // gated on isClosed for "should this be editable" now uses isLocked —
  // isClosed stays narrower, for won/lost-specific copy only.
  const isClosed    = appt.status === 'ClosedWon' || appt.status === 'ClosedLost';
  const isLocked     = isClosed || appt.status === 'ReturnedToLeads';
  const canReturn   = canManage && !isLocked && appt.customerSigned !== true;
  const canReassign = canManage && !isLocked;

  // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
  // replaces firstMeetingComplete/secondMeetingComplete (which existed
  // only to gate the old manual "Add Meeting" buttons — no equivalent
  // needed, the next row's existence in meetingAttempts IS the gate now).
  // Grouped by meetingNumber, each group's rows already ordered oldest
  // first (getAppointmentById's own ORDER BY) — the LAST row in a group
  // is either the current active one (status 'Scheduled') or, for a
  // fully-resolved meeting number, simply the most recent history entry.
  const attemptsByMeetingNumber = appt.meetingAttempts.reduce((acc, a) => {
    (acc[a.meetingNumber] ??= []).push(a);
    return acc;
  }, {});
  const meetingNumbers = Object.keys(attemptsByMeetingNumber).map(Number).sort((a, b) => a - b);
  // At most one across the WHOLE appointment, by construction — the
  // server only ever creates a new 'Scheduled' row as the direct
  // consequence of the previous one resolving (saveMeetingAttemptOutcome),
  // so there's never a second one sitting open at the same time.
  const activeAttempt = appt.meetingAttempts.find(a => a.status === 'Scheduled') ?? null;
  const isLastMeeting = activeAttempt ? activeAttempt.meetingNumber >= (thirdMeetingEnabled ? 3 : 2) : false;

  // Outcome due — derived from meetingAttempts, not tracked as separate
  // state that could drift out of sync with it. True the moment ANY
  // attempt resolved to Held-Not-Interested, or Held-Interested with no
  // further meeting to advance to (followUpRequired anything other than
  // true — covers both an explicit "No" and the server's own null for
  // "wasn't even asked, this was the last configured meeting"). Matches
  // saveMeetingAttemptOutcome()'s own routing table exactly, computed
  // client-side purely for display — the server already decided this for
  // real at save time; this is just working out the same answer again
  // from the data it left behind, for a page that's just been loaded
  // fresh rather than just received a save response.
  const outcomeTrigger = appt.meetingAttempts.find(a =>
    a.status === 'HeldNotInterested' || (a.status === 'HeldInterested' && a.followUpRequired !== true)
  );
  const outcomeDue = !!outcomeTrigger;
  const effectiveCustomerSigned = appt.customerSigned !== null
    ? appt.customerSigned
    : (outcomeTrigger ? outcomeTrigger.status === 'HeldInterested' : null);

  // Changed 23 Jul 2026 (§45) — was scoped to appt.portfolio (the primary
  // only). An appointment can now cover more than one portfolio, so
  // Products Sold needs the union across all of them — otherwise a
  // product genuinely sold from a non-primary portfolio would never even
  // appear as a checkbox to record it against.
  const productsForPortfolio = appt.portfolios.flatMap(name => productsByPortfolio[name] ?? []);

  // handleMeetingChange REMOVED 14 Aug 2026 (§138 spec, session 20; §164
  // build, session 23) — MeetingAttemptForm now owns its own draft state
  // locally (date/status/notes/followUpRequired), submitted whole on
  // Save rather than synced field-by-field into the parent's appt
  // state the way the old flat meetings array required.

  function handleOutcomeChange(field, value) {
    setAppt(prev => ({ ...prev, [field]: value }));
  }

  // Changed 23 Jul 2026 (§44, Mark's request) — productsSold is now
  // [{product, value}] instead of a bare string array, carrying an
  // optional Rand value per product. Checking a product adds it with
  // value: null (not yet captured); unchecking removes it entirely,
  // value and all.
  function handleProductToggle(product) {
    setAppt(prev => ({
      ...prev,
      productsSold: prev.productsSold.some(p => p.product === product)
        ? prev.productsSold.filter(p => p.product !== product)
        : [...prev.productsSold, { product, value: null }],
    }));
  }

  function handleProductValueChange(product, rawValue) {
    const value = rawValue === '' ? null : Number(rawValue);
    setAppt(prev => ({
      ...prev,
      productsSold: prev.productsSold.map(p => p.product === product ? { ...p, value } : p),
    }));
  }

  async function handleSaveOutcome() {
    // 14 Aug 2026 (§163) — Mark's explicit request: a lost reason should
    // actually get captured, not just be an optional field nobody fills
    // in. Blocked client-side with a clear message rather than silently
    // saving without one — the Zod schema itself stays optional (see
    // models/appointment.js's own comment on why), so this is the one
    // place that actually enforces it.
    //
    // effectiveCustomerSigned, not raw appt.customerSigned — 14 Aug 2026
    // (§138 spec, session 20; §164 build, session 23): if a meeting
    // attempt already resolved the outcome (Held-Not-Interested, or
    // Held-Interested with nothing left to advance to) but the person
    // saves this section without touching the Customer Signed dropdown
    // themselves, the pre-filled value is still the real, correct answer
    // — falling back to raw appt.customerSigned here would silently send
    // null and fail to actually close the appointment.
    if (effectiveCustomerSigned === false && !appt.lostReason) {
      setOutcomeError('Please select a reason for the loss before saving.');
      return;
    }
    setSavingOutcome(true);
    setOutcomeError(null);
    try {
      // The server computes the resulting status (ClosedWon/ClosedLost/InProgress)
      // via computeAppointmentStatus() — it is never written directly by the client.
      const result = await appointmentsApi.saveOutcome(appt.id, {
        customerSigned: effectiveCustomerSigned,
        lostReason:     effectiveCustomerSigned === false ? appt.lostReason : null,
        productsSold:   appt.productsSold,
        // meetings REMOVED 14 Aug 2026 (§138 spec, session 20; §164
        // build, session 23) — meeting saves go through
        // handleSaveMeetingAttempt/appointmentsApi.saveMeetingAttempt
        // now, not bundled into this call.
      });
      // Production returns the updated record; preview returns null (mock mode).
      if (result?.status) setAppt(prev => ({ ...prev, status: result.status }));
      setOutcomeSaved(true);
      refetchAudit();
      setTimeout(() => setOutcomeSaved(false), 3000);
    } catch (err) {
      setOutcomeError(err?.message ?? 'Could not save the outcome. Please try again.');
    } finally {
      setSavingOutcome(false);
    }
  }

  // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) — the
  // ONE save action for a meeting attempt, replacing handleSaveMeeting/
  // handleMarkMeetingHeld/handleUnlockMeeting entirely. There's no
  // separate "mark held" action distinct from saving anymore (the spec's
  // whole point: the Status dropdown IS the save action now, not a
  // second confirmation step), and no unlock (nothing to unlock — an
  // append-only row is never re-opened once decided).
  //
  // Reacts to the server's own routing decision rather than re-deriving
  // it: appointmentStatus is applied directly (InProgress if this was
  // meeting 1's first held outcome); newAttempt (if present) is appended
  // so the next Scheduled row renders immediately, no refetch needed;
  // outcomeDue/prefillCustomerSigned pre-fill the Outcome section's
  // Customer Signed field the moment it's actually due, matching what
  // the spec calls "pre-set Yes/No" — the person still has to actually
  // save the Outcome section themselves (productsSold, lostReason if
  // Lost), this just saves them the one click of re-selecting what the
  // meeting attempt already told the system.
  async function handleSaveMeetingAttempt(attemptId, data) {
    setSavingAttempt(true);
    setJustSavedAttempt(false);
    setOutcomeError(null);
    try {
      const result = await appointmentsApi.saveMeetingAttempt(appt.id, attemptId, data);
      setAppt(prev => {
        const updatedAttempts = prev.meetingAttempts.map(a => a.id === attemptId ? { ...a, ...result.attempt } : a);
        if (result.newAttempt) updatedAttempts.push(result.newAttempt);
        return {
          ...prev,
          status: result.appointmentStatus ?? prev.status,
          meetingAttempts: updatedAttempts,
          // Pre-fill only — doesn't persist customerSigned server-side by
          // itself. Only overwrite a not-yet-decided value; never
          // clobber an outcome that (for whatever reason) was already set.
          customerSigned: prev.customerSigned === null && result.outcomeDue ? result.prefillCustomerSigned : prev.customerSigned,
          // 14 Aug 2026 — result.brokerAssignedId is only ever non-null
          // when THIS save is the one that just attached the current
          // user as broker (Mark's explicit request: "if they did the
          // work, they should appear" — no filtering, a normal
          // assignment). brokerName is display-only here; the assigned
          // broker IS whoever is logged in right now, so this is a
          // known value, not a guess — no refetch needed just to learn
          // our own name.
          brokerName: result.brokerAssignedId ? displayName : prev.brokerName,
        };
      });
      refetchAudit();
      setJustSavedAttempt(true);
      setStaffBrokerAssigned(!!result.brokerAssignedId);
      setTimeout(() => { setJustSavedAttempt(false); setStaffBrokerAssigned(false); }, 3000);
    } catch (err) {
      setOutcomeError(err?.message ?? 'Could not save this meeting. Please try again.');
    } finally {
      setSavingAttempt(false);
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
                Reassign
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
          <FieldRow label="Region">{appt.region || '—'}</FieldRow>
          <FieldRow label="Occupation">{appt.occupation}</FieldRow>
          <FieldRow label="Mobile">{appt.mobile}</FieldRow>
          <FieldRow label="Current insurer">{appt.currentInsurer}</FieldRow>
          <FieldRow label="Products interested">{appt.productsInterested.join(', ')}</FieldRow>
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Appointment Details</div>
          <FieldRow label="Status"><StatusChip status={appt.status} /></FieldRow>
          <FieldRow label="Portfolio">
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {appt.portfolios.length ? appt.portfolios.map(p => <PortfolioPill key={p} portfolio={p} />) : <PortfolioPill portfolio={appt.portfolio} />}
            </div>
          </FieldRow>
          <FieldRow label="First appt date">{formatDate(appt.firstDate)} · {formatTime(appt.firstTime)}</FieldRow>
          <FieldRow label="Meeting type">{appt.meetingType === 'Virtual' ? 'Virtual' : 'In person'}</FieldRow>
          {appt.meetingType === 'Virtual' ? (
            <FieldRow label="Meeting link">
              {appt.virtualMeetingLink ? (
                /^https?:\/\//i.test(appt.virtualMeetingLink) ? (
                  <a href={appt.virtualMeetingLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                    {appt.virtualMeetingLink}
                  </a>
                ) : appt.virtualMeetingLink
              ) : '—'}
            </FieldRow>
          ) : (
            <FieldRow label="Address">{appt.address || '—'}</FieldRow>
          )}
          <FieldRow label="Broker">{appt.brokerName}</FieldRow>
          <FieldRow label="Agent">{appt.agentName}</FieldRow>
          <FieldRow label="Source">{appt.source}</FieldRow>
        </div>
      </div>

      {/* ── Meeting tracking ────────────────────────────────────────────────── */}
      {/* Confirmation banner, not scoped to any one form instance — a
          successful meeting-attempt save always transitions the UI away
          from the form that was just submitted (either a new row's own
          fresh form mounts in its place, or the Outcome section appears
          instead), so a checkmark living inside the form itself would
          either never be seen or, worse, briefly appear on a brand new,
          not-yet-saved form. This sits above the whole section instead,
          independent of whichever form comes next. */}
      {justSavedAttempt && (
        <div style={{ ...s.noticeInfo, marginBottom: '12px', color: '#15803d', background: 'color-mix(in srgb, #15803d 10%, var(--panel))' }}>
          {staffBrokerAssigned
            ? `✓ Meeting saved. You've been assigned as the broker for this appointment, since nobody had claimed it yet.`
            : '✓ Meeting saved'}
        </div>
      )}
      {/* 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
          replaces the old fixed three-slot MeetingSection/AddMeetingPrompt
          rendering entirely. One card per meeting number that actually
          has data (meeting 1 always does — created atomically with the
          appointment); within a meeting number, every resolved attempt
          renders as read-only history (MeetingAttemptHistoryRow, oldest
          first), and if that meeting number's current row is still
          'Scheduled' (awaiting a decision), the editable form
          (MeetingAttemptForm) renders in its place instead of a history
          row for it. There's never more than one editable form on the
          page at once — see activeAttempt's own comment above for why. */}
      {meetingNumbers.map(n => {
        const attempts = attemptsByMeetingNumber[n];
        const isActive = activeAttempt && activeAttempt.meetingNumber === n;
        const historyAttempts = isActive ? attempts.slice(0, -1) : attempts;
        return (
          <div key={n}>
            {historyAttempts.length > 0 && (
              <div style={{ ...s.card, marginBottom: '12px' }}>
                <div style={s.cardTitle}>{{ 1: 'First Meeting', 2: 'Second Meeting', 3: 'Third Meeting' }[n] ?? `Meeting ${n}`}</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {historyAttempts.map((a, i) => <MeetingAttemptHistoryRow key={a.id} attempt={a} index={i} />)}
                </div>
              </div>
            )}
            {isActive && (
              <MeetingAttemptForm
                key={activeAttempt.id}
                attempt={activeAttempt} meetingNumber={n} isLastMeeting={isLastMeeting}
                onSave={handleSaveMeetingAttempt} saving={savingAttempt}
                disabled={isLocked}
              />
            )}
          </div>
        );
      })}

      {/* ── Appointment outcome ─────────────────────────────────────────────── */}
      {/* 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
          was gated on meetingHasData(appt.meetings[0]) (any data at all
          on meeting 1); now gated on outcomeDue specifically — matches
          the spec's own routing table exactly: this section has no
          reason to appear while a Rescheduled or follow-up-pending
          meeting is still in play, only once a meeting attempt has
          actually resolved to an outcome. */}
      {outcomeDue && (
      <div style={{ ...s.card, opacity: isLocked ? 0.75 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...s.cardTitle }}>
          <span>Appointment Outcome</span>
          {isLocked && (
            <span style={{ ...s.badge, background: 'var(--panel2)', color: 'var(--mut)', fontWeight: 600 }}>
              🔒 Locked
            </span>
          )}
        </div>
        {isClosed && (
          <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
            This appointment is closed ({appt.status === 'ClosedWon' ? 'Closed Won' : 'Closed Lost'}) and can no longer be edited.
          </div>
        )}
        {appt.status === 'ReturnedToLeads' && (
          <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
            This appointment was returned to the leads queue and is locked — kept as history rather than deleted, so it stays visible for reporting and audit.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={s.formLabel}>Customer Signed?</label>
            <select
              style={{ ...s.formInput, opacity: isLocked ? 0.6 : 1 }}
              value={effectiveCustomerSigned === null ? '' : effectiveCustomerSigned ? 'Yes' : 'No'}
              disabled={isLocked}
              onChange={e => handleOutcomeChange('customerSigned', e.target.value === '' ? null : e.target.value === 'Yes')}
            >
              <option value="">Please select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
            {/* 14 Aug 2026 (§138 spec, session 20; §164 build, session 23)
                — pre-filled from what the meeting attempt(s) already
                established (see effectiveCustomerSigned's own comment
                above), not yet explicitly confirmed by re-selecting it
                here. Purely informational — Save Outcome below still
                sends the effective value either way, this just tells the
                person why the dropdown already shows an answer they
                didn't pick themselves. */}
            {appt.customerSigned === null && effectiveCustomerSigned !== null && (
              <p style={{ ...s.formHint, marginTop: '4px' }}>Pre-filled from the meeting outcome above — change it if that's wrong.</p>
            )}
          </div>
          {/* 14 Aug 2026 (§163, migration 030) — Mark's explicit request.
              Only shown once "No" is actually selected (or pre-filled as
              No from a Held-Not-Interested meeting attempt), not always-
              visible-but-disabled — an empty required field for a Won
              appointment would be a confusing thing to stare at. */}
          {effectiveCustomerSigned === false && (
            <div>
              <label style={s.formLabel}>Reason for loss</label>
              <select
                style={{ ...s.formInput, opacity: isLocked ? 0.6 : 1 }}
                value={appt.lostReason ?? ''}
                disabled={isLocked}
                onChange={e => handleOutcomeChange('lostReason', e.target.value || null)}
              >
                <option value="">Please select</option>
                <option value="PriceTooHigh">Price too high</option>
                <option value="ChoseCompetitor">Chose a competitor</option>
                <option value="NoLongerInterested">No longer interested</option>
                <option value="Uncontactable">Uncontactable</option>
                <option value="NotEligible">Not eligible</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}
          <div>
            <label style={s.formLabel}>Broker Switch?</label>
            <select
              style={{ ...s.formInput, opacity: isLocked ? 0.6 : 1 }}
              value={appt.brokerSwitch === null ? '' : appt.brokerSwitch ? 'Yes' : 'No'}
              disabled={isLocked}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {productsForPortfolio.map(product => {
              const entry = appt.productsSold.find(p => p.product === product);
              const checked = !!entry;
              return (
                <div key={product} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', cursor: isLocked ? 'default' : 'pointer', minWidth: '200px' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isLocked}
                      onChange={() => handleProductToggle(product)}
                    />
                    {product}
                  </label>
                  {checked && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--mut)' }}>R</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="Policy value"
                        style={{ ...s.formInput, width: '140px', opacity: isLocked ? 0.6 : 1 }}
                        value={entry.value ?? ''}
                        disabled={isLocked}
                        onChange={e => handleProductValueChange(product, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {appt.productsSold.length > 0 && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', marginTop: '10px' }}>
              Total policy value: <strong style={{ color: 'var(--ink)' }}>
                R{appt.productsSold.reduce((sum, p) => sum + (p.value ?? 0), 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              {appt.productsSold.some(p => p.value === null) && (
                <span> — {appt.productsSold.filter(p => p.value === null).length} product{appt.productsSold.filter(p => p.value === null).length !== 1 ? 's' : ''} without a value yet</span>
              )}
            </p>
          )}
        </div>
        {!isLocked && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button style={s.primaryBtn} onClick={handleSaveOutcome} disabled={savingOutcome}>
              {savingOutcome ? 'Saving…' : 'Save Outcome'}
            </button>
            {outcomeSaved && (
              <span style={{ fontSize: '0.8125rem', color: '#15803d' }}>✓ Outcome saved</span>
            )}
          </div>
        )}
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
      )}

      {/* ── Change Log ──────────────────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardTitle}>Change Log ({auditEntries.length})</div>
        {auditError ? (
          <div style={{ ...s.errorBox, fontSize: '0.8125rem' }}>
            Could not load the change log. Try refreshing the page.
          </div>
        ) : (
          <AuditLogList entries={auditEntries} emptyLabel="No changes recorded yet." />
        )}
      </div>

      {/* ── Reassign Broker / Agent modal ────────────────────────────────────── */}
      {showReassign && (
        <ReassignBrokerModal
          appointment={appt}
          brokers={realBrokers}
          agents={realAgents}
          onSaved={() => { refetchAppt(); refetchAudit(); }}
          onClose={() => setShowReassign(false)}
        />
      )}

      {/* ── Return to Leads modal ────────────────────────────────────────────── */}
      {showReturnConfirm && (
        <ReturnToLeadsModal
          appointment={appt}
          onClose={() => setShowReturnConfirm(false)}
          onReturned={() => { refetchAppt(); refetchAudit(); setShowReturnConfirm(false); }}
        />
      )}
    </div>
  );
}
