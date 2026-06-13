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

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { leadsApi } from '../services/api.js';
import { formatDistanceToNow, format } from 'date-fns';
import { useWindowSize } from '../hooks/useWindowSize.js';

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
  Unassigned:           { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  Assigned:             { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  InProgress:           { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  AppointmentScheduled: { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
  Closed:               { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
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
  NoAnswer:             { bg: '#f3f4f6', text: '#6b7280' },
  Voicemail:            { bg: '#f3f4f6', text: '#6b7280' },
  WrongNumber:          { bg: '#fef2f2', text: '#dc2626' },
  CallbackRequested:    { bg: '#fffbeb', text: '#d97706' },
  ClientContacted:      { bg: '#f0fdf4', text: '#15803d' },
  NotInterested:        { bg: '#fef2f2', text: '#dc2626' },
  AppointmentScheduled: { bg: '#f5f3ff', text: '#7c3aed' },
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

// ─── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_LEAD = {
  id: '1',
  firstName: 'Priya', lastName: 'Naidoo',
  email: 'p.naidoo@netcare.co.za', mobileNumber: '082 456 7890',
  whatsappNumber: '082 456 7890', occupation: 'Anaesthesiologist',
  hospitalOrPractice: 'Netcare Sunninghill Hospital',
  universityAttended: 'University of the Witwatersrand',
  yearOfAttendance: 2008, degreeAttained: 'MBBCh',
  existingCover: true, policies: 'Discovery Life, Old Mutual',
  medicalAid: true, medicalAidProvider: 'Discovery Health',
  sourceLabel: 'Wits Career Fair 2026',
  pipelineStatus: 'Assigned',
  agentName: 'Thabo Molefe',
  createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
};

const MOCK_CALLS = [
  { id:'1', outcome:'NoAnswer',         label:'No answer',          notes: null,                              attemptedAt: new Date(Date.now()-86400000*3).toISOString() },
  { id:'2', outcome:'Voicemail',        label:'Voicemail left',     notes: 'Left voicemail, awaiting return', attemptedAt: new Date(Date.now()-86400000*2).toISOString() },
  { id:'3', outcome:'CallbackRequested',label:'Callback requested', notes: 'Callback Thursday 10am',         callbackDateTime: new Date(Date.now()+86400000).toISOString(), attemptedAt: new Date(Date.now()-86400000).toISOString() },
];

// ─── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, value, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom:'1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
      <span style={{ color:'var(--mut)', flexShrink: 0 }}>{label}</span>
      <span style={{ color:'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{children ?? value ?? '—'}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function LeadDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { isMobile } = useWindowSize();

  const { data: lead } = useFetch(() => leadsApi.get(id), [id]);
  const baseLead = lead ?? MOCK_LEAD;

  // Local status override — reflects transitions after actions in preview mode.
  // In production: re-fetch the lead after each API call to get server state.
  const [statusOverride,   setStatusOverride]   = useState(null);
  const [bookingConfirmed, setBookingConfirmed]  = useState(false);
  const [showCallForm,     setShowCallForm]      = useState(false);
  const [showBookForm,     setShowBookForm]      = useState(false);
  const [callForm,         setCallForm]          = useState({ outcome: '', notes: '', callbackDateTime: '' });
  const [calls,            setCalls]             = useState(MOCK_CALLS);
  const [submitting,       setSubmitting]        = useState(false);
  const [submitError,      setSubmitError]       = useState('');

  const currentStatus = bookingConfirmed
    ? 'AppointmentScheduled'
    : (statusOverride ?? baseLead.pipelineStatus ?? 'Unassigned');

  const sc          = STATUS_COLOURS[currentStatus] ?? STATUS_COLOURS.Unassigned;
  const isConverted = currentStatus === 'AppointmentScheduled';
  const isClosed    = currentStatus === 'Closed';
  // Book Appointment only available for active, assigned/in-progress leads
  const canBook     = currentStatus === 'Assigned' || currentStatus === 'InProgress';

  async function handleLogCall(e) {
    e.preventDefault();
    if (!callForm.outcome) { setSubmitError('Please select an outcome'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      await leadsApi.logCall(id, callForm);
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
    } catch {
      // In preview mode leadsApi.logCall returns null — still apply transition
      const newStatus = computeNewStatus(currentStatus, callForm.outcome);
      if (newStatus !== currentStatus) setStatusOverride(newStatus);
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
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = { background:'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px 18px', marginBottom: '14px' };
  const cardTitle = { fontSize: '0.875rem', fontWeight: 600, color:'var(--ink)', marginBottom: '12px', paddingBottom: '8px', borderBottom:'1px solid var(--line)' };
  const btn = {
    primary:   { background:'var(--accent)', color:'white', border:'none', borderRadius:'var(--r-sm,8px)', padding:'8px 14px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit' },
    secondary: { background:'var(--panel)', color:'var(--ink)', border: '1px solid #d1d5db', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    ghost:     { background: 'none', color:'var(--mut)', border: '1px solid var(--line)', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' },
    back:      { background: 'none', border: 'none', color:'var(--mut)', cursor: 'pointer', fontSize: '0.813rem', padding: 0, fontFamily: 'inherit', marginBottom: '4px' },
  };
  const inputStyle = { width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color:'var(--ink)', marginBottom: '5px' };
  const badge = (bg, text) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, background: bg, color: text });

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '960px' }}>

      {/* Conversion notice */}
      {isConverted && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontSize: '0.875rem', color: '#15803d', flexWrap: 'wrap' }}>
          <span>✅ <strong>Appointment booked.</strong> This lead has been converted and is now in the Appointments list.</span>
          <button onClick={() => navigate('/appointments')} style={{ background:'var(--live)', color:'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            View in Appointments →
          </button>
        </div>
      )}

      {/* Header */}
      <button onClick={() => navigate('/leads')} style={btn.back}>← Back to Leads</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '6px 0 20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, color:'var(--ink)', margin: '0 0 6px' }}>
            Dr {baseLead.firstName} {baseLead.lastName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ ...badge(sc.bg, sc.text), border: `1px solid ${sc.border}` }}>
              {currentStatus === 'InProgress' ? 'In Progress'
                : currentStatus === 'AppointmentScheduled' ? 'Appt Scheduled'
                : currentStatus}
            </span>
            <span style={{ fontSize: '0.813rem', color:'var(--mut)' }}>
              Added {baseLead.createdAt ? formatDistanceToNow(new Date(baseLead.createdAt), { addSuffix: true }) : '—'}
            </span>
          </div>
        </div>
        {!isConverted && !isClosed && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setShowCallForm(true)} style={btn.primary}>Log Call</button>
            {canBook && (
              <button onClick={() => setShowBookForm(true)} style={btn.secondary}>Book Appointment</button>
            )}
          </div>
        )}
      </div>

      {/* Status transition hint */}
      {!isConverted && !isClosed && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '0.8125rem', color: '#1e40af' }}>
          ℹ Status updates automatically based on call outcomes. Log a call to progress this lead.
          {currentStatus === 'Unassigned' && ' Assign this lead to an agent before logging calls.'}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>

        {/* Personal details */}
        <div style={cardStyle}>
          <div style={cardTitle}>Contact Details</div>
          <Field label="Email"      value={baseLead.email} />
          <Field label="Mobile"     value={baseLead.mobileNumber} />
          <Field label="WhatsApp"   value={baseLead.whatsappNumber} />
          <Field label="Occupation" value={baseLead.occupation} />
          <Field label="Hospital / Practice" value={baseLead.hospitalOrPractice} />
        </div>

        {/* Education */}
        <div style={cardStyle}>
          <div style={cardTitle}>Education &amp; Pipeline</div>
          <Field label="University"  value={baseLead.universityAttended} />
          <Field label="Year"        value={baseLead.yearOfAttendance} />
          <Field label="Degree"      value={baseLead.degreeAttained} />
          <Field label="Lead source" value={baseLead.sourceLabel} />
          <Field label="Agent"       value={baseLead.agentName} />
        </div>

        {/* Insurance */}
        <div style={cardStyle}>
          <div style={cardTitle}>Insurance Information</div>
          <Field label="Existing cover"      value={baseLead.existingCover === true ? 'Yes' : baseLead.existingCover === false ? 'No' : '—'} />
          <Field label="Current policies"    value={baseLead.policies} />
          <Field label="Medical aid"         value={baseLead.medicalAid === true ? 'Yes' : baseLead.medicalAid === false ? 'No' : '—'} />
          <Field label="Medical aid provider" value={baseLead.medicalAidProvider} />
        </div>

        {/* Call history */}
        <div style={cardStyle}>
          <div style={cardTitle}>Call History ({calls.length})</div>
          {calls.length === 0 && <p style={{ color:'var(--mut)', fontSize: '0.875rem' }}>No call attempts yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {calls.map(call => {
              const oc = OUTCOME_COLOURS[call.outcome] ?? OUTCOME_COLOURS.NoAnswer;
              const borderCol = call.outcome === 'CallbackRequested' ? '#fde68a'
                : call.outcome === 'NotInterested' || call.outcome === 'WrongNumber' ? '#fecaca'
                : call.outcome === 'AppointmentScheduled' ? '#ddd6fe' : '#e5e7eb';
              return (
                <div key={call.id} style={{ borderLeft: `3px solid ${borderCol}`, paddingLeft: '10px' }}>
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
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px 14px', marginBottom: '12px' }}>
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
              {submitError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', color: '#dc2626', fontSize: '0.875rem', marginBottom: '12px' }}>{submitError}</div>}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: isMobile ? '16px' : '0' }}>
          <div style={{ background:'var(--panel)', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Book Appointment</h2>
              <button onClick={() => setShowBookForm(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color:'var(--mut)' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '14px' }}>
              Dr {baseLead.firstName} {baseLead.lastName} · {baseLead.occupation}
            </p>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '9px 12px', marginBottom: '14px', fontSize: '0.8125rem', color: '#1e40af' }}>
              Confirming this booking will move the lead to <strong>Appointment Scheduled</strong> status and it will appear in the Appointments list.
            </div>

            {/* Broker selection */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Select broker *</label>
              {[
                { name: 'Sandra van der Berg', slots: '1 appointment this week · Next slot: Mon, 10:00', best: true },
                { name: 'Pieter Joubert',      slots: '3 appointments this week · Next slot: Tue, 14:00', best: false },
                { name: 'Marelize Swart',      slots: '4 appointments this week · Next slot: Wed, 09:00', best: false },
              ].map((b, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', border:`1px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'}`, borderRadius: '6px', marginBottom: '6px', cursor: 'pointer', background:i === 0 ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))' : 'var(--panel)' }}>
                  <input type="radio" name="book-broker" defaultChecked={i === 0} style={{ accentColor: '#1d4ed8' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>{b.slots}</div>
                  </div>
                  {b.best && <span style={{ fontSize: '0.688rem', background: '#f0fdf4', color: '#15803d', borderRadius: '4px', padding: '2px 6px' }}>Most available</span>}
                </label>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div><label style={labelStyle}>Date *</label><input type="date" style={inputStyle} /></div>
              <div><label style={labelStyle}>Time *</label><input type="time" style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: '10px' }}><label style={labelStyle}>Address *</label><input style={inputStyle} placeholder="123 Rivonia Rd, Sandton" /></div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Portfolio *</label>
              <select style={inputStyle}><option value="">Select…</option><option>Discovery</option><option>Money and Medicine</option></select>
            </div>
            <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Current insurance company</label><input style={inputStyle} placeholder="e.g. Old Mutual, Momentum" /></div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowBookForm(false)} style={btn.ghost}>Cancel</button>
              <button onClick={() => {
                /**
                 * Production: POST /api/appointments
                 *   → Creates Appointment child record (leadId FK)
                 *   → Sets Lead.pipelineStatus = 'AppointmentScheduled'
                 *   → Returns new Appointment ID
                 */
                setBookingConfirmed(true);
                setShowBookForm(false);
              }} style={btn.primary}>
                Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
