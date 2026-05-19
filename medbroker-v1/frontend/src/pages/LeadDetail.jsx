/**
 * pages/LeadDetail.jsx
 * Full lead record view. Shows all lead fields, call attempt history,
 * appointment history, and actions: log call, assign, book appointment.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { leadsApi } from '../services/api.js';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_COLOURS = {
  Unassigned:           { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  Assigned:             { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  InProgress:           { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  AppointmentScheduled: { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
  Closed:               { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
};

const CALL_OUTCOMES = [
  'NoAnswer', 'Voicemail', 'WrongNumber',
  'CallbackRequested', 'NotInterested', 'AppointmentScheduled',
];

const OUTCOME_COLOURS = {
  NoAnswer:              { bg: '#f3f4f6', text: '#6b7280' },
  Voicemail:             { bg: '#f3f4f6', text: '#6b7280' },
  WrongNumber:           { bg: '#fef2f2', text: '#dc2626' },
  CallbackRequested:     { bg: '#fffbeb', text: '#d97706' },
  NotInterested:         { bg: '#fef2f2', text: '#dc2626' },
  AppointmentScheduled:  { bg: '#f5f3ff', text: '#7c3aed' },
};

// Mock call attempts for preview
const MOCK_CALLS = [
  { id: '1', outcome: 'NoAnswer',          notes: null,                              attemptedAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: '2', outcome: 'Voicemail',         notes: 'Left voicemail, awaiting return', attemptedAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '3', outcome: 'CallbackRequested', notes: 'Requested callback Thursday 10am', callbackDateTime: new Date(Date.now() + 86400000).toISOString(), attemptedAt: new Date(Date.now() - 86400000).toISOString() },
];

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showCallForm,      setShowCallForm]      = useState(false);
  const [showBookForm,      setShowBookForm]       = useState(false);
  const [bookingConfirmed,  setBookingConfirmed]   = useState(false);
  const [callForm, setCallForm] = useState({
    outcome: '', notes: '', callbackDateTime: '',
    appointmentDate: '', appointmentTime: '', appointmentAddress: '',
    appointmentPortfolio: '', currentInsurer: '',
  });
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');

  // In preview mode, use mock data
  const mockLead = {
    id,
    firstName: 'Priya', lastName: 'Naidoo',
    email: 'p.naidoo@netcare.co.za', mobileNumber: '082 456 7890',
    whatsappNumber: '082 456 7890', occupation: 'Anaesthesiologist',
    hospitalOrPractice: 'Netcare Sunninghill Hospital',
    universityAttended: 'University of the Witwatersrand',
    yearOfAttendance: 2008, degreeAttained: 'MBBCh',
    existingCover: true, policies: 'Discovery Life, Old Mutual',
    medicalAid: true, medicalAidProvider: 'Discovery Health',
    leadSource: 'EventAttendance', sourceLabel: 'Wits Career Fair 2026',
    pipelineStatus: 'InProgress',
    agentName: 'Thabo Molefe', createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
  };

  const { data: lead, loading, error } = useFetch(() => leadsApi.get(id), [id]);
  const displayLead = lead ?? mockLead;

  async function handleLogCall(e) {
    e.preventDefault();
    if (!callForm.outcome) { setSubmitError('Please select an outcome'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      await leadsApi.logCall(id, callForm);
      setShowCallForm(false);
      setCallForm({ outcome: '', notes: '', callbackDateTime: '' });
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const status = bookingConfirmed ? 'AppointmentScheduled' : (displayLead?.pipelineStatus ?? 'Unassigned');
  const sc = STATUS_COLOURS[status] ?? STATUS_COLOURS.Unassigned;
  const isConverted = status === 'AppointmentScheduled';

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>

      {/* Conversion notice — shown after booking */}
      {isConverted && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: '#15803d' }}>
          <span>✅ <strong>Appointment booked.</strong> This lead has been converted — it is now visible in the <strong>Appointments</strong> list.</span>
          <button onClick={() => navigate('/appointments')} style={{ background: '#15803d', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}>
            View in Appointments →
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <button onClick={() => navigate('/leads')} style={s.backBtn}>← Back to Leads</button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '8px 0 4px' }}>
            Dr {displayLead.firstName} {displayLead.lastName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ ...s.badge, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
              {status}
            </span>
            <span style={{ fontSize: '0.813rem', color: '#6b7280' }}>
              Added {displayLead.createdAt ? formatDistanceToNow(new Date(displayLead.createdAt), { addSuffix: true }) : '—'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowCallForm(true)} style={s.primaryBtn}>Log Call</button>
          {/* Book Appointment only shown while lead is not yet converted */}
          {!isConverted && (
            <button onClick={() => setShowBookForm(true)} style={s.secondaryBtn}>Book Appointment</button>
          )}
        </div>
      </div>

      {loading && <p style={{ color: '#6b7280' }}>Loading lead...</p>}
      {error && <div style={s.errorBox}>Could not load lead from API — showing preview data. ({error.message})</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Personal details */}
        <div style={s.card}>
          <div style={s.cardTitle}>Personal Details</div>
          <Field label="Email"          value={displayLead.email} />
          <Field label="Mobile"         value={displayLead.mobileNumber} />
          <Field label="WhatsApp"       value={displayLead.whatsappNumber} />
          <Field label="Occupation"     value={displayLead.occupation} />
          <Field label="Hospital / Practice" value={displayLead.hospitalOrPractice} />
        </div>

        {/* Education */}
        <div style={s.card}>
          <div style={s.cardTitle}>Education</div>
          <Field label="University"     value={displayLead.universityAttended} />
          <Field label="Year attended"  value={displayLead.yearOfAttendance} />
          <Field label="Degree"         value={displayLead.degreeAttained} />
          <Field label="Lead source"    value={displayLead.sourceLabel ?? displayLead.leadSource} />
          <Field label="Agent"          value={displayLead.agentName} />
        </div>

        {/* Insurance */}
        <div style={s.card}>
          <div style={s.cardTitle}>Insurance Information</div>
          <Field label="Existing cover" value={displayLead.existingCover === true ? 'Yes' : displayLead.existingCover === false ? 'No' : '—'} />
          <Field label="Current policies" value={displayLead.policies} />
          <Field label="Medical aid"    value={displayLead.medicalAid === true ? 'Yes' : displayLead.medicalAid === false ? 'No' : '—'} />
          <Field label="Medical aid provider" value={displayLead.medicalAidProvider} />
        </div>

        {/* Call attempts */}
        <div style={s.card}>
          <div style={s.cardTitle}>Call History ({MOCK_CALLS.length})</div>
          {MOCK_CALLS.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No call attempts yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {MOCK_CALLS.map(call => {
              const oc = OUTCOME_COLOURS[call.outcome] ?? OUTCOME_COLOURS.NoAnswer;
              return (
                <div key={call.id} style={{ borderLeft: `3px solid ${oc.bg === '#f0fdf4' ? '#86efac' : oc.bg === '#f5f3ff' ? '#c4b5fd' : '#e5e7eb'}`, paddingLeft: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...s.badge, background: oc.bg, color: oc.text }}>{call.outcome}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {format(new Date(call.attemptedAt), 'd MMM yyyy')}
                    </span>
                  </div>
                  {call.notes && <p style={{ fontSize: '0.813rem', color: '#4b5563', marginTop: '4px' }}>{call.notes}</p>}
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

      {/* Log call modal */}
      {showCallForm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Log Call Attempt</h2>
              <button onClick={() => setShowCallForm(false)} style={s.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleLogCall}>
              <div style={s.formGroup}>
                <label style={s.label}>Outcome *</label>
                <select
                  value={callForm.outcome}
                  onChange={e => setCallForm(f => ({ ...f, outcome: e.target.value }))}
                  style={s.input}
                >
                  <option value="">Select outcome...</option>
                  {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Notes</label>
                <textarea
                  value={callForm.notes}
                  onChange={e => setCallForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...s.input, height: '80px', resize: 'vertical' }}
                  placeholder="Optional notes..."
                />
              </div>
              {callForm.outcome === 'CallbackRequested' && (
                <div style={s.formGroup}>
                  <label style={s.label}>Follow-up date &amp; time</label>
                  <input
                    type="datetime-local"
                    value={callForm.callbackDateTime}
                    onChange={e => setCallForm(f => ({ ...f, callbackDateTime: e.target.value }))}
                    style={s.input}
                  />
                </div>
              )}
              {callForm.outcome === 'AppointmentScheduled' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px', marginTop: '4px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>Appointment Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={s.formGroup}>
                      <label style={s.label}>Date *</label>
                      <input type="date" style={s.input} value={callForm.appointmentDate} onChange={e => setCallForm(f => ({ ...f, appointmentDate: e.target.value }))} />
                    </div>
                    <div style={s.formGroup}>
                      <label style={s.label}>Time *</label>
                      <input type="time" style={s.input} value={callForm.appointmentTime} onChange={e => setCallForm(f => ({ ...f, appointmentTime: e.target.value }))} />
                    </div>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Address *</label>
                    <input style={s.input} placeholder="123 Rivonia Rd, Sandton" value={callForm.appointmentAddress} onChange={e => setCallForm(f => ({ ...f, appointmentAddress: e.target.value }))} />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Portfolio *</label>
                    <select style={s.input} value={callForm.appointmentPortfolio} onChange={e => setCallForm(f => ({ ...f, appointmentPortfolio: e.target.value }))}>
                      <option value="">Select…</option>
                      <option>Discovery</option>
                      <option>Money and Medicine</option>
                    </select>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Current insurance company</label>
                    <input style={s.input} placeholder="e.g. Old Mutual, Momentum" value={callForm.currentInsurer} onChange={e => setCallForm(f => ({ ...f, currentInsurer: e.target.value }))} />
                  </div>
                </div>
              )}
              {submitError && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '12px' }}>{submitError}</p>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCallForm(false)} style={s.secondaryBtn}>Cancel</button>
                <button type="submit" disabled={submitting} style={s.primaryBtn}>
                  {submitting ? 'Saving...' : 'Save Call'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Book Appointment modal ── */}
      {showBookForm && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowBookForm(false); }}>
          <div style={{ ...s.modal, width: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Book Appointment</h2>
              <button onClick={() => setShowBookForm(false)} style={s.closeBtn}>✕</button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '14px' }}>
              Dr {displayLead.firstName} {displayLead.lastName} · {displayLead.occupation}
            </p>
            {/* M365 availability notice */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '9px 12px', marginBottom: '14px', fontSize: '0.8125rem', color: '#1e40af' }}>
              <strong>Microsoft 365 availability check</strong> — brokers ranked by fewest appointments in your region and portfolio.
            </div>
            {/* Broker selection */}
            <div style={s.formGroup}>
              <label style={s.label}>Select broker *</label>
              {[
                { name: 'Sandra van der Berg', slots: '1 appointment this week · Next slot: Mon, 10:00', best: true },
                { name: 'Pieter Joubert',      slots: '3 appointments this week · Next slot: Tue, 14:00', best: false },
                { name: 'Marelize Swart',      slots: '4 appointments this week · Next slot: Wed, 09:00', best: false },
              ].map((b, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  border: `1px solid ${i === 0 ? '#1d4ed8' : '#e5e7eb'}`,
                  borderRadius: '6px', marginBottom: '6px', cursor: 'pointer',
                  background: i === 0 ? '#eff6ff' : 'white',
                }}>
                  <input type="radio" name="book-broker" defaultChecked={i === 0} style={{ accentColor: '#1d4ed8' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{b.slots}</div>
                  </div>
                  {b.best && <span style={{ fontSize: '0.688rem', background: '#f0fdf4', color: '#15803d', borderRadius: '4px', padding: '2px 6px' }}>Most available</span>}
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={s.formGroup}>
                <label style={s.label}>Date *</label>
                <input type="date" style={s.input} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Time *</label>
                <input type="time" style={s.input} />
              </div>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Address *</label>
              <input style={s.input} placeholder="123 Rivonia Rd, Sandton" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Portfolio *</label>
              <select style={s.input}>
                <option value="">Select…</option>
                <option>Discovery</option>
                <option>Money and Medicine</option>
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Current insurance company</label>
              <input style={s.input} placeholder="e.g. Old Mutual, Momentum" />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e5e7eb' }}>
              <button onClick={() => setShowBookForm(false)} style={s.secondaryBtn}>Cancel</button>
              <button
                onClick={() => {
                  /**
                   * Lead → Appointment conversion (Salesforce Lead→Opportunity pattern)
                   *
                   * In production this POST /api/appointments call:
                   *   1. Creates a new Appointment child record linked to this Lead (leadId FK)
                   *   2. Sets Lead.pipelineStatus = 'AppointmentScheduled' (server-side)
                   *   3. Returns the new Appointment ID
                   *
                   * The Lead is NOT deleted — it remains as the source of truth for
                   * the person's contact details and pipeline history.
                   * The Appointments list queries WHERE Lead.pipelineStatus = 'AppointmentScheduled'
                   * and joins the Appointment child record for meeting/outcome data.
                   *
                   * In preview mode: update local UI state to reflect the conversion.
                   */
                  setBookingConfirmed(true);
                  setShowBookForm(false);
                }}
                style={s.primaryBtn}
              >
                Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem' }}>
      <span style={{ color: '#6b7280', flexShrink: 0, marginRight: '16px' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  );
}

const s = {
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem', padding: 0, marginBottom: '4px' },
  badge: { display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500 },
  primaryBtn: { background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  secondaryBtn: { background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem' },
  card: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px 20px' },
  cardTitle: { fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6' },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', color: '#dc2626', fontSize: '0.875rem', marginBottom: '16px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { background: 'white', borderRadius: '10px', padding: '24px', width: '440px', maxWidth: '90vw' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.125rem', cursor: 'pointer', color: '#6b7280' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' },
};
