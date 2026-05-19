/**
 * pages/AppointmentDetail.jsx
 *
 * The Appointment is the "active deal" entity — analogous to Salesforce Opportunity.
 * It is a child of Lead (1:1, enforced by UNIQUE leadId in the schema).
 *
 * This page is reached from the Appointments list (View →) and shows:
 *   - Lead/contact details (read-only — editable from Lead Detail)
 *   - Appointment logistics (broker, portfolio, first appointment date/address)
 *   - Meeting tracking: First, Second, optional Third meeting
 *   - Appointment outcome: Signed?, Products sold, Broker switch?
 *   - Reassign broker / agent actions (Admin/Supervisor only)
 *
 * Book Appointment does NOT appear here — that action lives on Lead Detail
 * and is how a Lead is converted to an Appointment in the first place.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext.jsx';

// ─── Mock appointment data ────────────────────────────────────────────────────
const MOCK_APPOINTMENT = {
  id: 'A1',
  // Lead details (source of truth — contact info lives on Lead)
  leadId: 'L1',
  leadName: 'Dr Priya Naidoo',
  leadEmail: 'p.naidoo@netcare.co.za',
  occupation: 'Anaesthesiologist',
  hospitalOrPractice: 'Netcare Sunninghill Hospital',
  sourceLabel: 'Wits Career Fair 2026',
  currentInsurer: 'Discovery Life',
  // Appointment details
  status: 'Assigned',
  portfolio: 'Discovery',
  agentName: 'Thabo Molefe',
  brokerName: 'Sandra van der Berg',
  firstAppointmentDate: '2026-05-19',
  firstAppointmentTime: '10:00',
  firstAppointmentAddress: '123 Rivonia Road, Sandton, 2196',
  productsInterestedIn: ['Life Insurance', 'Income Protection'],
  // Meeting tracking (null status = "Please select")
  meeting1Date: '2026-05-19', meeting1Status: null,   meeting1Feedback: '',
  meeting2Date: '',           meeting2Status: null,   meeting2Feedback: '',
  meeting3Date: '',           meeting3Status: null,   meeting3Feedback: '',
  // Outcome (null = not yet recorded)
  customerSigned: null,
  isBrokerSwitch: null,
  productsSold: [],
  // Audit
  createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
};

const MEETING_STATUS_OPTIONS = ['', 'Seen', 'Rescheduled', 'Cancelled'];
const AGENTS  = ['Thabo Molefe', 'Naledi van Wyk', 'Kabelo Petersen', 'Bongani Ntuli', 'Siphiwe Mahlangu'];
const BROKERS = ['Sandra van der Berg', 'Pieter Joubert', 'Riaan Botha', 'Marelize Swart'];

const STATUS_META = {
  Unassigned: { bg: '#fffbeb', colour: '#d97706', border: '#fde68a' },
  Assigned:   { bg: '#eff6ff', colour: '#1d4ed8', border: '#bfdbfe' },
  Claimed:    { bg: '#f0fdf4', colour: '#15803d', border: '#bbf7d0' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', marginTop: '6px' }}>
      {children}
    </div>
  );
}

function Field({ label, value, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem', gap: '12px' }}>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right' }}>{children ?? value ?? '—'}</span>
    </div>
  );
}

function MeetingSection({ title, required, date, onDateChange, status, onStatusChange, feedback, onFeedbackChange, rescheduledDate, onRescheduledChange }) {
  return (
    <div style={{ background: '#f9fafb', border: `1px solid ${required ? '#e5e7eb' : '#e5e7eb'}`, borderStyle: required ? 'solid' : 'dashed', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: required ? '#374151' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
        {title} {!required && <span style={{ fontWeight: 400 }}>(optional)</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Date</label>
          <input type="date" value={date} onChange={e => onDateChange(e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '7px 10px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Status</label>
          <select value={status ?? ''} onChange={e => onStatusChange(e.target.value || null)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '7px 10px', fontSize: '0.875rem', fontFamily: 'inherit', background: 'white' }}>
            <option value="">Please select</option>
            {MEETING_STATUS_OPTIONS.filter(o => o).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      {status === 'Rescheduled' && (
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#d97706', marginBottom: '4px' }}>Rescheduled date &amp; time *</label>
          <input type="datetime-local" value={rescheduledDate ?? ''} onChange={e => onRescheduledChange(e.target.value)}
            style={{ width: '100%', border: '1px solid #fde68a', borderRadius: '6px', padding: '7px 10px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
      )}
      <div>
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Meeting feedback</label>
        <textarea value={feedback} onChange={e => onFeedbackChange(e.target.value)} rows={2}
          placeholder="Notes from the meeting…"
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '7px 10px', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
    </div>
  );
}

// ─── Reassign modal ───────────────────────────────────────────────────────────
function ReassignModal({ appt, onClose }) {
  const [broker, setBroker] = useState(appt.brokerName);
  const [agent,  setAgent]  = useState(appt.agentName);
  const [saved,  setSaved]  = useState(false);
  function handleSave() { setSaved(true); setTimeout(onClose, 800); }
  const s = {
    overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
    modal:    { background: 'white', borderRadius: '10px', padding: '24px', width: '400px', maxWidth: '90vw' },
    label:    { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '5px' },
    select:   { width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', marginBottom: '14px' },
    row:      { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f3f4f6' },
    primary:  { background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    ghost:    { background: 'none', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
  };
  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Reassign Appointment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>
        {saved && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 12px', fontSize: '0.875rem', color: '#15803d', marginBottom: '12px' }}>✓ Reassigned successfully.</div>}
        <label style={s.label}>Broker</label>
        <select style={s.select} value={broker} onChange={e => setBroker(e.target.value)}>
          <option value="">— Unassigned —</option>
          {BROKERS.map(b => <option key={b}>{b}</option>)}
        </select>
        <label style={s.label}>Agent</label>
        <select style={s.select} value={agent} onChange={e => setAgent(e.target.value)}>
          {AGENTS.map(a => <option key={a}>{a}</option>)}
        </select>
        <div style={s.row}>
          <button style={s.ghost} onClick={onClose}>Cancel</button>
          <button style={s.primary} onClick={handleSave} disabled={saved}>{saved ? 'Saved ✓' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AppointmentDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const isAdmin     = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const canReassign = isAdmin || isSupervisor;

  // In preview mode, use mock data (production: fetch from GET /api/appointments/:id)
  //
  // PRODUCTION SECURITY NOTE (Kai review item):
  // GET /api/appointments/:id must validate row-level ownership before responding:
  //   - Broker: may only fetch appointments where brokerId = currentUser.id
  //   - Agent:  may only fetch appointments where agentId  = currentUser.id
  //   - Admin/Supervisor/GlobalAdmin: unrestricted
  // Return HTTP 403 if the requesting user does not own or have rights to the record.
  const [appt, setAppt] = useState({ ...MOCK_APPOINTMENT, id });
  const [showReassign,   setShowReassign]    = useState(false);
  const [outcomeSaved,   setOutcomeSaved]    = useState(false);
  const [meetingSaved,   setMeetingSaved]    = useState(false);

  // All products available for the selected portfolio
  const portId     = appt.portfolio === 'Discovery' ? 'disc' : 'mm';
  const allProducts = PRODUCTS_BY_PORTFOLIO[portId] ?? [];

  const sm = STATUS_META[appt.status] ?? STATUS_META.Unassigned;

  function updateMeeting(num, field, value) {
    setAppt(prev => ({ ...prev, [`meeting${num}${field}`]: value }));
  }

  function toggleProduct(prod) {
    setAppt(prev => ({
      ...prev,
      productsSold: prev.productsSold.includes(prod)
        ? prev.productsSold.filter(p => p !== prod)
        : [...prev.productsSold, prod],
    }));
  }

  const btnStyle = {
    primary:   { background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit' },
    secondary: { background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    ghost:     { background: 'none', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    link:      { background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontSize: '0.8125rem', padding: '3px 6px', fontFamily: 'inherit' },
  };

  const card = { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px 18px', marginBottom: '14px' };
  const cardTitle = { fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6' };

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>

      {/* Back + header */}
      <button onClick={() => navigate('/appointments')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem', padding: 0, marginBottom: '6px', fontFamily: 'inherit' }}>
        ← Back to Appointments
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '4px 0 6px' }}>
            {appt.leadName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, background: sm.bg, color: sm.colour, border: `1px solid ${sm.border}` }}>
              {appt.status}
            </span>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, background: appt.portfolio === 'Discovery' ? '#eff6ff' : '#f5f3ff', color: appt.portfolio === 'Discovery' ? '#1d4ed8' : '#7c3aed' }}>
              {appt.portfolio}
            </span>
            <span style={{ fontSize: '0.813rem', color: '#6b7280' }}>
              {appt.firstAppointmentDate} · {appt.firstAppointmentTime}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canReassign && (
            <button onClick={() => setShowReassign(true)} style={btnStyle.secondary}>Reassign</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Lead details (read-only) */}
        <div style={card}>
          <div style={cardTitle}>
            Lead Details
            <button onClick={() => navigate(`/leads/${appt.leadId}`)} style={{ ...btnStyle.link, float: 'right', fontSize: '0.75rem' }}>
              View lead →
            </button>
          </div>
          <Field label="Email"             value={appt.leadEmail} />
          <Field label="Occupation"        value={appt.occupation} />
          <Field label="Hospital / Practice" value={appt.hospitalOrPractice} />
          <Field label="Lead source"       value={appt.sourceLabel} />
          <Field label="Current insurer"   value={appt.currentInsurer} />
          <Field label="Products interested in">
            {appt.productsInterestedIn?.join(', ') || '—'}
          </Field>
        </div>

        {/* Appointment details */}
        <div style={card}>
          <div style={cardTitle}>Appointment Details</div>
          <Field label="Status">
            <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, background: sm.bg, color: sm.colour }}>{appt.status}</span>
          </Field>
          <Field label="First appointment date" value={`${appt.firstAppointmentDate} · ${appt.firstAppointmentTime}`} />
          <Field label="Address"      value={appt.firstAppointmentAddress} />
          <Field label="Broker"       value={appt.brokerName} />
          <Field label="Agent"        value={appt.agentName} />
          <Field label="Broker switch?" value={appt.isBrokerSwitch === true ? 'Yes' : appt.isBrokerSwitch === false ? 'No' : '—'} />
        </div>
      </div>

      {/* Meeting tracking */}
      <div style={card}>
        <div style={cardTitle}>Meeting Tracking</div>
        <MeetingSection
          title="First Meeting" required
          date={appt.meeting1Date}              onDateChange={v => updateMeeting(1,'Date',v)}
          status={appt.meeting1Status}          onStatusChange={v => updateMeeting(1,'Status',v)}
          feedback={appt.meeting1Feedback}      onFeedbackChange={v => updateMeeting(1,'Feedback',v)}
          rescheduledDate={appt.meeting1RescheduledDate} onRescheduledChange={v => updateMeeting(1,'RescheduledDate',v)}
        />
        <MeetingSection
          title="Second Meeting" required
          date={appt.meeting2Date}              onDateChange={v => updateMeeting(2,'Date',v)}
          status={appt.meeting2Status}          onStatusChange={v => updateMeeting(2,'Status',v)}
          feedback={appt.meeting2Feedback}      onFeedbackChange={v => updateMeeting(2,'Feedback',v)}
          rescheduledDate={appt.meeting2RescheduledDate} onRescheduledChange={v => updateMeeting(2,'RescheduledDate',v)}
        />
        <MeetingSection
          title="Third Meeting" required={false}
          date={appt.meeting3Date}              onDateChange={v => updateMeeting(3,'Date',v)}
          status={appt.meeting3Status}          onStatusChange={v => updateMeeting(3,'Status',v)}
          feedback={appt.meeting3Feedback}      onFeedbackChange={v => updateMeeting(3,'Feedback',v)}
          rescheduledDate={appt.meeting3RescheduledDate} onRescheduledChange={v => updateMeeting(3,'RescheduledDate',v)}
        />
        {meetingSaved && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 12px', fontSize: '0.875rem', color: '#15803d', marginBottom: '8px' }}>
            ✓ Meeting details saved.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btnStyle.primary} onClick={() => { setMeetingSaved(true); setTimeout(() => setMeetingSaved(false), 2000); }}>
            Save Meeting Details
          </button>
        </div>
      </div>

      {/* Outcome */}
      <div style={card}>
        <div style={cardTitle}>Appointment Outcome</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Customer Signed?</label>
            <select
              value={appt.customerSigned === null ? '' : appt.customerSigned ? 'Yes' : 'No'}
              onChange={e => setAppt(p => ({ ...p, customerSigned: e.target.value === '' ? null : e.target.value === 'Yes' }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', background: 'white' }}
            >
              <option value="">Please select</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Broker Switch?</label>
            <select
              value={appt.isBrokerSwitch === null ? '' : appt.isBrokerSwitch ? 'Yes' : 'No'}
              onChange={e => setAppt(p => ({ ...p, isBrokerSwitch: e.target.value === '' ? null : e.target.value === 'Yes' }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', background: 'white' }}
            >
              <option value="">Please select</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            Products Sold
            <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 }}>— {appt.portfolio} portfolio</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {allProducts.map(prod => {
              const selected = appt.productsSold.includes(prod);
              return (
                <label key={prod} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer',
                  padding: '4px 10px', borderRadius: '20px', fontSize: '0.8125rem', userSelect: 'none',
                  background: selected ? '#f0fdf4' : '#f3f4f6',
                  color:      selected ? '#15803d' : '#374151',
                  border:     `1px solid ${selected ? '#bbf7d0' : '#e5e7eb'}`,
                }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleProduct(prod)} style={{ accentColor: '#15803d' }} />
                  {prod}
                </label>
              );
            })}
          </div>
        </div>

        {outcomeSaved && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 12px', fontSize: '0.875rem', color: '#15803d', marginBottom: '8px' }}>
            ✓ Outcome saved.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btnStyle.primary} onClick={() => { setOutcomeSaved(true); setTimeout(() => setOutcomeSaved(false), 2000); }}>
            Save Outcome
          </button>
        </div>
      </div>

      {showReassign && <ReassignModal appt={appt} onClose={() => setShowReassign(false)} />}
    </div>
  );
}
