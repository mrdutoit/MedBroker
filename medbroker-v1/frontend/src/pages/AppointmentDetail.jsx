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

import { useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RoleContext, PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext';
import { useFlags }                           from '../context/FlagContext';
import { useWindowSize }                      from '../hooks/useWindowSize';
import { appointmentsApi }                    from '../services/api';
import { s, APPT_STATUS_META }                from '../styles/tokens.js';

// ─── Mock data ─────────────────────────────────────────────────────────────────
// In production: fetched from GET /api/appointments/:id
// The agent field is set at booking time from the JWT and is never editable.
const MOCK_APPOINTMENT = {
  id:             'appt-001',
  leadId:         'lead-042',
  leadName:       'Dr Priya Naidoo',
  occupation:     'Anaesthesiologist',
  mobile:         '082 456 7890',
  currentInsurer: 'Discovery Life',
  portfolio:      'Discovery',
  source:         'Wits Career Fair 2026',
  productsInterested: ['Life Insurance', 'Income Protection'],

  status:         'Assigned',
  firstDate:      '2026-05-20',
  firstTime:      '10:00',
  address:        '123 Rivonia Rd, Sandton',
  brokerName:     'Sandra van der Berg',
  agentName:      'Thabo Molefe',        // read-only — set from JWT at booking time
  brokerSwitch:   false,
  customerSigned: null,
  productsSold:   [],

  meetings: [
    { number: 1, date: '2026-05-20', status: '',  notes: '', required: true  },
    { number: 2, date: '',           status: '',  notes: '', required: true  },
    { number: 3, date: '',           status: '',  notes: '', required: false },
  ],
};

const BROKERS = [
  { id: 'broker-sb', name: 'Sandra van der Berg' },
  { id: 'broker-pj', name: 'Pieter Joubert'       },
  { id: 'broker-rb', name: 'Riaan Botha'           },
  { id: 'broker-ms', name: 'Marelize Swart'        },
];

const MEETING_STATUSES = ['Seen', 'Rescheduled', 'Cancelled'];

// ─── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const meta = APPT_STATUS_META[status] ?? { colour: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', label: status };
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
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem' }}>
      <span style={{ color: '#6b7280', flexShrink: 0, marginRight: '16px' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

// ─── Meeting section ───────────────────────────────────────────────────────────
function MeetingSection({ meeting, onChange, thirdMeetingEnabled, isMobile }) {
  const isOptional = meeting.number === 3;
  const isLocked   = isOptional && !thirdMeetingEnabled;

  const titles = ['', 'First Meeting', 'Second Meeting', 'Third Meeting (optional)'];

  return (
    <div style={{
      ...s.card,
      borderStyle: isOptional ? 'dashed' : 'solid',
      opacity: isLocked ? 0.6 : 1,
      marginBottom: '12px',
    }}>
      <div style={s.cardTitle}>{titles[meeting.number]}</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={s.formLabel}>Date</label>
          <input
            type="date"
            style={s.formInput}
            value={meeting.date}
            disabled={isLocked}
            onChange={e => onChange(meeting.number, 'date', e.target.value)}
          />
        </div>
        <div>
          <label style={s.formLabel}>Status</label>
          <select
            style={s.formInput}
            value={meeting.status}
            disabled={isLocked}
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
          placeholder={isOptional ? '' : 'Notes from the meeting…'}
          value={meeting.notes}
          disabled={isLocked}
          onChange={e => onChange(meeting.number, 'notes', e.target.value)}
        />
      </div>
    </div>
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
function ReassignBrokerModal({ appointment, onClose }) {
  const [broker, setBroker] = useState(appointment.brokerName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const brokerChanged = broker !== appointment.brokerName;

  async function handleSave() {
    if (!broker || !brokerChanged) return;
    setSaving(true);
    setError('');
    try {
      await appointmentsApi.reassign(appointment.id, broker);
      setSaved(true);
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
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '16px' }}>
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
            <span style={{ marginLeft: '6px', fontSize: '0.6875rem', color: '#9ca3af', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              (read only)
            </span>
          </label>
          <div style={{
            ...s.formInput,
            background: '#f9fafb',
            color: '#6b7280',
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
          <p style={{ fontSize: '0.6875rem', color: '#9ca3af', marginTop: '4px' }}>
            Set when the appointment was booked. Cannot be changed here.
          </p>
        </div>

        {/* Broker — editable, pre-populated with current broker */}
        <div style={{ marginBottom: '20px' }}>
          <label style={s.formLabel}>Reassign broker *</label>
          {appointment.brokerName && (
            <p style={{ fontSize: '0.6875rem', color: '#6b7280', marginBottom: '6px' }}>
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
            {BROKERS.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
          {broker && broker === appointment.brokerName && (
            <p style={{ fontSize: '0.6875rem', color: '#9ca3af', marginTop: '4px' }}>
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
function ReturnToLeadsModal({ appointment, onClose }) {
  const [returning, setReturning] = useState(false);
  const [done,      setDone]      = useState(false);

  async function handleReturn() {
    setReturning(true);
    try {
      await appointmentsApi.returnToLeads(appointment.id);
      setDone(true);
      setTimeout(onClose, 900);
    } catch {
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
        <p style={{ fontSize: '0.875rem', color: '#111827', marginBottom: '10px' }}>
          This appointment will be returned to the unassigned leads queue.
        </p>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '20px', lineHeight: 1.5 }}>
          The appointment record will be archived. The lead will be available to assign to the next available agent.
        </p>
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
  const { role }        = useContext(RoleContext);
  const { flag }        = useFlags();
  const { isMobile }    = useWindowSize();

  const canManage           = ['GlobalAdmin', 'Admin', 'Supervisor'].includes(role);
  const thirdMeetingEnabled = !!flag('appointments.thirdMeeting.enabled');

  // Initialise from mock data (production: fetch from GET /api/appointments/:id)
  const [appt,              setAppt]              = useState({ ...MOCK_APPOINTMENT, id: id ?? MOCK_APPOINTMENT.id });
  const [showReassign,      setShowReassign]      = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [outcomeSaved,      setOutcomeSaved]      = useState(false);

  // Derived
  const isClosed    = appt.status === 'ClosedWon' || appt.status === 'ClosedLost';
  const canReturn   = canManage && !isClosed && appt.customerSigned !== true;
  const canReassign = canManage && !isClosed;

  const productsForPortfolio = PRODUCTS_BY_PORTFOLIO[appt.portfolio] ?? [];

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

  function handleSaveOutcome() {
    // Production: POST /api/appointments/:id/outcome → computeAppointmentStatus()
    setOutcomeSaved(true);
    setTimeout(() => setOutcomeSaved(false), 3000);
  }

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '960px' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button style={s.backBtn} onClick={() => navigate('/appointments')} aria-label="Back">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M10 3L5 8l5 5"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{appt.leadName} — Appointment</div>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '1px' }}>
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

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <StatusChip status={appt.status} />
        <span style={{
          display: 'inline-block', padding: '2px 9px', borderRadius: '20px',
          fontSize: '0.75rem', fontWeight: 500,
          color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe',
        }}>
          {appt.portfolio}
        </span>
        {appt.firstDate && (
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            First appointment: {appt.firstDate} {appt.firstTime} · {appt.address}
          </span>
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
          <FieldRow label="Portfolio">{appt.portfolio}</FieldRow>
          <FieldRow label="Products interested">{appt.productsInterested.join(', ')}</FieldRow>
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Appointment Details</div>
          <FieldRow label="Status"><StatusChip status={appt.status} /></FieldRow>
          <FieldRow label="First appt date">{appt.firstDate}  {appt.firstTime}</FieldRow>
          <FieldRow label="Address">{appt.address}</FieldRow>
          <FieldRow label="Broker">{appt.brokerName}</FieldRow>
          <FieldRow label="Agent">{appt.agentName}</FieldRow>
          <FieldRow label="Source">{appt.source}</FieldRow>
        </div>
      </div>

      {/* ── Meeting tracking ────────────────────────────────────────────────── */}
      {appt.meetings.map(meeting => (
        <MeetingSection
          key={meeting.number}
          meeting={meeting}
          onChange={handleMeetingChange}
          thirdMeetingEnabled={thirdMeetingEnabled}
          isMobile={isMobile}
        />
      ))}

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
          <button style={s.primaryBtn} onClick={handleSaveOutcome}>
            Save Outcome
          </button>
          {outcomeSaved && (
            <span style={{ fontSize: '0.8125rem', color: '#15803d' }}>✓ Outcome saved</span>
          )}
        </div>
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
          onClose={() => setShowReassign(false)}
        />
      )}

      {/* ── Return to Leads modal ────────────────────────────────────────────── */}
      {showReturnConfirm && (
        <ReturnToLeadsModal
          appointment={appt}
          onClose={() => setShowReturnConfirm(false)}
        />
      )}
    </div>
  );
}
