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
 * STATUS TRANSITIONS (server-side only — see appointmentStatusService.js):
 *   Saving outcome with customerSigned = true  → ClosedWon
 *   Saving outcome with customerSigned = false → ClosedLost
 *   First meeting marked Seen                  → InProgress
 *
 * CLOSE AS LOST (24 Aug 2026) — a second entry point into the exact same
 * customerSigned = false save above, for a deal that never reached a held
 * meeting at all (repeated cancellations/no-shows, lead gone quiet). See
 * CloseAsLostModal's own header comment for full reasoning.
 *
 * ROW-LEVEL OWNERSHIP (production):
 *   Admin/Supervisor: all appointments
 *   Agent: appointments where agentId = req.user.id
 *   Broker (assign model): appointments where brokerId = req.user.id
 *   Broker (claim model): same as above + Available to Claim pool
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useRole } from '../context/RoleContext';
import { useFlags }                           from '../context/FlagContext';
import { useWindowSize }                      from '../hooks/useWindowSize';
import { useFetch }                           from '../hooks/useFetch.js';
import { appointmentsApi, usersApi, leadsApi, ApiError } from '../services/api';
import { s, APPT_STATUS_META, MEETING_STATUS_META, MEETING_STATUS_LABELS } from '../styles/tokens.js';
import { formatDate, formatTime }             from '../utils/dateFormat.js';
import AuditLogList                           from '../components/AuditLogList.jsx';
import DatePicker                             from '../components/DatePicker.jsx';

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

// 19 Aug 2026, Mark's explicit request — mirrors LeadDetail.jsx's own
// EditableField exactly (that file's own comment for each type's
// reasoning applies unchanged here), adapted to this file's FieldRow
// instead of that one's Field for the non-editing render — the two
// already share the identical row styling, so nothing visually changes
// when editingDetails is false.
function EditableFieldRow({ label, editing, type = 'text', value, onChange, options, displayValue }) {
  const inputStyle = { border: '1px solid var(--line)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.8125rem', fontFamily: 'inherit', textAlign: 'right', width: '60%', boxSizing: 'border-box', color: 'var(--ink)' };

  if (!editing) {
    let display = displayValue !== undefined ? displayValue : value;
    if (type === 'bool') display = value === true ? 'Yes' : value === false ? 'No' : '—';
    if (type === 'date' && value) display = formatDate(value);
    return <FieldRow label={label}>{display || '—'}</FieldRow>;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
      <span style={{ color:'var(--mut)', flexShrink: 0 }}>{label}</span>
      {type === 'select' && (
        <select style={inputStyle} value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {type === 'bool' && (
        <select style={inputStyle} value={value === null || value === undefined ? '' : value ? 'Yes' : 'No'} onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'Yes')}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      )}
      {(type === 'text' || type === 'number' || type === 'time') && (
        <input type={type === 'time' ? 'time' : type} style={inputStyle} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
      )}
      {/* 25 Aug 2026 — split out of the shared text/date/number/time
          native <input> above: type='date' now goes through the custom
          DatePicker (internal/staff form, in scope — DatePicker.jsx's
          own header comment has the full reasoning). Already takes a
          plain value via onChange, same contract this field already
          exposes to ITS OWN callers, so nothing above this component
          changes. */}
      {type === 'date' && (
        <DatePicker style={{ ...inputStyle, width: '170px' }} value={value ?? ''} onChange={onChange} />
      )}
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
          {/* 24 Aug 2026 — was format(new Date(`${attempt.date}T00:00:00`), 'd MMM
              yyyy'); the manual T00:00:00 suffix was itself a workaround for
              exactly the DATE-only/timezone bug formatDate() exists to avoid.
              formatDate() makes the workaround unnecessary, not just shorter. */}
          {attempt.date ? formatDate(attempt.date) : 'No date set'}
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

  // 16 Aug 2026 — REAL BUG Mark found: the previous signal here
  // (meetingNumber === 1 && !!attempt.date) broke the moment a date-only
  // save became possible (see canSave below) — saving just a date onto a
  // rebooked meeting-1 row would make attempt.date truthy, which under
  // the old check would then have locked that same row's date field
  // right back up, as if it were the original booking-time row. Fixed by
  // keying off attempt.recordedById === null instead — true ONLY for the
  // pristine row created directly by createAppointment() at booking
  // (which always passes recordedById: null), and reliably false for
  // every other meeting-1 row, whether born from Cancelled/Rescheduled/
  // Missed (these already get a non-null recordedById the moment
  // they're created — see createMeetingAttempt()'s three call sites,
  // appointmentService.js) or subsequently touched by a date-only save
  // (which now stamps recordedById too, for exactly this reason).
  const isOriginalMeeting1Date = meetingNumber === 1 && attempt.recordedById === null;

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
  // 16 Aug 2026 — REAL BUG Mark found: canSave used to require BOTH date
  // AND status together, always — meaning there was no way to save just
  // the date on a fresh follow-up row (born from a Cancelled/Missed/
  // Rescheduled attempt, or a brand-new meeting 2/3) without ALSO
  // recording that meeting's outcome in the same action, before the
  // meeting had even happened. status is now genuinely optional here: a
  // date on its own is a valid, lighter save (saveMeetingAttemptOutcome's
  // new date-only branch, appointmentService.js) — the row stays
  // 'Scheduled', still active, still awaiting its real outcome later.
  // Once status IS chosen, the existing conditional-field requirements
  // apply exactly as before.
  const isDateOnlySave = !!date && !status;
  const canSave = !!date
    && (!status || (
         (!followUpApplicable || followUpRequired !== null)
      && (!cancelReasonApplicable || !!cancelReason)
    ));

  function handleSave() {
    onSave(attempt.id, {
      date, status: status || undefined, notes: notes || null,
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
          {/* 25 Aug 2026 — native <input type="date"> replaced with
              DatePicker (internal/staff form, in scope — see
              DatePicker.jsx's own header comment). canSave already
              gates on !!date independent of any native required
              attribute (this input never had one), so nothing to
              compensate for. The isOriginalMeeting1Date locked-look
              override (14 Aug 2026 comment below) is passed straight
              through via the style prop, same as before — DatePicker
              merges it onto its own input exactly like s.formInput. */}
          <DatePicker
            style={{
              // 14 Aug 2026 (§166 follow-up) — Mark's explicit follow-up:
              // the field WAS already disabled (functionally read-only),
              // but this design system's own s.formInput doesn't visibly
              // change on native :disabled, so it looked identical to an
              // editable field — no visual signal it couldn't be
              // touched. Explicit override here, not relying on the
              // browser's own default disabled appearance.
              ...(isOriginalMeeting1Date ? { background: 'var(--panel2)', color: 'var(--mut)' } : {}),
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
            onChange={setDate}
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
      {/* 16 Aug 2026 — button label reflects which of the two genuinely
          different actions this Save will perform: with no Status chosen
          yet, it's just recording when the meeting is/was scheduled for
          (row stays open); once a Status is picked, it's the real,
          append-only outcome save. Same button, same canSave gate — just
          honest about which one is about to happen. */}
      {!disabled && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button" style={{ ...s.primaryBtn, opacity: (!canSave || saving) ? 0.5 : 1 }}
            disabled={!canSave || saving} onClick={handleSave}
          >
            {saving ? 'Saving…' : isDateOnlySave ? 'Save Date' : 'Save Outcome'}
          </button>
          {isDateOnlySave && (
            <span style={{ ...s.formHint, marginTop: 0 }}>
              Saves the date only — come back and select a Status once this meeting has happened.
            </span>
          )}
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

// ─── Close as Lost confirmation modal ───────────────────────────────────────
// 24 Aug 2026, Mark's explicit request — a genuine gap surfaced by his own
// testing: outcomeDue (below, in the main component) only ever becomes true
// once a meeting attempt actually resolves to a Held outcome, so a lead that
// only ever cancels, reschedules, or is missed — never once held — had no
// path to Closed Lost at all. Return to Leads was the only other closure
// action available, and that's an administrative reset (Lead -> Unassigned,
// see returnToLeads()'s own header comment in appointmentService.js), not a
// sales-loss outcome — it doesn't record WHY the deal didn't happen, and it
// hands the lead back into the pipeline rather than closing it out.
//
// Deliberately reuses appointmentsApi.saveOutcome() exactly as the Outcome
// card below does (customerSigned: false + a required lostReason) rather
// than introducing a new endpoint or status — this produces an identical
// ClosedLost record, indistinguishable in Won/Lost reporting from one closed
// via a held meeting. Confirmed against appointmentService.saveOutcome()
// directly before building this: its only precondition is current.status
// not already being ClosedWon/ClosedLost/ReturnedToLeads — it has never
// required a held meeting or checked outcomeDue at all, that's purely a
// frontend gate on the Outcome card's own visibility. So this needed no
// backend change whatsoever, only a new entry point — no new migration, no
// new API route, zero new Vercel functions (Hobby plan ceiling stays
// untouched).
//
// Same reason list as the Outcome card's own "Reason for loss" dropdown a
// few hundred lines down, kept in sync manually — both are short, static,
// CHECK-constrained enums (Appointment.lostReason, migration 030); a shared
// constant wasn't judged worth the indirection for two five-line lists.
//
// Undo path: reopenAppointment() (appointmentService.js) only checks
// status === 'ClosedLost', with no dependency on how it got there, so the
// existing Admin/Supervisor "Reopen Appointment" escape hatch already
// covers an appointment closed this way — no new undo mechanism needed,
// just the fix immediately below (outcomeDue || isLocked) that makes the
// card carrying that button actually render for it.
function CloseAsLostModal({ appointment, onClose, onClosed }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [error,  setError]  = useState(null);

  async function handleConfirm() {
    if (!reason) {
      setError('Please select a reason before closing this appointment as lost.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await appointmentsApi.saveOutcome(appointment.id, {
        customerSigned: false,
        lostReason: reason,
        productsSold: [],
      });
      setDone(true);
      setTimeout(onClosed, 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not close this appointment. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '400px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Close as Lost?</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>
        <p style={{ fontSize: '0.875rem', color:'var(--ink)', marginBottom: '10px' }}>
          This appointment will be marked Closed Lost, with no meeting ever held.
        </p>
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '16px', lineHeight: 1.5 }}>
          This is permanent — the appointment locks immediately, the same as any
          other Closed Lost outcome. An Admin or Supervisor can reopen it
          afterwards if this was a mistake.
        </p>
        <div style={{ marginBottom: '16px' }}>
          <label style={s.formLabel}>Reason for loss</label>
          <select style={s.formInput} value={reason} disabled={saving || done} onChange={e => setReason(e.target.value)}>
            <option value="">Please select</option>
            <option value="PriceTooHigh">Price too high</option>
            <option value="ChoseCompetitor">Chose a competitor</option>
            <option value="NoLongerInterested">No longer interested</option>
            <option value="Uncontactable">Uncontactable</option>
            <option value="NotEligible">Not eligible</option>
            <option value="Other">Other</option>
          </select>
        </div>
        {error && (
          <div style={{ ...s.noticeWarn, marginBottom: '12px' }}>{error}</div>
        )}
        {done && (
          <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>
            ✓ Closed as lost
          </div>
        )}
        <div style={s.modalFooter}>
          <button
            style={{ ...s.secondaryBtn, background: 'none', border: 'none' }}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            style={{ ...s.primaryBtn, background: '#dc2626', opacity: saving || done ? 0.5 : 1 }}
            onClick={handleConfirm}
            disabled={saving || done}
          >
            {done ? 'Done ✓' : saving ? 'Closing…' : 'Close as Lost'}
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
  // 19 Aug 2026, Mark's explicit request — one unified edit mode across
  // both Lead-owned fields (Personal Details/Education/Insurance
  // Information, plus Occupation/Mobile on the Lead Details card) and
  // Appointment-native fields (Appointment Details card). One Save
  // splits detailsForm into two payloads and fires both API calls — see
  // handleSaveDetails below for the full reasoning on why this stays
  // one edit mode rather than two separate ones.
  const [editingDetails,    setEditingDetails]    = useState(false);
  const [detailsForm,       setDetailsForm]       = useState({});
  const [savingDetails,     setSavingDetails]     = useState(false);
  const [detailsSaveError,  setDetailsSaveError]  = useState('');
  const [showReassign,      setShowReassign]      = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  // 24 Aug 2026 — Close as Lost, see CloseAsLostModal's own header comment.
  const [showCloseLost,     setShowCloseLost]     = useState(false);
  // §12b (21 Aug 2026) — mirrors LeadDetail.jsx's handleReopenLead
  // exactly: a direct button + loading state, no confirmation modal,
  // consistent with how that equivalent action is already handled for
  // Leads rather than inventing a different pattern here.
  const [reopening,         setReopening]         = useState(false);
  const [reopenError,       setReopenError]       = useState('');

  async function handleReopenAppointment() {
    setReopening(true);
    setReopenError('');
    try {
      await appointmentsApi.reopen(appt.id);
      refetchAudit();
      await refetchAppt();
    } catch (err) {
      setReopenError(err instanceof ApiError ? err.message : 'Could not reopen this appointment. Please try again.');
    } finally {
      setReopening(false);
    }
  }
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
      // 18 Aug 2026, Mark's explicit request — parity with the fields
      // LeadDetail.jsx already shows for the same Lead (Personal Details/
      // Education/Insurance Information sections below — renamed from
      // "Contact Details" 19 Aug 2026, see that card's own comment).
      // apptData.idNumber
      // arrives already decrypted (getAppointmentById() does this
      // server-side, deliberately as a second, detail-only query — see
      // that function's own comment for why it's not on every Appointment
      // read).
      dateOfBirth:        apptData.dateOfBirth,
      idNumber:           apptData.idNumber,
      whatsappNumber:     apptData.whatsappNumber,
      universityAttended: apptData.universityAttended,
      yearOfAttendance:   apptData.yearOfAttendance,
      degreeAttained:     apptData.degreeAttained,
      hospitalOrPractice: apptData.hospitalOrPractice,
      existingCover:      apptData.existingCover,
      policies:           apptData.policies,
      medicalAid:         apptData.medicalAid,
      medicalAidProvider: apptData.medicalAidProvider,
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
  // 19 Aug 2026, Mark's explicit request — populates one combined form
  // from `appt`'s current values, covering both categories of editable
  // field. Field-name mapping matches getAppointmentById()'s real
  // server-side names for the Appointment-native half (see
  // appointmentHandlers.js's own comment on why this file's local
  // firstDate/address aliases don't apply server-side) and the plain
  // Lead column names for the Lead-owned half (leadsApi.update expects
  // exactly what LeadDetail.jsx's own startEditing() sends).
  function startEditingDetails() {
    // Defense-in-depth, matching this file's own established pattern of
    // checking at both the trigger and the action (the isLocked-gated
    // Outcome card below does the same) — the button that calls this is
    // already hidden when isClosed, but this guard means the function
    // itself is also safe if anything else ever calls it.
    if (isClosed) return;
    setDetailsForm({
      // Lead-owned — Lead Details card
      occupation:          appt.occupation ?? '',
      mobileNumber:        appt.mobile ?? '',
      // Lead-owned — Personal Details card
      dateOfBirth:         appt.dateOfBirth ? String(appt.dateOfBirth).slice(0, 10) : '',
      idNumber:             appt.idNumber ?? '',
      whatsappNumber:      appt.whatsappNumber ?? '',
      hospitalOrPractice:  appt.hospitalOrPractice ?? '',
      // Lead-owned — Education card
      universityAttended:  appt.universityAttended ?? '',
      yearOfAttendance:    appt.yearOfAttendance ?? '',
      degreeAttained:      appt.degreeAttained ?? '',
      // Lead-owned — Insurance Information card
      existingCover:        appt.existingCover ?? null,
      policies:             appt.policies ?? '',
      medicalAid:           appt.medicalAid ?? null,
      medicalAidProvider:  appt.medicalAidProvider ?? '',
      // Appointment-native — Appointment Details card
      currentInsurer:          appt.currentInsurer ?? '',
      meetingType:              appt.meetingType ?? 'InPerson',
      firstAppointmentDate:    appt.firstDate ? String(appt.firstDate).slice(0, 10) : '',
      firstAppointmentTime:    appt.firstTime ?? '',
      firstAppointmentAddress: appt.address ?? '',
      virtualMeetingLink:      appt.virtualMeetingLink ?? '',
    });
    setDetailsSaveError('');
    setEditingDetails(true);
  }

  function setDetailsField(field, value) {
    setDetailsForm(f => ({ ...f, [field]: value }));
  }

  // Field-name lists deciding which half of detailsForm goes to which
  // API call — the actual DB-write boundary this whole feature is built
  // around (see UPDATE_LEAD_COLUMNS in leadService.js and
  // UPDATE_APPOINTMENT_COLUMNS in appointmentService.js, which these two
  // lists are deliberately kept in sync with).
  const LEAD_DETAIL_FIELDS = [
    'occupation', 'mobileNumber', 'dateOfBirth', 'idNumber', 'whatsappNumber',
    'hospitalOrPractice', 'universityAttended', 'yearOfAttendance', 'degreeAttained',
    'existingCover', 'policies', 'medicalAid', 'medicalAidProvider',
  ];
  const APPOINTMENT_DETAIL_FIELDS = [
    'currentInsurer', 'meetingType', 'firstAppointmentDate', 'firstAppointmentTime',
    'firstAppointmentAddress', 'virtualMeetingLink',
  ];

  async function handleSaveDetails() {
    setSavingDetails(true);
    setDetailsSaveError('');
    try {
      // Same stripEmpty-before-send reasoning as LeadDetail.jsx's own
      // handleSaveEdit (that file's own comment has the full account):
      // both UpdateLeadSchema and UpdateAppointmentSchema declare their
      // fields .optional() but not .nullable() — an absent key is
      // skipped server-side, but an explicit '' or null fails Zod
      // validation (idNumber's 13-digit regex, existingCover/medicalAid's
      // boolean type, the date/time regexes). Every field here starts as
      // '' or null when unset, so strip both rather than sending them.
      const leadPayload = Object.fromEntries(
        Object.entries(detailsForm)
          .filter(([k]) => LEAD_DETAIL_FIELDS.includes(k))
          .filter(([, v]) => v !== '' && v !== null)
      );
      const apptPayload = Object.fromEntries(
        Object.entries(detailsForm)
          .filter(([k]) => APPOINTMENT_DETAIL_FIELDS.includes(k))
          .filter(([, v]) => v !== '' && v !== null)
      );

      // Two independent writes, two independent tables — genuinely
      // parallel, neither depends on the other's result. Both, one, or
      // neither may have anything to send, depending which fields were
      // actually touched (an empty payload is a legitimate "nothing in
      // this category changed", not an error — the filtered object is
      // simply {} and the corresponding call is skipped).
      await Promise.all([
        Object.keys(leadPayload).length > 0 ? leadsApi.update(appt.leadId, leadPayload) : null,
        Object.keys(apptPayload).length > 0 ? appointmentsApi.update(id, apptPayload) : null,
      ]);

      setEditingDetails(false);
      refetchAudit();
      await refetchAppt();
    } catch (err) {
      setDetailsSaveError(err instanceof ApiError ? err.message : 'Could not save changes. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  }

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
            {/* Bug found 21 Aug 2026 (Mark, live testing): this button was
                gated on canManage only — zero check for isClosed, entirely
                separate from the isLocked-gated fields in the Appointment
                Outcome card below. The backend PUT lock (appointmentHandlers.js)
                already correctly rejected a save on a closed appointment, but
                nothing stopped anyone from entering edit mode and interacting
                with the fields first, which is exactly what "still editable"
                means from where Mark's sitting, regardless of what the save
                attempt would eventually do. Deliberately !isClosed here, not
                !isLocked — isLocked also covers ReturnedToLeads, a status the
                backend lock deliberately does NOT block (see that check's own
                comment); gating on the broader isLocked would have hidden this
                button for a status the server would still accept a save for,
                the same class of frontend/backend mismatch in the other
                direction. startEditingDetails() is this button's only caller
                (setEditingDetails(true) has no other call site in this file)
                — checked before assuming this one fix is sufficient. */}
            {!editingDetails && !isClosed && (
              <button style={s.secondaryBtn} onClick={startEditingDetails}>
                Edit Details
              </button>
            )}
            {editingDetails && (
              <>
                <button style={{ ...s.primaryBtn, opacity: savingDetails ? 0.5 : 1 }} disabled={savingDetails} onClick={handleSaveDetails}>
                  {savingDetails ? 'Saving…' : 'Save Changes'}
                </button>
                <button style={s.secondaryBtn} disabled={savingDetails} onClick={() => setEditingDetails(false)}>Cancel</button>
              </>
            )}
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

      {detailsSaveError && (
        <div style={{ ...s.errorBox, marginBottom: '14px' }}>{detailsSaveError}</div>
      )}

      {/* ── Detail cards ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div style={s.card}>
          <div style={s.cardTitle}>Lead Details</div>
          <FieldRow label="Name">{appt.leadName}</FieldRow>
          <FieldRow label="Region">{appt.region || '—'}</FieldRow>
          <EditableFieldRow label="Occupation" editing={editingDetails} value={editingDetails ? detailsForm.occupation : appt.occupation} onChange={v => setDetailsField('occupation', v)} />
          <EditableFieldRow label="Mobile" editing={editingDetails} value={editingDetails ? detailsForm.mobileNumber : appt.mobile} onChange={v => setDetailsField('mobileNumber', v)} />
          {/* currentInsurer is Appointment-native, not Lead-owned, despite
              sitting in this card visually (appt.currentInsurer, its own
              independent column — see UPDATE_APPOINTMENT_COLUMNS's own
              comment, appointmentService.js). Edited here regardless — it
              belongs with the rest of this page's Lead-context fields from
              a user's point of view — but detailsForm/handleSaveDetails
              correctly route it to appointmentsApi.update(), not
              leadsApi.update(), via APPOINTMENT_DETAIL_FIELDS above. */}
          <EditableFieldRow label="Current insurer" editing={editingDetails} value={editingDetails ? detailsForm.currentInsurer : appt.currentInsurer} onChange={v => setDetailsField('currentInsurer', v)} />
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
          {editingDetails ? (
            <>
              <EditableFieldRow label="First appt date" type="date" editing value={detailsForm.firstAppointmentDate} onChange={v => setDetailsField('firstAppointmentDate', v)} />
              <EditableFieldRow label="First appt time" type="time" editing value={detailsForm.firstAppointmentTime} onChange={v => setDetailsField('firstAppointmentTime', v)} />
              <EditableFieldRow label="Meeting type" type="select" options={['InPerson', 'Virtual']} editing value={detailsForm.meetingType} onChange={v => setDetailsField('meetingType', v)} />
              {detailsForm.meetingType === 'Virtual' ? (
                <EditableFieldRow label="Meeting link" editing value={detailsForm.virtualMeetingLink} onChange={v => setDetailsField('virtualMeetingLink', v)} />
              ) : (
                <EditableFieldRow label="Address" editing value={detailsForm.firstAppointmentAddress} onChange={v => setDetailsField('firstAppointmentAddress', v)} />
              )}
            </>
          ) : (
            <>
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
            </>
          )}
          <FieldRow label="Broker">{appt.brokerName}</FieldRow>
          <FieldRow label="Agent">{appt.agentName}</FieldRow>
          <FieldRow label="Source">{appt.source}</FieldRow>
        </div>
      </div>

      {/* ── Lead detail parity — 18 Aug 2026, Mark's explicit request ───────
          Same three section titles LeadDetail.jsx uses (Personal Details/
          Education/Insurance Information), same field order. Editable
          19 Aug 2026, Mark's explicit request — writes straight to the
          same Lead row via leadsApi.update(appt.leadId, ...) in
          handleSaveDetails above, the exact endpoint LeadDetail.jsx's own
          edit form already uses; nothing duplicated, just a second place
          to reach the same record. "Personal Details" — renamed from
          "Contact Details" 19 Aug 2026, Mark's explicit request: ID
          Number and Hospital/Practice under a "Contact" heading read
          wrong once ID Number joined it. Read-only values still come
          from getAppointmentById()'s own second, detail-only Lead query
          (appointmentService.js) — see that function's comment for why
          this isn't in the shared APPOINTMENT_SELECT the Appointments
          list and claim pool also use. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div style={s.card}>
          <div style={s.cardTitle}>Personal Details</div>
          <EditableFieldRow label="Date of Birth" type="date" editing={editingDetails} value={editingDetails ? detailsForm.dateOfBirth : appt.dateOfBirth} onChange={v => setDetailsField('dateOfBirth', v)} />
          <EditableFieldRow label="ID Number" editing={editingDetails} value={editingDetails ? detailsForm.idNumber : appt.idNumber} onChange={v => setDetailsField('idNumber', v.replace(/\D/g, '').slice(0, 13))} />
          <EditableFieldRow label="WhatsApp" editing={editingDetails} value={editingDetails ? detailsForm.whatsappNumber : appt.whatsappNumber} onChange={v => setDetailsField('whatsappNumber', v)} />
          <EditableFieldRow label="Hospital / Practice" editing={editingDetails} value={editingDetails ? detailsForm.hospitalOrPractice : appt.hospitalOrPractice} onChange={v => setDetailsField('hospitalOrPractice', v)} />
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Education</div>
          <EditableFieldRow label="University" editing={editingDetails} value={editingDetails ? detailsForm.universityAttended : appt.universityAttended} onChange={v => setDetailsField('universityAttended', v)} />
          <EditableFieldRow label="Year" type="number" editing={editingDetails} value={editingDetails ? detailsForm.yearOfAttendance : appt.yearOfAttendance} onChange={v => setDetailsField('yearOfAttendance', v)} />
          <EditableFieldRow label="Degree" editing={editingDetails} value={editingDetails ? detailsForm.degreeAttained : appt.degreeAttained} onChange={v => setDetailsField('degreeAttained', v)} />
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Insurance Information</div>
          <EditableFieldRow label="Existing cover" type="bool" editing={editingDetails} value={editingDetails ? detailsForm.existingCover : appt.existingCover} onChange={v => setDetailsField('existingCover', v)} />
          <EditableFieldRow label="Current policies" editing={editingDetails} value={editingDetails ? detailsForm.policies : appt.policies} onChange={v => setDetailsField('policies', v)} />
          <EditableFieldRow label="Medical aid" type="bool" editing={editingDetails} value={editingDetails ? detailsForm.medicalAid : appt.medicalAid} onChange={v => setDetailsField('medicalAid', v)} />
          <EditableFieldRow label="Medical aid provider" editing={editingDetails} value={editingDetails ? detailsForm.medicalAidProvider : appt.medicalAidProvider} onChange={v => setDetailsField('medicalAidProvider', v)} />
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

      {/* ── Close as Lost (no meeting ever held) ────────────────────────────── */}
      {/* 24 Aug 2026, Mark's explicit request — see CloseAsLostModal's own
          header comment for the full reasoning. Hidden once outcomeDue is
          true — the Outcome card immediately below already covers closing
          the deal at that point, so this would just be a redundant second
          path to the same place. Hidden once isLocked, obviously — nothing
          left to close. */}
      {!isLocked && !outcomeDue && (
        <div style={{ ...s.card, marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px' }}>Not progressing?</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--mut)' }}>
              If this lead has stopped responding or repeatedly cancels, close the appointment as lost rather than leaving it open indefinitely.
            </div>
          </div>
          <button
            style={{ ...s.secondaryBtn, color: '#dc2626', borderColor: '#fca5a5', whiteSpace: 'nowrap' }}
            onClick={() => setShowCloseLost(true)}
          >
            Close as Lost
          </button>
        </div>
      )}

      {/* ── Appointment outcome ─────────────────────────────────────────────── */}
      {/* 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
          was gated on meetingHasData(appt.meetings[0]) (any data at all
          on meeting 1); now gated on outcomeDue specifically — matches
          the spec's own routing table exactly: this section has no
          reason to appear while a Rescheduled or follow-up-pending
          meeting is still in play, only once a meeting attempt has
          actually resolved to an outcome.
          BROADENED 24 Aug 2026 to (outcomeDue || isLocked) — a real,
          pre-existing gap found while building Close as Lost, not part of
          that feature's own logic: this card is also what renders the
          ReturnedToLeads "locked as history" notice and the ClosedLost
          Reopen button (both further down, gated on appt.status directly,
          not on outcomeDue) — so ANY appointment that reached a locked
          status without ever having a meeting held (Return to Leads at any
          point before a meeting, or now, Close as Lost) rendered neither
          notice nor Reopen button at all, on the unbroadened gate. Every
          field inside this card already disables correctly off
          isLocked/isClosed independently of outcomeDue, so broadening the
          outer gate is safe — confirmed by reading the full card before
          making this change, not assumed. */}
      {(outcomeDue || isLocked) && (
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
          <div style={{ ...s.noticeInfo, marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span>This appointment is closed ({appt.status === 'ClosedWon' ? 'Closed Won' : 'Closed Lost'}) and can no longer be edited.</span>
            {/* §12b (21 Aug 2026), Mark's explicit request — the escape
                hatch for the new server-side lock (appointmentHandlers.js).
                ClosedLost only, Admin/Supervisor only — matches
                reopenAppointment()'s own precondition (appointmentService.js)
                exactly: reversing a Closed Won outcome is a bigger, separate
                decision than fixing a mistaken loss, not what this button is
                for, so it doesn't render at all for a won appointment rather
                than rendering disabled with no explanation. */}
            {canManage && appt.status === 'ClosedLost' && (
              <button
                onClick={handleReopenAppointment}
                disabled={reopening}
                style={{ background: 'none', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: reopening ? 0.6 : 1 }}
              >
                {reopening ? 'Reopening…' : '↺ Reopen Appointment'}
              </button>
            )}
          </div>
        )}
        {reopenError && (
          <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.8125rem', marginBottom: '14px' }}>{reopenError}</div>
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
                {/* 24 Aug 2026 (migration 038) — deliberately NOT a normal
                    selectable option alongside the six above: this value
                    is written only by appointmentService.
                    closeOpenAppointmentsForErasure() (POPIA erasure/
                    restriction), never by a person choosing it here. This
                    appointment is already isLocked (disabled) by the time
                    it could ever show, so rendering it conditionally,
                    only when it's already the current value, is purely so
                    the <select> displays the real reason instead of
                    falling back to a blank "Please select" — not an
                    invitation to pick it on some other, still-open
                    appointment. */}
                {appt.lostReason === 'ConsentWithdrawn' && (
                  <option value="ConsentWithdrawn">Consent withdrawn (POPIA)</option>
                )}
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

      {/* ── Close as Lost modal ──────────────────────────────────────────────── */}
      {showCloseLost && (
        <CloseAsLostModal
          appointment={appt}
          onClose={() => setShowCloseLost(false)}
          onClosed={() => { refetchAppt(); refetchAudit(); setShowCloseLost(false); }}
        />
      )}
    </div>
  );
}
