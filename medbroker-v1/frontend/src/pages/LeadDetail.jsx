/**
 * pages/LeadDetail.jsx
 *
 * Lead pipeline status transitions driven by call outcomes:
 *
 *   Call outcome        │ Status change
 *   ────────────────────┼──────────────────────────────────────────
 *   NoAnswer            │ No change (didn't reach the prospect)
 *   Voicemail left      │ Assigned/Unassigned → InProgress
 *   Wrong number        │ Any → Closed
 *   Callback requested  │ Assigned/Unassigned → InProgress
 *   Client contacted    │ Assigned/Unassigned → InProgress
 *                       │ + shows Book Appointment button inline
 *   Not interested      │ Any → Closed
 *   (Book Appointment)  │ InProgress/Assigned → AppointmentScheduled
 *
 *   AppointmentScheduled is NOT a call outcome — it is the result of
 *   clicking "Book Appointment" and confirming the booking details.
 *   It is handled separately by the Book Appointment modal.
 *
 * Book Appointment button is visible only for Assigned or InProgress leads.
 * It is hidden for Unassigned (no agent yet), AppointmentScheduled (already
 * converted), and Closed leads.
 *
 * In production: status transitions are computed server-side by
 * leadStatusService.js based on current status + outcome. The client
 * reflects the result returned by the API.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useFetch } from '../hooks/useFetch.js';
import { leadsApi, appointmentsApi, brokerMatchingApi, ApiError } from '../services/api.js';
import { formatDistanceToNow, format } from 'date-fns';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { REGIONS, JOB_TITLES } from '../constants/leadOptions.js';
import AuditLogList from '../components/AuditLogList.jsx';
import { s, APPT_STATUS_META } from '../styles/tokens.js';

// ─── Status transition machine (mirrors server-side leadStatusService.js) ─────
function computeNewStatus(currentStatus, outcome) {
  if (outcome === 'AppointmentScheduled') return 'AppointmentScheduled'; // via Book Appointment only
  if (outcome === 'WrongNumber')          return 'Closed';
  if (outcome === 'NotInterested')        return 'Closed';
  if (outcome === 'NoAnswer')             return currentStatus; // no change
  // ClientContacted, Voicemail, CallbackRequested — move to InProgress if not already beyond
  if (currentStatus === 'Unassigned' || currentStatus === 'Assigned') return 'InProgress';
  return currentStatus; // already InProgress or terminal — no change
}

// ─── Status colours ────────────────────────────────────────────────────────────
const STATUS_COLOURS = {
  Unassigned:           { bg: 'var(--panel2)', text: 'var(--mut)', border: 'var(--line)' },
  Assigned:             { bg: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))', text: 'var(--accent)', border: 'color-mix(in srgb, #1d4ed8 30%, var(--panel))' },
  InProgress:           { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', text: '#d97706', border: 'color-mix(in srgb, #d97706 30%, var(--panel))' },
  AppointmentScheduled: { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', text: '#a78bfa', border: 'color-mix(in srgb, #7c3aed 30%, var(--panel))' },
  Closed:               { bg: 'var(--panel2)', text: 'var(--mut)', border: 'var(--line)' },
};

// ─── Call outcomes — available in the Log Call dropdown ───────────────────────
// AppointmentScheduled is NOT listed here — it is driven by Book Appointment.
// ClientContacted is the key qualifying outcome: prospect was reached and
// expressed interest. When selected, a Book Appointment button is shown inline.
const CALL_OUTCOMES = [
  { value: 'NoAnswer',          label: 'No answer' },
  { value: 'Voicemail',         label: 'Voicemail left' },
  { value: 'WrongNumber',       label: 'Wrong number' },
  { value: 'CallbackRequested', label: 'Callback requested' },
  { value: 'ClientContacted',   label: 'Client contacted' },
  { value: 'NotInterested',     label: 'Not interested' },
];

const OUTCOME_COLOURS = {
  NoAnswer:             { bg: 'var(--panel2)', text: 'var(--mut)' },
  Voicemail:            { bg: 'var(--panel2)', text: 'var(--mut)' },
  WrongNumber:          { bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))', text: '#dc2626' },
  CallbackRequested:    { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', text: '#d97706' },
  ClientContacted:      { bg: 'color-mix(in srgb, #15803d 14%, var(--panel))', text: '#15803d' },
  NotInterested:        { bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))', text: '#dc2626' },
  AppointmentScheduled: { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', text: '#a78bfa' },
};

const OUTCOME_LABELS = {
  NoAnswer:             'No answer',
  Voicemail:            'Voicemail left',
  WrongNumber:          'Wrong number',
  CallbackRequested:    'Callback requested',
  ClientContacted:      'Client contacted',
  NotInterested:        'Not interested',
  AppointmentScheduled: 'Appointment scheduled',
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, value, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
      <span style={{ color:'var(--mut)', flexShrink: 0 }}>{label}</span>
      <span style={{ color:'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{children ?? value ?? '—'}</span>
    </div>
  );
}

// Edit-mode counterpart to Field — same row shape, but the value slot
// becomes an input/select/textarea when `editing` is true. Added 23 Jul
// 2026 (Mark's request): LeadDetail previously rendered every Contact
// Details/Education/Insurance field read-only even though the same fields
// are editable on the Lead creation form. `type` selects the control:
// 'text' | 'date' | 'number' | 'select' | 'textarea' | 'bool'.
function EditableField({ label, editing, type = 'text', value, onChange, options }) {
  const inputStyle = { border: '1px solid var(--line)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.8125rem', fontFamily: 'inherit', textAlign: 'right', width: '60%', boxSizing: 'border-box' };

  if (!editing) {
    let display = value;
    if (type === 'bool') display = value === true ? 'Yes' : value === false ? 'No' : '—';
    if (type === 'date' && value) display = format(new Date(value), 'd MMM yyyy');
    return <Field label={label} value={display} />;
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
      {type === 'textarea' && (
        <textarea style={{ ...inputStyle, height: '48px', resize: 'vertical' }} value={value ?? ''} onChange={e => onChange(e.target.value)} />
      )}
      {(type === 'text' || type === 'date' || type === 'number') && (
        <input type={type} style={inputStyle} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
      )}
    </div>
  );
}

// Mirrors AppointmentDetail.jsx's StatusChip — same pill treatment, reusing
// this file's own STATUS_COLOURS (Lead and Appointment have separate status sets).
function StatusPill({ status }) {
  const sc = STATUS_COLOURS[status] ?? STATUS_COLOURS.Unassigned;
  const label = status === 'InProgress' ? 'In Progress' : status === 'AppointmentScheduled' ? 'Converted (to Appointment)' : status;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '20px',
      fontSize: '0.75rem', fontWeight: 500,
      background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
    }}>
      {label}
    </span>
  );
}

// Mirrors AppointmentDetail.jsx's PortfolioPill — same colour convention.
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
      {isMM ? 'M&M' : (portfolio ?? '—')}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function LeadDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { isMobile } = useWindowSize();
  const { role, persona, portfolios: allPortfolios, productsByPortfolio } = useRole();

  const { data: lead, loading: leadLoading, error: leadError, refetch: refetchLead } = useFetch(() => leadsApi.get(id), [id]);
  const baseLead = lead ?? {};

  // Real call history — GET /api/leads/:id/calls, added alongside an
  // earlier wiring pass; previously nothing ever fetched it back, so
  // "Recent Calls" only ever reflected whatever was logged in the
  // current browser session.
  const { data: callsData } = useFetch(() => leadsApi.listCalls(id), [id]);

  // Audit Log — GET /api/leads/:id/audit, added 23 Jul 2026 alongside the
  // editable-fields work below (every save through that form writes a
  // LeadUpdated entry here).
  // §133 (6 Aug 2026) — CORRECTED: this used to destructure only data
  // and refetch from useFetch, discarding the error it already exposes.
  // Mark caught this indirectly: §132's audit-query bug was ALSO
  // failing every load of this exact panel, but instead of showing an
  // error, a failed fetch (data stays null) silently rendered as
  // "Audit Log (0)" / "No changes recorded yet." — indistinguishable
  // from a lead that genuinely has no history. Same fix applied to
  // AppointmentDetail.jsx's Change Log, which had the identical gap.
  const { data: auditData, error: auditError, refetch: refetchAudit } = useFetch(() => leadsApi.auditLog(id), [id]);
  const auditEntries = auditData?.entries ?? [];

  // Appointment History — GET /api/appointments?leadId=:id. A Lead has been
  // one-to-many with Appointment since §35 (a Closed Lost attempt followed
  // by Reopen + a second booking leaves two rows, both real history) but
  // until now LeadDetail only ever showed the single most recent one (the
  // conversion banner's "View in Appointments" link, driven by
  // baseLead.appointmentId from leadService's LATERAL join) — and that
  // banner disappears entirely once a lead is reopened, taking the only
  // link to its appointment history with it. This card is independent of
  // isConverted for exactly that reason — the history stays visible
  // whether the lead is currently converted, reopened, or closed.
  const { data: apptHistoryData } = useFetch(() => appointmentsApi.list({ leadId: id, pageSize: 50 }), [id]);
  const appointmentHistory = (apptHistoryData?.appointments ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Local status override — reflects transitions immediately after an
  // action, before the next real fetch would otherwise pick them up.
  const [statusOverride,   setStatusOverride]   = useState(null);
  const [bookingConfirmed, setBookingConfirmed]  = useState(false);
  const [reopening,        setReopening]        = useState(false);
  const [reopenError,      setReopenError]      = useState('');

  const currentStatus = bookingConfirmed
    ? 'AppointmentScheduled'
    : (statusOverride ?? baseLead.pipelineStatus ?? 'Unassigned');

  const isConverted = currentStatus === 'AppointmentScheduled';
  const isClosed    = currentStatus === 'Closed';
  // Book Appointment only available for active, assigned/in-progress leads
  // — AND only if the lead genuinely has an assigned agent, checked
  // directly rather than inferred from the status string. Added 23 Jul
  // 2026: Mark hit "This lead has no assigned agent" from the server
  // after filling out the entire booking form, which the status-only
  // check should have prevented reaching in the first place — Assigned/
  // InProgress is SUPPOSED to imply an agent is set, but checking the
  // actual field directly is a strictly safer guard than trusting that
  // invariant always holds, and costs nothing extra to check.
  const canBook     = (currentStatus === 'Assigned' || currentStatus === 'InProgress') && !!baseLead.assignedAgentId;

  // Editable-fields permission — assigned Agent, Supervisor, or Admin/
  // GlobalAdmin, matching the server-side check in leadHandlers.js exactly
  // (this is a UX gate only; the real enforcement is server-side). Locked
  // once Converted (23 Jul 2026, Mark's request) — stays locked through
  // ClosedWon permanently, and through ClosedLost until reopened.
  const isAdminRole = role === 'Admin' || role === 'GlobalAdmin';
  const canEdit    = (isAdminRole || role === 'Supervisor' || (role === 'Agent' && baseLead.assignedAgentId === persona.id)) && !isConverted;
  // Reopen is Admin/Supervisor only, manual (Mark's explicit choice over
  // an automatic unlock) — only meaningful once Converted AND the most
  // recent appointment is genuinely Closed Lost.
  const canManage  = isAdminRole || role === 'Supervisor';
  const canReopen  = canManage && isConverted && baseLead.appointmentStatus === 'ClosedLost';

  async function handleReopenLead() {
    setReopening(true);
    setReopenError('');
    try {
      await leadsApi.reopen(id);
      setStatusOverride('InProgress');
      refetchAudit();
      await refetchLead();
    } catch (err) {
      setReopenError(err instanceof ApiError ? err.message : 'Could not reopen this lead. Please try again.');
    } finally {
      setReopening(false);
    }
  }

  const [showCallForm,     setShowCallForm]      = useState(false);
  const [showBookForm,     setShowBookForm]      = useState(false);
  const [callForm,         setCallForm]          = useState({ outcome: '', notes: '', callbackDateTime: '' });
  const [calls,            setCalls]             = useState([]);
  const [submitting,       setSubmitting]        = useState(false);
  const [submitError,      setSubmitError]       = useState('');

  // Edit mode — Personal Details / Education / Insurance Information cards.
  // Renamed from "Contact Details" 19 Aug 2026, Mark's explicit request —
  // ID Number and Hospital/Practice living under a "Contact" heading read
  // wrong once ID Number joined this section (18 Aug 2026). "Personal
  // Details" covers the actual mix (identity + contact info) honestly,
  // and is the locally-idiomatic heading SA forms already use for this
  // exact combination — no field moved, only the label.
  const [editing,     setEditing]     = useState(false);
  const [editForm,    setEditForm]    = useState(null);
  const [savingEdit,  setSavingEdit]  = useState(false);
  const [editError,   setEditError]   = useState('');

  function startEditing() {
    setEditForm({
      dateOfBirth: baseLead.dateOfBirth ? String(baseLead.dateOfBirth).slice(0, 10) : '',
      // 18 Aug 2026, Mark's explicit request — was never on this page at
      // all before. baseLead.idNumber arrives already decrypted
      // (getLeadById() does this server-side; see that function's own
      // comment) — this form never handles the encrypted form directly.
      idNumber: baseLead.idNumber ?? '',
      email: baseLead.email ?? '', mobileNumber: baseLead.mobileNumber ?? '', whatsappNumber: baseLead.whatsappNumber ?? '',
      occupation: baseLead.occupation ?? '', hospitalOrPractice: baseLead.hospitalOrPractice ?? '',
      universityAttended: baseLead.universityAttended ?? '', yearOfAttendance: baseLead.yearOfAttendance ?? '',
      degreeAttained: baseLead.degreeAttained ?? '',
      existingCover: baseLead.existingCover ?? null, policies: baseLead.policies ?? '',
      medicalAid: baseLead.medicalAid ?? null, medicalAidProvider: baseLead.medicalAidProvider ?? '',
      portfolios: baseLead.portfolios ?? [],
      // 14 Aug 2026 (§157/§158) — mirrors portfolios immediately above.
      products: baseLead.products ?? [],
      // 14 Aug 2026 (§166) — single value, not an array (a Lead has
      // exactly one region, unlike Portfolio/Products which can be several).
      region: baseLead.region ?? '',
    });
    setEditError('');
    setEditing(true);
  }

  function setField(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }));
  }

  // 14 Aug 2026 (§157/§158) — dedicated handler, not the generic
  // setField() above, because toggling a portfolio here now also needs
  // to prune any selected product no longer offered — same reasoning
  // and same shape as the Book Appointment modal's own togglePortfolio()
  // further down this file.
  function toggleEditPortfolio(name) {
    setEditForm(prev => {
      const next = prev.portfolios.includes(name) ? prev.portfolios.filter(x => x !== name) : [...prev.portfolios, name];
      const stillAvailable = next.flatMap(n => productsByPortfolio[n] ?? []);
      return { ...prev, portfolios: next, products: prev.products.filter(p => stillAvailable.includes(p)) };
    });
  }

  async function handleSaveEdit() {
    setSavingEdit(true);
    setEditError('');
    try {
      // UpdateLeadSchema's fields are .optional() but not .nullable() — an
      // absent key is skipped, but an explicit '' or null fails validation
      // (dateOfBirth's date regex, existingCover/medicalAid's boolean type).
      // Every field here starts as '' or null when unset, so strip both
      // rather than sending them — same class of bug as LeadImport.jsx's
      // stripEmpty(), found there the same way (submitting the real form).
      // portfolios (array, added 23 Jul 2026, §41) needs no special case
      // here: it's never a "blank placeholder" the way a text input is —
      // the checkbox selection is always accurate, empty or not — and
      // [] !== '' / [] !== null, so this filter already passes it through
      // correctly either way, including the genuine "clear all" case.
      const payload = Object.fromEntries(
        Object.entries(editForm).filter(([, v]) => v !== '' && v !== null)
      );
      await leadsApi.update(id, payload);
      setEditing(false);
      refetchAudit();
      await refetchLead();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not save changes. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    if (callsData?.calls) {
      setCalls(callsData.calls.map(c => ({ ...c, label: OUTCOME_LABELS[c.outcome] ?? c.outcome })));
    }
  }, [callsData]);

  async function handleLogCall(e) {
    e.preventDefault();
    if (!callForm.outcome) { setSubmitError('Please select an outcome'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      // callbackDateTime is only meaningfully filled for CallbackRequested —
      // otherwise it's '' from callForm's initial state, and an empty
      // string fails CallAttemptSchema's datetime validation differently
      // than an omitted field would. Same class of bug as LeadImport.jsx's
      // stripEmpty() fix, found the same way — by submitting the actual
      // form with a plain outcome and watching it 400.
      const payload = { outcome: callForm.outcome, notes: callForm.notes || undefined };
      if (callForm.callbackDateTime) payload.callbackDateTime = callForm.callbackDateTime;
      await leadsApi.logCall(id, payload);
      // §142, item 3 (13 Aug 2026) — the backend write (leadService.js's
      // logCallAttempt(), added §138) was always correct; this call was
      // simply missing, unlike the reopen/reassign handlers on this same
      // page which both already call refetchAudit(). Without it the
      // Audit Log card stayed stale until the next full page load.
      refetchAudit();
      // Compute new status from transition machine and apply locally
      const newStatus = computeNewStatus(currentStatus, callForm.outcome);
      if (newStatus !== currentStatus) setStatusOverride(newStatus);
      // Add to call history
      setCalls(prev => [{
        id: String(Date.now()),
        outcome: callForm.outcome,
        label: OUTCOME_LABELS[callForm.outcome] ?? callForm.outcome,
        notes: callForm.notes || null,
        callbackDateTime: callForm.callbackDateTime || null,
        attemptedAt: new Date().toISOString(),
      }, ...prev]);
      setShowCallForm(false);
      setCallForm({ outcome: '', notes: '', callbackDateTime: '' });
    } catch (err) {
      // Previously silently treated every failure as a success — applied
      // the same optimistic call-history update and status transition as
      // the try block above, regardless of what actually went wrong. That
      // masked real backend failures (validation, auth, network) behind
      // what looked like a successful save. Now shows the real error
      // instead, and does NOT apply an update that was never actually
      // saved server-side.
      setSubmitError(err.message ?? 'Could not log the call. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = { background:'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px 18px', marginBottom: '14px' };
  const cardTitle = { fontSize: '0.875rem', fontWeight: 600, color:'var(--ink)', marginBottom: '12px', paddingBottom: '8px', borderBottom:'1px solid var(--line)' };
  const btn = {
    primary:   { background:'var(--accent)', color:'white', border:'none', borderRadius:'var(--r-sm,8px)', padding:'8px 14px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit' },
    secondary: { background:'var(--panel)', color:'var(--ink)', border: '1px solid var(--line)', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    ghost:     { background: 'none', color:'var(--mut)', border: '1px solid var(--line)', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    back:      { background: 'none', border: 'none', color:'var(--mut)', cursor: 'pointer', fontSize: '0.813rem', padding: 0, fontFamily: 'inherit', marginBottom: '4px' },
  };
  const inputStyle = { width: '100%', border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color:'var(--ink)', marginBottom: '5px' };
  const badge = (bg, text) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, background: bg, color: text });

  // Still loading: show a simple loading state rather than an incomplete
  // page — otherwise every lead detail page would briefly render with
  // missing fields before the real fetch resolves.
  if (leadLoading) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
        <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    );
  }

  // Fetch failed outright — added 23 Jul 2026. Previously there was no
  // check for this at all: leadError was never even destructured, so a
  // failed fetch fell straight through to rendering the full page against
  // baseLead = {} — every field showing '—', with the one exception of
  // Status, which defaults to 'Unassigned' via its own `?? 'Unassigned'`
  // fallback in currentStatus below, making a totally broken page look
  // almost like a real (if empty) lead. Reported as "Lead Detail page
  // isn't showing data" — this is what that actually was.
  if (leadError) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
        <button onClick={() => navigate('/leads')} style={btn.back}>← Back to Leads</button>
        <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '14px 16px', marginTop: '12px', color: '#dc2626', fontSize: '0.875rem' }}>
          <strong>Could not load this lead.</strong>
          <p style={{ margin: '6px 0 10px' }}>{leadError instanceof ApiError ? leadError.message : 'An unexpected error occurred.'}</p>
          <button onClick={refetchLead} style={{ ...btn.secondary, background: 'white' }}>Try again</button>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
        <button onClick={() => navigate('/leads')} style={btn.back}>← Back to Leads</button>
        <p style={{ color: 'var(--mut)', fontSize: '0.875rem', marginTop: '12px' }}>Lead not found.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>

      {/* Conversion notice — wording and actions depend on the current
          appointment's own status, not just "converted or not" (23 Jul
          2026, Mark's request: Closed Won stays locked permanently, Closed
          Lost stays locked until an Admin/Supervisor reopens it). */}
      {isConverted && (
        <div style={{
          background: baseLead.appointmentStatus === 'ClosedLost' ? 'color-mix(in srgb, #dc2626 14%, var(--panel))' : 'color-mix(in srgb, #15803d 14%, var(--panel))',
          border: `1px solid ${baseLead.appointmentStatus === 'ClosedLost' ? 'color-mix(in srgb, #dc2626 30%, var(--panel))' : 'color-mix(in srgb, #15803d 30%, var(--panel))'}`,
          borderRadius: '6px', padding: '10px 14px', marginBottom: '16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
          fontSize: '0.875rem', color: baseLead.appointmentStatus === 'ClosedLost' ? '#dc2626' : '#15803d', flexWrap: 'wrap',
        }}>
          <span>
            {baseLead.appointmentStatus === 'ClosedWon' && <>🏆 <strong>Closed Won.</strong> This lead is locked — the deal is done.</>}
            {baseLead.appointmentStatus === 'ClosedLost' && <>🔒 <strong>Closed Lost.</strong> This lead is locked until reopened.</>}
            {baseLead.appointmentStatus !== 'ClosedWon' && baseLead.appointmentStatus !== 'ClosedLost' && <>✅ <strong>Appointment booked.</strong> This lead is now Converted and locked while it's active.</>}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {canReopen && (
              <button onClick={handleReopenLead} disabled={reopening} style={{ background: 'none', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: reopening ? 0.6 : 1 }}>
                {reopening ? 'Reopening…' : '↺ Reopen Lead'}
              </button>
            )}
            {/* §142 follow-up (13 Aug 2026, Mark's request) — was
                ungated entirely, visible to every role including Agent.
                canManage already encodes "Supervisor and up"
                (isAdminRole || role === 'Supervisor') and is used the
                same way for Reopen Lead right above; reused rather than
                a new check, since it's exactly the intended rule. */}
            {canManage && (
              <button
                onClick={() => navigate(baseLead.appointmentId ? `/appointments/${baseLead.appointmentId}` : '/appointments')}
                style={{ background:'var(--live)', color:'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                View in Appointments →
              </button>
            )}
          </div>
        </div>
      )}
      {reopenError && (
        <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.8125rem', marginBottom: '14px' }}>{reopenError}</div>
      )}

      {/* Header */}
      <button onClick={() => navigate('/leads')} style={btn.back}>← Back to Leads</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '6px 0 20px', gap: '12px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, color:'var(--ink)', margin: 0 }}>
          {baseLead.title} {baseLead.firstName} {baseLead.lastName}
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {canEdit && !editing && (
            <button onClick={startEditing} style={btn.secondary}>Edit Details</button>
          )}
          {canEdit && editing && (
            <>
              <button onClick={handleSaveEdit} disabled={savingEdit} style={btn.primary}>
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} disabled={savingEdit} style={btn.ghost}>Cancel</button>
            </>
          )}
          {!isConverted && !isClosed && (
            <>
              {/* Hidden until the lead is assigned — logging a call against
                  nobody's queue doesn't make sense (Mark's request). */}
              {currentStatus !== 'Unassigned' && (
                <button onClick={() => setShowCallForm(true)} style={btn.primary}>Log Call</button>
              )}
              {canBook && (
                <button onClick={() => setShowBookForm(true)} style={btn.secondary}>Book Appointment</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit save error */}
      {editError && (
        <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.8125rem', marginBottom: '14px' }}>{editError}</div>
      )}

      {/* Status transition hint */}
      {!isConverted && !isClosed && (
        <div style={{ background: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))', border: '1px solid color-mix(in srgb, #1d4ed8 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '0.8125rem', color: 'var(--accent)' }}>
          ℹ Status updates automatically based on call outcomes. Log a call to progress this lead.
          {currentStatus === 'Unassigned' && ' Assign this lead to an agent before logging calls.'}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>

        {/* Lead detail overview */}
        <div style={cardStyle}>
          <div style={cardTitle}>Lead Detail</div>
          <Field label="Status"><StatusPill status={currentStatus} /></Field>
          {editing ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
              <span style={{ color:'var(--mut)', flexShrink: 0 }}>Portfolio</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {allPortfolios.map(p => {
                  const checked = editForm.portfolios.includes(p.name);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        cursor: 'pointer', padding: '3px 9px',
                        border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                        borderRadius: '20px', fontSize: '0.75rem',
                        background: checked ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)',
                        color: checked ? 'var(--accent)' : 'var(--ink)',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEditPortfolio(p.name)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <Field label="Portfolio">
              {baseLead.portfolios?.length
                ? <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {baseLead.portfolios.map(p => <PortfolioPill key={p} portfolio={p} />)}
                  </div>
                : '—'}
            </Field>
          )}
          {/* 14 Aug 2026 (§166) — a single value, not a checkbox set like
              Portfolio/Products above — a plain <select>, same pattern as
              the identical Region field already used in UserAdmin.jsx and
              this same file's own Book Appointment modal. */}
          {editing ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
              <span style={{ color:'var(--mut)', flexShrink: 0 }}>Region</span>
              <select
                style={{ ...s.formInput, width: 'auto', minWidth: '160px' }}
                value={editForm.region}
                onChange={e => setField('region', e.target.value)}
              >
                <option value="">Not set</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          ) : (
            <Field label="Region">{baseLead.region ?? '—'}</Field>
          )}
          {/* 14 Aug 2026 (§157/§158, Mark's decision: "Mandatory, manual
              form only" at creation) — editable here too, though, same
              as Portfolio already is; scoped to editForm.portfolios so
              the offered products update live as portfolios are
              (de)selected during this same edit session. */}
          {editing ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
              <span style={{ color:'var(--mut)', flexShrink: 0 }}>Products</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {editForm.portfolios.length === 0
                  ? <span style={{ color: colors.ink400, fontSize: '0.75rem' }}>Select a portfolio first</span>
                  : editForm.portfolios.flatMap(name => productsByPortfolio[name] ?? []).map(prod => {
                      const checked = editForm.products.includes(prod);
                      return (
                        <label
                          key={prod}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            cursor: 'pointer', padding: '3px 9px',
                            border: `1px solid ${checked ? 'color-mix(in srgb, #15803d 30%, var(--panel))' : 'var(--line)'}`,
                            borderRadius: '20px', fontSize: '0.75rem',
                            background: checked ? 'color-mix(in srgb, #15803d 10%, var(--panel))' : 'var(--panel)',
                            color: checked ? '#15803d' : 'var(--ink)',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setField('products', checked
                              ? editForm.products.filter(x => x !== prod)
                              : [...editForm.products, prod])}
                            style={{ accentColor: '#15803d' }}
                          />
                          {prod}
                        </label>
                      );
                    })}
              </div>
            </div>
          ) : (
            <Field label="Products">
              {baseLead.products?.length
                ? <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {baseLead.products.map(p => (
                      <span key={p} style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: '999px', background: 'color-mix(in srgb, #15803d 14%, transparent)', color: '#15803d', fontWeight: 600 }}>
                        {p}
                      </span>
                    ))}
                  </div>
                : '—'}
            </Field>
          )}
          <Field label="Lead source" value={baseLead.sourceLabel} />
          <Field label="Agent"       value={baseLead.agentName} />
          <Field label="Date created">
            {baseLead.createdAt
              ? `${format(new Date(baseLead.createdAt), 'd MMM yyyy')} (${formatDistanceToNow(new Date(baseLead.createdAt), { addSuffix: true })})`
              : '—'}
          </Field>
        </div>

        {/* Personal details */}
        <div style={cardStyle}>
          <div style={cardTitle}>Personal Details</div>
          <EditableField label="Date of Birth" type="date" editing={editing} value={editing ? editForm.dateOfBirth : baseLead.dateOfBirth} onChange={v => setField('dateOfBirth', v)} />
          <EditableField label="ID Number" editing={editing} value={editing ? editForm.idNumber : baseLead.idNumber} onChange={v => setField('idNumber', v.replace(/\D/g, '').slice(0, 13))} />
          <EditableField label="Email" editing={editing} value={editing ? editForm.email : baseLead.email} onChange={v => setField('email', v)} />
          <EditableField label="Contact Number" editing={editing} value={editing ? editForm.mobileNumber : baseLead.mobileNumber} onChange={v => setField('mobileNumber', v)} />
          <EditableField label="WhatsApp" editing={editing} value={editing ? editForm.whatsappNumber : baseLead.whatsappNumber} onChange={v => setField('whatsappNumber', v)} />
          <EditableField label="Job Title" type="select" options={JOB_TITLES} editing={editing} value={editing ? editForm.occupation : baseLead.occupation} onChange={v => setField('occupation', v)} />
          <EditableField label="Hospital / Practice" editing={editing} value={editing ? editForm.hospitalOrPractice : baseLead.hospitalOrPractice} onChange={v => setField('hospitalOrPractice', v)} />
        </div>

        {/* Education */}
        <div style={cardStyle}>
          <div style={cardTitle}>Education</div>
          <EditableField label="University" editing={editing} value={editing ? editForm.universityAttended : baseLead.universityAttended} onChange={v => setField('universityAttended', v)} />
          <EditableField label="Year" type="number" editing={editing} value={editing ? editForm.yearOfAttendance : baseLead.yearOfAttendance} onChange={v => setField('yearOfAttendance', v)} />
          <EditableField label="Degree" editing={editing} value={editing ? editForm.degreeAttained : baseLead.degreeAttained} onChange={v => setField('degreeAttained', v)} />
        </div>

        {/* Insurance */}
        <div style={cardStyle}>
          <div style={cardTitle}>Insurance Information</div>
          <EditableField label="Existing cover" type="bool" editing={editing} value={editing ? editForm.existingCover : baseLead.existingCover} onChange={v => setField('existingCover', v)} />
          <EditableField label="Current policies" type="textarea" editing={editing} value={editing ? editForm.policies : baseLead.policies} onChange={v => setField('policies', v)} />
          <EditableField label="Medical aid" type="bool" editing={editing} value={editing ? editForm.medicalAid : baseLead.medicalAid} onChange={v => setField('medicalAid', v)} />
          <EditableField label="Medical aid provider" editing={editing} value={editing ? editForm.medicalAidProvider : baseLead.medicalAidProvider} onChange={v => setField('medicalAidProvider', v)} />
        </div>

        {/* Call history */}
        <div style={cardStyle}>
          <div style={cardTitle}>Call History ({calls.length})</div>
          {calls.length === 0 && <p style={{ color:'var(--mut)', fontSize: '0.875rem' }}>No call attempts yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {calls.map((call, i) => {
              const oc = OUTCOME_COLOURS[call.outcome] ?? OUTCOME_COLOURS.NoAnswer;
              const borderCol = call.outcome === 'CallbackRequested' ? 'color-mix(in srgb, #d97706 30%, var(--panel))'
                : call.outcome === 'NotInterested' || call.outcome === 'WrongNumber' ? 'color-mix(in srgb, #dc2626 30%, var(--panel))'
                : call.outcome === 'AppointmentScheduled' ? 'color-mix(in srgb, #7c3aed 30%, var(--panel))' : 'var(--line)';
              return (
                <div
                  key={call.id}
                  style={{
                    borderLeft: `3px solid ${borderCol}`, padding: '8px 0 8px 10px',
                    // Alternating row shading, per Mark's request.
                    background: i % 2 === 1 ? 'var(--panel2)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ ...badge(oc.bg, oc.text) }}>
                      {call.label ?? OUTCOME_LABELS[call.outcome] ?? call.outcome}
                    </span>
                    <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}>
                      {format(new Date(call.attemptedAt), 'd MMM yyyy')}
                    </span>
                  </div>
                  {call.notes && <p style={{ fontSize: '0.813rem', color:'var(--mut)', marginTop: '4px' }}>{call.notes}</p>}
                  {call.callbackDateTime && (
                    <p style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '2px' }}>
                      Callback: {format(new Date(call.callbackDateTime), 'd MMM yyyy HH:mm')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Appointment History — every Appointment linked to this Lead
            (one-to-many since §35: a Closed Lost attempt followed by
            Reopen + a second booking leaves two rows, both real history).
            Deliberately NOT gated on isConverted — the conversion banner
            above (and its single "View in Appointments" link) disappears
            once a lead is reopened, which previously took the only visible
            link to appointment history with it. This card stays visible
            regardless of the lead's current status. */}
        <div style={cardStyle}>
          <div style={cardTitle}>Appointment History ({appointmentHistory.length})</div>
          {appointmentHistory.length === 0 && <p style={{ color:'var(--mut)', fontSize: '0.875rem' }}>No appointments booked yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {appointmentHistory.map((appt, i) => {
              const meta = APPT_STATUS_META[appt.status] ?? { colour: 'var(--mut)', bg: 'var(--panel2)', border: 'var(--line)', label: appt.status };
              const portfolios = appt.portfolios?.length ? appt.portfolios.join(', ') : (appt.portfolio ?? '—');
              return (
                <div
                  key={appt.id}
                  onClick={() => navigate(`/appointments/${appt.id}`)}
                  style={{
                    borderLeft: `3px solid ${meta.border}`, padding: '8px 10px',
                    background: i % 2 === 1 ? 'var(--panel2)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ ...badge(meta.bg, meta.colour) }}>{meta.label}</span>
                    <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}>
                      {appt.firstAppointmentDate ? format(new Date(appt.firstAppointmentDate), 'd MMM yyyy') : '—'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.813rem', color:'var(--mut)', marginTop: '4px' }}>
                    {portfolios}{appt.brokerName ? ` · ${appt.brokerName}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit log */}
        <div style={cardStyle}>
          <div style={cardTitle}>Audit Log ({auditEntries.length})</div>
          {auditError ? (
            <div style={{ ...s.errorBox, fontSize: '0.8125rem' }}>
              Could not load audit history. Try refreshing the page.
            </div>
          ) : (
            <AuditLogList entries={auditEntries} emptyLabel="No changes recorded yet." />
          )}
        </div>
      </div>

      {/* ── Log Call Modal ── */}
      {showCallForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: isMobile ? '16px' : '0' }}>
          <div style={{ background:'var(--panel)', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Log Call Attempt</h2>
              <button onClick={() => setShowCallForm(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color:'var(--mut)' }}>✕</button>
            </div>

            {/* Status transition preview */}
            <div style={{ background:'var(--panel2)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '0.8125rem' }}>
              <div style={{ color:'var(--mut)', marginBottom: '4px' }}>Current status: <strong style={{ color:'var(--ink)' }}>{currentStatus}</strong></div>
              {callForm.outcome && (() => {
                const next = computeNewStatus(currentStatus, callForm.outcome);
                return next !== currentStatus
                  ? <div style={{ color: '#d97706' }}>→ Will change to: <strong>{next}</strong></div>
                  : <div style={{ color:'var(--mut)' }}>→ Status will remain: <strong>{currentStatus}</strong></div>;
              })()}
            </div>

            <form onSubmit={handleLogCall}>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Outcome *</label>
                <select value={callForm.outcome} onChange={e => setCallForm(f => ({ ...f, outcome: e.target.value }))} style={inputStyle}>
                  <option value="">Select outcome…</option>
                  {CALL_OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={callForm.notes} onChange={e => setCallForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, height: '72px', resize: 'vertical' }} placeholder="Optional notes…" />
              </div>
              {callForm.outcome === 'CallbackRequested' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Callback date &amp; time</label>
                  <input type="datetime-local" value={callForm.callbackDateTime} onChange={e => setCallForm(f => ({ ...f, callbackDateTime: e.target.value }))} style={inputStyle} />
                </div>
              )}
              {callForm.outcome === 'ClientContacted' && (
                <div style={{ background: 'color-mix(in srgb, #15803d 14%, var(--panel))', border: '1px solid color-mix(in srgb, #15803d 30%, var(--panel))', borderRadius: '6px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#15803d', marginBottom: '6px' }}>
                    🎉 Client contacted — would you like to book an appointment?
                  </div>
                  <p style={{ fontSize: '0.8125rem', color:'var(--ink)', margin: '0 0 10px' }}>
                    Save this call and proceed to book an appointment with the prospect now.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      // Save the call first, then open Book Appointment
                      const newStatus = computeNewStatus(currentStatus, callForm.outcome);
                      if (newStatus !== currentStatus) setStatusOverride(newStatus);
                      setCalls(prev => [{
                        id: String(Date.now()),
                        outcome: callForm.outcome,
                        label: OUTCOME_LABELS[callForm.outcome],
                        notes: callForm.notes || null,
                        attemptedAt: new Date().toISOString(),
                      }, ...prev]);
                      setShowCallForm(false);
                      setCallForm({ outcome: '', notes: '', callbackDateTime: '' });
                      setShowBookForm(true);
                    }}
                    style={{ background:'var(--live)', color:'white', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit' }}
                  >
                    Save call &amp; Book Appointment →
                  </button>
                </div>
              )}
              {submitError && <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.875rem', marginBottom: '12px' }}>{submitError}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCallForm(false)} style={btn.ghost}>Cancel</button>
                <button type="submit" disabled={submitting} style={btn.primary}>{submitting ? 'Saving…' : 'Save Call'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Book Appointment Modal ── */}
      {showBookForm && (
        <BookAppointmentModal
          lead={baseLead}
          isMobile={isMobile}
          onClose={() => setShowBookForm(false)}
          onBooked={() => { setBookingConfirmed(true); setShowBookForm(false); }}
        />
      )}
    </div>
  );
}

// ─── Book Appointment modal — separate component, own state ──────────────────
// Split out from the main render because it has enough independent state
// (region/portfolio/products -> broker search -> selection -> booking
// details) to be its own thing, not because of any technical requirement.
function BookAppointmentModal({ lead, isMobile, onClose, onBooked }) {
  const { portfolios: allPortfolios, productsByPortfolio } = useRole();
  // §140, 12 Aug 2026 (Mark's request) — when claim model is active, an
  // agent booking with a broker already picked would let that appointment
  // skip the claim queue (and its token economy) entirely, same escape
  // hatch problem as the Supervisor Assign action fixed below. Every
  // appointment booked while claim model is active goes out Unassigned,
  // no exceptions — the whole broker-search/select section (and the
  // "couldn't find a broker" option, now redundant since there's nothing
  // to search for) is hidden rather than just left technically reachable.
  const { flag } = useFlags();
  const isClaimModel = flag('appointments.claimModel', 'claim');
  const labelStyle = { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color:'var(--ink)', marginBottom: '5px' };
  const inputStyle = { width: '100%', border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' };
  const btn = {
    primary: { background:'var(--accent)', color:'white', border:'none', borderRadius:'var(--r-sm,8px)', padding:'8px 14px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit' },
    ghost:   { background: 'none', color:'var(--mut)', border: '1px solid var(--line)', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
  };

  // Changed 23 Jul 2026 (§45, Mark's request) — Book Appointment is no
  // longer single-select. A broker discussing both Discovery and Money &
  // Medicine products in one meeting is real, not an edge case — brokers
  // themselves aren't limited to one portfolio (§41's whole premise), so
  // an appointment shouldn't be either. Pre-fills from every portfolio
  // already tagged on the Lead (still fully editable here).
  // 14 Aug 2026 (§166) — was useState(''); now pre-fills from the Lead's
  // own captured region, same as portfolios/products immediately below
  // already do — still fully editable here (a client's actual meeting
  // location can genuinely differ from their registered region on rare
  // occasions), not locked once set.
  const [region,       setRegion]       = useState(lead.region ?? '');
  const [portfolios,   setPortfolios]   = useState(lead.portfolios ?? []);
  // 14 Aug 2026 (§157/§158) — was useState([]); now pre-fills from the
  // Lead's own captured products, same as portfolios immediately above
  // already does — still fully editable here via toggleProduct().
  const [products,     setProducts]     = useState(lead.products ?? []);
  const [searched,     setSearched]     = useState(false);
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState('');
  const [brokers,      setBrokers]      = useState([]);
  const [degradedMode, setDegradedMode] = useState(false);
  const [brokerId,     setBrokerId]     = useState('');
  // §138, 12 Aug 2026 (Mark's request) — an explicit, deliberate escape
  // hatch, not just loosening brokerId to always-optional. The backend
  // has always accepted an omitted brokerId (an Unassigned appointment
  // routed to a Supervisor to find a broker), but this form made
  // selecting one mandatory to even submit, so that path was never
  // actually reachable through normal use. Mutually exclusive with
  // brokerId — picking a broker clears this, ticking this clears brokerId.
  const [noBrokerAvailable, setNoBrokerAvailable] = useState(false);

  const [date,            setDate]            = useState('');
  const [time,             setTime]            = useState('');
  // §140d, 12 Aug 2026 (Mark's request) — drives which of address/link is
  // required below. Defaults to InPerson (the only kind this app supported
  // until this change, and still the common case) rather than forcing an
  // extra click on every booking, but the agent can switch it.
  const [meetingType,      setMeetingType]     = useState('InPerson');
  const [address,          setAddress]         = useState('');
  const [virtualMeetingLink, setVirtualMeetingLink] = useState('');
  const [currentInsurer,   setCurrentInsurer]  = useState('');
  const [fieldErrors,      setFieldErrors]     = useState({});
  const [submitting,       setSubmitting]      = useState(false);
  const [submitError,      setSubmitError]     = useState('');

  // Added 23 Jul 2026, Mark's request — the button was always clickable;
  // clicking it with missing fields only showed a small inline error
  // (e.g. "Select a broker" beneath the broker list), easy to miss if
  // that section had scrolled out of view. Proactively disabling is a
  // clearer signal than a click-then-discover error, though the inline
  // fieldErrors below are kept too (still useful if someone tabs through
  // fields without noticing what's outstanding).
  // §140d — the meeting-type-conditional part applies regardless of
  // claimModel, since it's about the meeting itself, not who's attending.
  const isMeetingDetailValid = meetingType === 'InPerson' ? !!address.trim() : !!virtualMeetingLink.trim();
  // §143, item 6 (13 Aug 2026, Mark's decision) — products.length > 0
  // added to both branches. Was never checked before, in either mode:
  // the Assign flow's own broker-search function (findMatchingBrokers)
  // separately throws if called with zero products, but that's a
  // search-time check, not a booking-time one, and it never ran at all
  // in claim mode — confirmed via testing that Confirm Booking stayed
  // enabled with zero products selected in claim mode specifically.
  // Products drives broker/claim-pool eligibility in both flows
  // (region+product match, see brokerMatchingService.js and
  // appointmentService.js's listAvailableToClaim), so both now require
  // it explicitly at the one point it's actually captured.
  const isFormValid = isClaimModel
    ? (!!date && !!time && portfolios.length > 0 && products.length > 0 && isMeetingDetailValid)
    : ((!!brokerId || noBrokerAvailable) && !!date && !!time && portfolios.length > 0 && products.length > 0 && isMeetingDetailValid);

  // Products available now union across every selected portfolio, not
  // just one — the whole point of allowing more than one portfolio here
  // is being able to record interest in products from both.
  const availableProducts = portfolios.flatMap((name) => productsByPortfolio[name] ?? []);

  function togglePortfolio(name) {
    setPortfolios((prev) => {
      const next = prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name];
      // Drop any selected product that's no longer offered once its
      // portfolio is deselected — same reasoning as the previous single-
      // select version resetting products on every portfolio change.
      const stillAvailable = next.flatMap((n) => productsByPortfolio[n] ?? []);
      setProducts((prods) => prods.filter((p) => stillAvailable.includes(p)));
      return next;
    });
    setSearched(false);
    setBrokers([]);
    setBrokerId('');
    setNoBrokerAvailable(false);
  }
  function toggleProduct(name) {
    setProducts((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]));
    setSearched(false);
  }

  async function handleFindBrokers() {
    setSearching(true);
    setSearchError('');
    setSearched(false);
    try {
      const result = await brokerMatchingApi.findBrokers({ region, products, date, time });
      setBrokers(result?.brokers ?? []);
      setDegradedMode(!!result?.degradedMode);
      setSearched(true);
      setBrokerId('');
      setNoBrokerAvailable(false);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Could not search for brokers. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  async function handleConfirmBooking() {
    const errors = {};
    if (!isClaimModel && !brokerId && !noBrokerAvailable) errors.broker = 'Select a broker, or mark that none are available';
    if (!date)             errors.date = 'Required';
    if (!time)             errors.time = 'Required';
    if (portfolios.length === 0) errors.portfolios = 'Select at least one portfolio';
    // §140d — conditional on meetingType, not both unconditionally required.
    if (meetingType === 'InPerson' && !address.trim()) errors.address = 'Address is required for an in-person meeting';
    if (meetingType === 'Virtual' && !virtualMeetingLink.trim()) errors.virtualMeetingLink = 'A meeting link is required for a virtual meeting';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setSubmitting(true);
    setSubmitError('');
    try {
      await appointmentsApi.create({
        leadId: lead.id,
        brokerId: (isClaimModel || noBrokerAvailable) ? undefined : brokerId,
        portfolios,
        firstAppointmentDate: date,
        firstAppointmentTime: time,
        meetingType,
        firstAppointmentAddress: meetingType === 'InPerson' ? address : undefined,
        virtualMeetingLink: meetingType === 'Virtual' ? virtualMeetingLink : undefined,
        currentInsurer: currentInsurer || undefined,
        productsInterestedIn: products,
      });
      onBooked();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not book the appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: isMobile ? '16px' : '0' }}>
      <div style={{ background:'var(--panel)', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Book Appointment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color:'var(--mut)' }}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '14px' }}>
          {lead.title} {lead.firstName} {lead.lastName} · {lead.occupation}
        </p>
        <div style={{ background: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))', border: '1px solid color-mix(in srgb, #1d4ed8 30%, var(--panel))', borderRadius: '6px', padding: '9px 12px', marginBottom: '14px', fontSize: '0.8125rem', color: 'var(--accent)' }}>
          Confirming this booking will move the lead to <strong>Appointment Scheduled</strong> status and it will appear in the Appointments list.
        </div>

        {/* Step 1: portfolio + products + region -> find brokers */}
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Portfolio *</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {allPortfolios.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '6px 12px', border: `1px solid ${portfolios.includes(p.name) ? 'var(--accent)' : 'var(--line)'}`, borderRadius: '6px', fontSize: '0.8125rem', background: portfolios.includes(p.name) ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)' }}>
                <input type="checkbox" checked={portfolios.includes(p.name)} onChange={() => togglePortfolio(p.name)} style={{ accentColor: 'var(--accent)' }} />
                {p.name}
              </label>
            ))}
          </div>
          {fieldErrors.portfolios && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{fieldErrors.portfolios}</div>}
        </div>

        {portfolios.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Products the client is interested in *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {availableProducts.map((prod) => {
                const checked = products.includes(prod);
                return (
                  <label key={prod} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', padding: '3px 8px', borderRadius: '20px', background: checked ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel2)', color: checked ? '#15803d' : 'var(--ink)', border: `1px solid ${checked ? 'color-mix(in srgb, #15803d 30%, var(--panel))' : 'var(--line)'}` }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleProduct(prod)} style={{ accentColor: '#15803d' }} />
                    {prod}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Date/Time — moved here 13 Aug 2026 (§142, item 1), now OUTSIDE
            the isClaimModel branch below and always rendered. Previously
            lived inside the assign-mode-only branch (see the "24 Jul
            2026" comment further down, where it used to sit right above
            the Find Brokers button) — every claim-model booking was
            silently unable to satisfy isFormValid's date/time
            requirement because the fields themselves never rendered.
            Minor field-order change versus before (Date/Time now
            precedes Region rather than following it in assign mode) —
            functionally equivalent, and arguably more sensible: pick
            when before searching who's free. */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input type="date" style={inputStyle} value={date} onChange={(e) => { setDate(e.target.value); setSearched(false); }} />
            {fieldErrors.date && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{fieldErrors.date}</div>}
          </div>
          <div>
            <label style={labelStyle}>Time *</label>
            <input type="time" style={inputStyle} value={time} onChange={(e) => { setTime(e.target.value); setSearched(false); }} />
            {fieldErrors.time && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{fieldErrors.time}</div>}
          </div>
        </div>

        {isClaimModel ? (
          <div style={{ background: 'color-mix(in srgb, #15803d 14%, var(--panel))', border: '1px solid color-mix(in srgb, #15803d 30%, var(--panel))', borderRadius: '6px', padding: '9px 12px', marginBottom: '14px', fontSize: '0.8125rem', color: '#15803d' }}>
            ⚡ Claim model is active — this appointment will be booked Unassigned and made available for brokers to claim. Brokers aren't picked manually while claim model is on.
          </div>
        ) : (
        <>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Client's region *</label>
          <select style={inputStyle} value={region} onChange={(e) => { setRegion(e.target.value); setSearched(false); }}>
            <option value="">Select…</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Date/Time moved out of this branch entirely, 13 Aug 2026
            (§142, item 1) — was nested only in the assign-mode branch
            below, so it silently never rendered at all while claim
            model was active, even though isFormValid/handleConfirm
            both still required date+time unconditionally. Now rendered
            unconditionally, above this branch — see above. */}
        <button
          type="button"
          onClick={handleFindBrokers}
          disabled={!region || !date || !time || products.length === 0 || searching}
          style={{ ...btn.primary, opacity: (!region || !date || !time || products.length === 0 || searching) ? 0.5 : 1, marginBottom: '14px', width: '100%' }}
        >
          {searching ? 'Searching…' : 'Find available brokers'}
        </button>

        {searchError && <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.8125rem', marginBottom: '14px' }}>{searchError}</div>}

        {/* Step 2: broker selection, once searched */}
        {searched && (
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Select broker *</label>
            {degradedMode && (
              <div style={{ fontSize: '0.75rem', color: '#d97706', marginBottom: '8px' }}>
                ⚠ Live calendar availability isn't connected — ranked by current workload only. Confirm the time works directly with the broker.
              </div>
            )}
            {brokers.length === 0 && (
              <div style={{ fontSize: '0.8125rem', color:'var(--mut)', padding: '10px 0' }}>
                No brokers match this region, product, and time combination — try a different time, or a broker already booked then may still be free at another slot.
              </div>
            )}
            {brokers.map((b, i) => (
              <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', border: `1px solid ${brokerId === b.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: '6px', marginBottom: '6px', cursor: 'pointer', background: brokerId === b.id ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))' : 'var(--panel)' }}>
                <input type="radio" name="book-broker" checked={brokerId === b.id} onChange={() => { setBrokerId(b.id); setNoBrokerAvailable(false); }} style={{ accentColor: 'var(--accent)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{b.displayName}</div>
                  <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>{b.upcomingAppointments} upcoming appointment{b.upcomingAppointments !== 1 ? 's' : ''}</div>
                </div>
                {i === 0 && <span style={{ fontSize: '0.688rem', background: 'color-mix(in srgb, #15803d 14%, var(--panel))', color: '#15803d', borderRadius: '4px', padding: '2px 6px' }}>Most available</span>}
              </label>
            ))}

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', border: `1px solid ${noBrokerAvailable ? 'var(--accent)' : 'var(--line)'}`, borderRadius: '6px', marginTop: '4px', cursor: 'pointer', background: noBrokerAvailable ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))' : 'var(--panel)' }}>
              <input
                type="radio"
                name="book-broker"
                checked={noBrokerAvailable}
                onChange={() => { setNoBrokerAvailable(true); setBrokerId(''); }}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>I couldn't find an available broker</div>
            </label>
            {noBrokerAvailable && (
              <div style={{ fontSize: '0.75rem', color: 'var(--mut)', marginTop: '6px', padding: '8px 10px', background: 'var(--panel2)', borderRadius: '6px' }}>
                This appointment will be booked as Unassigned and routed to a Supervisor to find a broker.
              </div>
            )}
            {fieldErrors.broker && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{fieldErrors.broker}</div>}
          </div>
        )}
        </>
        )}

        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Meeting type *</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[['InPerson', 'In person'], ['Virtual', 'Virtual (Teams etc.)']].map(([val, lbl]) => (
              <label key={val} style={{
                display: 'flex', alignItems: 'center', gap: '8px', flex: 1,
                padding: '9px 12px', border: `1px solid ${meetingType === val ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '6px', cursor: 'pointer',
                background: meetingType === val ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))' : 'var(--panel)',
              }}>
                <input type="radio" name="meeting-type" checked={meetingType === val} onChange={() => setMeetingType(val)} style={{ accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '0.875rem' }}>{lbl}</span>
              </label>
            ))}
          </div>
        </div>

        {meetingType === 'InPerson' ? (
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Address *</label>
            <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Rivonia Rd, Sandton" />
            {fieldErrors.address && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{fieldErrors.address}</div>}
          </div>
        ) : (
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Meeting link *</label>
            <input style={inputStyle} value={virtualMeetingLink} onChange={(e) => setVirtualMeetingLink(e.target.value)} placeholder="https://teams.microsoft.com/..." />
            {fieldErrors.virtualMeetingLink && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{fieldErrors.virtualMeetingLink}</div>}
          </div>
        )}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Current insurance company</label>
          <input style={inputStyle} value={currentInsurer} onChange={(e) => setCurrentInsurer(e.target.value)} placeholder="e.g. Old Mutual, Momentum" />
        </div>

        {submitError && <div style={{ background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', border: '1px solid color-mix(in srgb, #dc2626 30%, var(--panel))', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.875rem', marginBottom: '12px' }}>{submitError}</div>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn.ghost} disabled={submitting}>Cancel</button>
          <button
            onClick={handleConfirmBooking}
            style={{ ...btn.primary, opacity: (submitting || !isFormValid) ? 0.5 : 1 }}
            disabled={submitting || !isFormValid}
            title={!isFormValid ? (isClaimModel ? 'Select a portfolio, at least one product, date and time, and an address or meeting link, before confirming' : 'Select a portfolio, at least one product, date and time, a broker or "couldn\'t find a broker", and an address or meeting link, before confirming') : undefined}
          >
            {submitting ? 'Booking…' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
