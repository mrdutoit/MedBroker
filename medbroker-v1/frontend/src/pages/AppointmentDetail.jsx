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
import { useParams, useNavigate } from 'react-router-dom';
import { useRole, PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext';
import { useFlags }                           from '../context/FlagContext';
import { useWindowSize }                      from '../hooks/useWindowSize';
import { useFetch }                           from '../hooks/useFetch.js';
import { appointmentsApi, usersApi }          from '../services/api';
import { s, APPT_STATUS_META }                from '../styles/tokens.js';
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
  portfolio: '', portfolios: [], source: '', productsInterested: [],
  status: '', firstDate: '', firstTime: '', address: '', brokerName: '', agentName: '',
  brokerSwitch: false, customerSigned: null, productsSold: [],
  meetings: [
    { number: 1, date: '', status: '', notes: '', required: true },
    { number: 2, date: '', status: '', notes: '', required: true },
    { number: 3, date: '', status: '', notes: '', required: false },
  ],
};


const MEETING_STATUSES = ['Seen', 'Rescheduled', 'Cancelled'];

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
// component.
function MeetingSection({ meeting, onChange, onSave, saving, onMarkHeld, marking, justSaved, held, onUnlock, isMobile, disabled }) {
  const isOptional = meeting.number === 3;
  const titles = ['', 'First Meeting', 'Second Meeting', 'Third Meeting'];
  // `held` is the true, persisted lock state — set by the parent from
  // heldMeetingNums, which only changes on a successful save, never from
  // the draft dropdown selection (23 Jul 2026 fix, Mark's request: picking
  // "Seen" from Status must not itself lock anything — only Save Changes
  // persisting that choice should. See handleSaveMeeting/
  // handleMarkMeetingHeld's heldMeetingNums updates in the main component).
  const locked = disabled || held;
  const canMarkHeld = !locked && !!meeting.date;
  const busy = saving || marking;

  return (
    <div style={{ ...s.card, borderStyle: isOptional ? 'dashed' : 'solid', marginBottom: '12px', opacity: disabled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...s.cardTitle }}>
        <span>{titles[meeting.number]}</span>
        {held && (
          <span style={{ ...s.badge, background: 'color-mix(in srgb, #15803d 14%, var(--panel))', color: '#15803d', fontWeight: 600 }}>
            ✓ Held
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={s.formLabel}>Date</label>
          <input
            type="date"
            style={{ ...s.formInput, opacity: locked ? 0.6 : 1 }}
            value={meeting.date}
            disabled={locked}
            onChange={e => onChange(meeting.number, 'date', e.target.value)}
          />
          {!locked && meeting.status && meeting.status !== 'Seen' && (
            <p style={{ ...s.formHint, marginTop: '4px' }}>
              {meeting.status === 'Rescheduled'
                ? 'Client rescheduled — enter the new date above, still against this meeting.'
                : 'Client cancelled — enter a new date above if one is set, still against this meeting.'}
            </p>
          )}
          {!locked && meeting.status === 'Seen' && (
            <p style={{ ...s.formHint, marginTop: '4px' }}>
              Add any notes below, then Save Changes to lock this meeting in as held.
            </p>
          )}
        </div>
        <div>
          <label style={s.formLabel}>Status</label>
          <select
            style={{ ...s.formInput, opacity: locked ? 0.6 : 1 }}
            value={meeting.status}
            disabled={locked}
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
          style={{ ...s.formInput, height: '60px', resize: 'vertical', opacity: locked ? 0.6 : 1 }}
          placeholder="Notes from the meeting…"
          value={meeting.notes}
          disabled={locked}
          onChange={e => onChange(meeting.number, 'notes', e.target.value)}
        />
      </div>
      {!locked && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{ ...s.secondaryBtn, opacity: busy ? 0.5 : 1 }}
            disabled={busy}
            onClick={() => onSave(meeting.number)}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            style={{ ...s.secondaryBtn, opacity: (!canMarkHeld || busy) ? 0.5 : 1 }}
            disabled={!canMarkHeld || busy}
            onClick={() => onMarkHeld(meeting.number)}
          >
            {marking ? 'Saving…' : '✓ Mark Meeting Held'}
          </button>
          {justSaved && (
            <span style={{ fontSize: '0.8125rem', color: '#15803d' }}>✓ Saved</span>
          )}
          {!meeting.date && (
            <span style={{ fontSize: '0.75rem', color: 'var(--mut)' }}>
              Set a date before marking this meeting held.
            </span>
          )}
        </div>
      )}
      {/* Unlock — added 23 Jul 2026, Mark's request: once saved as held, a
          user should still be able to re-open it for editing rather than
          it being permanently frozen. Purely a local override (no server
          call) — the fields become editable again, and the next successful
          save re-applies the real lock rule based on whatever gets saved. */}
      {held && !disabled && (
        <div style={{ marginTop: '12px' }}>
          <button
            type="button"
            style={s.secondaryBtn}
            onClick={() => onUnlock(meeting.number)}
          >
            🔓 Unlock to Edit
          </button>
        </div>
      )}
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
  const { data: agentsData } = useFetch(() => usersApi.list({ role: 'Agent' }), []);
  const realAgents = agentsData?.users ?? [];
  // Change Log — GET /api/appointments/:id/audit, same generic AuditLog
  // table the Lead side reads from. Refetched alongside the appointment
  // itself whenever an action (outcome save, reassign, meeting held) writes
  // a new entry, via the same refetchAppt-triggered re-render pattern.
  const { data: auditData, refetch: refetchAudit } = useFetch(() => appointmentsApi.auditLog(id), [id]);
  const auditEntries = auditData?.entries ?? [];

  const [appt,              setAppt]              = useState({ ...EMPTY_APPOINTMENT, id: id ?? '' });
  const [showReassign,      setShowReassign]      = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [outcomeSaved,      setOutcomeSaved]      = useState(false);
  const [savingOutcome,     setSavingOutcome]     = useState(false);
  const [outcomeError,      setOutcomeError]      = useState(null);
  const [markingHeld,       setMarkingHeld]       = useState(null); // meeting number currently being marked Held, or null
  const [savingMeetingNum,  setSavingMeetingNum]  = useState(null); // meeting number currently being saved, or null
  const [savedMeetingNum,   setSavedMeetingNum]   = useState(null); // meeting number just saved (transient ✓), or null
  // heldMeetingNums — the TRUE, persisted lock state (23 Jul 2026 fix, Mark's
  // request). Only ever set from apptData (on fetch) or from a successful
  // save's own response — never from the draft appt.meetings, so merely
  // selecting "Seen" in the Status dropdown can't lock anything by itself.
  const [heldMeetingNums,    setHeldMeetingNums]    = useState(() => new Set());
  // unlockedMeetingNums — a meeting the user has explicitly re-opened for
  // editing despite being held. Purely local; cleared whenever that meeting
  // is next saved (the save itself re-applies the real lock rule) or when
  // fresh data arrives from the server.
  const [unlockedMeetingNums, setUnlockedMeetingNums] = useState(() => new Set());
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
      portfolios:     apptData.portfolios ?? (apptData.portfolio ? [apptData.portfolio] : []),
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
      // apptData.productsSold is [{name, value}] from the API (§44) — map
      // to {product, value} to match this component's own field naming.
      productsSold:   (apptData.productsSold ?? []).map(p => ({ product: p.name, value: p.value })),
      meetings: [1, 2, 3].map((n) => ({
        number:   n,
        // .slice(0, 10) — apptData[`meeting${n}Date`] comes back as a full
        // ISO timestamp ("2026-07-24T00:00:00.000Z"), not a plain
        // 'YYYY-MM-DD' string: node-postgres parses DATE columns into JS
        // Date objects (no custom type parser registered in db.js — same
        // root cause as the Lead Audit Log's false Date of Birth diffs,
        // just a different symptom here). <input type="date"> requires the
        // value to be exactly 'YYYY-MM-DD' — anything else is silently
        // treated as invalid and rendered as an empty field, no error, no
        // console warning. That's what Mark saw: the meeting was genuinely
        // saved (Status and Feedback round-tripped fine, both plain
        // strings with no format requirement), but the Date field looked
        // empty on every reload. Confirmed against the actual API response
        // shape before writing this fix, not assumed.
        date:     (apptData[`meeting${n}Date`] ?? '').slice(0, 10),
        status:   apptData[`meeting${n}Status`] ?? '',
        notes:    apptData[`meeting${n}Feedback`] ?? '',
        required: n < 3,
      })),
    });
    // heldMeetingNums reflects the server's own record of what's genuinely
    // been saved as Seen — this, not the draft above, is what drives
    // locking. Any pending "Unlock to Edit" override is reset too: fresh
    // data from the server is the new source of truth, so a stale local
    // override shouldn't linger past a refetch.
    setHeldMeetingNums(new Set([1, 2, 3].filter(n => apptData[`meeting${n}Status`] === 'Seen')));
    setUnlockedMeetingNums(new Set());
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
  const firstMeetingComplete  = heldMeetingNums.has(1);
  const secondMeetingComplete = heldMeetingNums.has(2);

  // Changed 23 Jul 2026 (§45) — was scoped to appt.portfolio (the primary
  // only). An appointment can now cover more than one portfolio, so
  // Products Sold needs the union across all of them — otherwise a
  // product genuinely sold from a non-primary portfolio would never even
  // appear as a checkbox to record it against.
  const productsForPortfolio = appt.portfolios.flatMap(name =>
    PRODUCTS_BY_PORTFOLIO[name === 'Discovery' ? 'disc' : 'mm'] ?? []
  );

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
      refetchAudit();
      setTimeout(() => setOutcomeSaved(false), 3000);
    } catch (err) {
      setOutcomeError(err?.message ?? 'Could not save the outcome. Please try again.');
    } finally {
      setSavingOutcome(false);
    }
  }

  // Save Changes — generic per-meeting save, added 23 Jul 2026 to fix a real
  // gap: Mark Meeting Held was the ONLY save action on a meeting, and it
  // forces status to 'Seen'. A broker who selects Rescheduled or Cancelled
  // and enters a new date (or just adds notes) had no way to persist that —
  // the general Save Outcome button lives on a different card, gated behind
  // the first meeting having data, and isn't an obvious place to look for
  // "save my reschedule". This saves exactly the current draft state of one
  // meeting, whatever it is, without forcing a status.
  async function handleSaveMeeting(meetingNumber) {
    const meeting = appt.meetings.find(m => m.number === meetingNumber);
    if (!meeting) return;
    setSavingMeetingNum(meetingNumber);
    setSavedMeetingNum(null);
    setOutcomeError(null);
    try {
      const savedStatus = meeting.status || '';
      const result = await appointmentsApi.saveOutcome(appt.id, {
        meetings: [{ number: meetingNumber, date: meeting.date, status: savedStatus, notes: meeting.notes }],
      });
      setAppt(prev => ({ ...prev, status: result?.status ?? prev.status }));
      // The actual lock decision — only a genuine save can add or remove a
      // meeting from heldMeetingNums, never the draft dropdown selection.
      setHeldMeetingNums(prev => {
        const next = new Set(prev);
        if (savedStatus === 'Seen') next.add(meetingNumber); else next.delete(meetingNumber);
        return next;
      });
      setUnlockedMeetingNums(prev => {
        if (!prev.has(meetingNumber)) return prev;
        const next = new Set(prev);
        next.delete(meetingNumber);
        return next;
      });
      refetchAudit();
      setSavedMeetingNum(meetingNumber);
      setTimeout(() => setSavedMeetingNum(null), 3000);
    } catch (err) {
      setOutcomeError(err?.message ?? 'Could not save this meeting. Please try again.');
    } finally {
      setSavingMeetingNum(null);
    }
  }

  // Mark Meeting Held — the dedicated action Mark asked for, distinct from
  // just picking "Seen" in the status dropdown: it immediately persists and
  // locks THIS meeting (date/status/notes become read-only) and, once
  // saved, unlocks the next meeting's Add-meeting prompt. Scoped to send
  // only this meeting's fields — customerSigned/productsSold/other meetings
  // are omitted from the payload so they can't be accidentally overwritten
  // by whatever's currently in the rest of the draft form.
  async function handleMarkMeetingHeld(meetingNumber) {
    const meeting = appt.meetings.find(m => m.number === meetingNumber);
    if (!meeting?.date) return;
    setMarkingHeld(meetingNumber);
    setOutcomeError(null);
    try {
      const result = await appointmentsApi.saveOutcome(appt.id, {
        meetings: [{ number: meetingNumber, date: meeting.date, status: 'Seen', notes: meeting.notes }],
      });
      setAppt(prev => ({
        ...prev,
        status: result?.status ?? prev.status,
        meetings: prev.meetings.map(m => m.number === meetingNumber ? { ...m, status: 'Seen' } : m),
      }));
      setHeldMeetingNums(prev => new Set(prev).add(meetingNumber));
      setUnlockedMeetingNums(prev => {
        if (!prev.has(meetingNumber)) return prev;
        const next = new Set(prev);
        next.delete(meetingNumber);
        return next;
      });
      refetchAudit();
    } catch (err) {
      setOutcomeError(err?.message ?? 'Could not mark this meeting held. Please try again.');
    } finally {
      setMarkingHeld(null);
    }
  }

  // Unlock to Edit — added 23 Jul 2026, Mark's request: a held meeting
  // shouldn't be permanently frozen. Purely local (no API call) — just
  // lets the fields become editable again. The next successful save on
  // that meeting re-applies the real lock (held again if saved as Seen,
  // unlocked if saved as anything else) via handleSaveMeeting/
  // handleMarkMeetingHeld above, not this function.
  function handleUnlockMeeting(meetingNumber) {
    setUnlockedMeetingNums(prev => new Set(prev).add(meetingNumber));
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
          <FieldRow label="Address">{appt.address}</FieldRow>
          <FieldRow label="Broker">{appt.brokerName}</FieldRow>
          <FieldRow label="Agent">{appt.agentName}</FieldRow>
          <FieldRow label="Source">{appt.source}</FieldRow>
        </div>
      </div>

      {/* ── Meeting tracking ────────────────────────────────────────────────── */}
      <MeetingSection
        meeting={appt.meetings[0]} onChange={handleMeetingChange}
        onSave={handleSaveMeeting} saving={savingMeetingNum === 1} justSaved={savedMeetingNum === 1}
        onMarkHeld={handleMarkMeetingHeld} marking={markingHeld === 1}
        held={heldMeetingNums.has(1) && !unlockedMeetingNums.has(1)} onUnlock={handleUnlockMeeting}
        isMobile={isMobile} disabled={isLocked}
      />

      {secondMeetingCreated ? (
        <MeetingSection
          meeting={appt.meetings[1]} onChange={handleMeetingChange}
          onSave={handleSaveMeeting} saving={savingMeetingNum === 2} justSaved={savedMeetingNum === 2}
          onMarkHeld={handleMarkMeetingHeld} marking={markingHeld === 2}
          held={heldMeetingNums.has(2) && !unlockedMeetingNums.has(2)} onUnlock={handleUnlockMeeting}
          isMobile={isMobile} disabled={isLocked}
        />
      ) : (
        <AddMeetingPrompt
          label="Add Second Meeting"
          unlocked={firstMeetingComplete && !isLocked}
          unlockHint="Mark the First Meeting Held before adding a Second Meeting."
          onClick={() => setSecondMeetingCreated(true)}
        />
      )}

      {thirdMeetingEnabled && secondMeetingCreated && (
        thirdMeetingCreated ? (
          <MeetingSection
            meeting={appt.meetings[2]} onChange={handleMeetingChange}
            onSave={handleSaveMeeting} saving={savingMeetingNum === 3} justSaved={savedMeetingNum === 3}
            onMarkHeld={handleMarkMeetingHeld} marking={markingHeld === 3}
            held={heldMeetingNums.has(3) && !unlockedMeetingNums.has(3)} onUnlock={handleUnlockMeeting}
            isMobile={isMobile} disabled={isLocked}
          />
        ) : (
          <AddMeetingPrompt
            label="Add Third Meeting"
            unlocked={secondMeetingComplete && !isLocked}
            unlockHint="Mark the Second Meeting Held before adding a Third Meeting."
            onClick={() => setThirdMeetingCreated(true)}
          />
        )
      )}

      {/* ── Appointment outcome ─────────────────────────────────────────────── */}
      {/* Only shown once the First Meeting actually has details — no meeting,
          nothing to report an outcome on yet (Mark's request). */}
      {meetingHasData(appt.meetings[0]) && (
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
              value={appt.customerSigned === null ? '' : appt.customerSigned ? 'Yes' : 'No'}
              disabled={isLocked}
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
        <AuditLogList entries={auditEntries} emptyLabel="No changes recorded yet." />
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
