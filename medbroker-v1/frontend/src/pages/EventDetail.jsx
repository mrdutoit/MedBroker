/**
 * pages/EventDetail.jsx
 * Single event view — attendee list, RSVP vs walk-in breakdown, QR code display,
 * and post-event report download.
 *
 * Style: migrated from local const s to shared tokens.js (s, imported).
 * All business logic and mock data unchanged.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

const MOCK_EVENT = {
  id: '1',
  name: 'Wits Medical School Career Fair 2026',
  university: 'University of the Witwatersrand',
  eventDate: '2026-06-15',
  venue: 'Wits Great Hall, Braamfontein',
  status: 'Active',
  qrToken: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  rsvpCount: 142,
  attendedCount: 118,
  walkinCount: 23,
};

const MOCK_ATTENDEES = [
  { id:'1', name:'Dr Priya Naidoo',     email:'p.naidoo@netcare.co.za',   rsvp:true,  attended:true,  occupation:'Anaesthesiologist',   registeredAt: new Date(Date.now()-86400000*2).toISOString() },
  { id:'2', name:'Dr Sipho Dlamini',    email:'s.dlamini@wits.ac.za',     rsvp:true,  attended:true,  occupation:'General Practitioner', registeredAt: new Date(Date.now()-86400000*1).toISOString() },
  { id:'3', name:'Dr Amara Osei',       email:'a.osei@mediclinic.co.za',  rsvp:false, attended:true,  occupation:'Cardiologist',         registeredAt: new Date(Date.now()-3600000).toISOString() },
  { id:'4', name:'Dr Lerato Mokoena',   email:'l.mokoena@life.co.za',     rsvp:true,  attended:false, occupation:'Orthopaedic Surgeon',  registeredAt: new Date(Date.now()-86400000*7).toISOString() },
  { id:'5', name:'Dr James van Rooyen', email:'j.vanrooyen@uhw.co.za',    rsvp:false, attended:true,  occupation:'Radiologist',          registeredAt: new Date(Date.now()-1800000).toISOString() },
  { id:'6', name:'Dr Fatima Essop',     email:'f.essop@groote.co.za',     rsvp:true,  attended:true,  occupation:'Paediatrician',        registeredAt: new Date(Date.now()-86400000*3).toISOString() },
];

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

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isMobile } = useWindowSize();
  const [attendeeFilter, setAttendeeFilter] = useState('all');
  const [showQr, setShowQr] = useState(false);

  const event = MOCK_EVENT;

  const filtered = MOCK_ATTENDEES.filter(a => {
    if (attendeeFilter === 'rsvp')     return a.rsvp;
    if (attendeeFilter === 'walkin')   return !a.rsvp && a.attended;
    if (attendeeFilter === 'noshow')   return a.rsvp && !a.attended;
    if (attendeeFilter === 'attended') return a.attended;
    return true;
  });

  const regUrl = `https://medbroker.co.za/register?token=${event.qrToken}`;
  const attendancePct = Math.round((event.attendedCount / event.rsvpCount) * 100);

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px' }}>

      {/* Header */}
      <button onClick={() => navigate('/events')} style={s.backBtn}>← Back to Events</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '8px 0 20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color:'var(--ink)', margin: '0 0 4px' }}>{event.name}</h1>
          <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
            {event.university} · {format(new Date(event.eventDate), 'd MMMM yyyy')} · {event.venue}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {event.status === 'Active' && (
            <button onClick={() => setShowQr(true)} style={s.primaryBtn}>Show QR Code</button>
          )}
          <button style={s.secondaryBtn}>Download Report</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'RSVPs',           value: event.rsvpCount,                                       colour: 'var(--accent)' },
          { label: 'Attended',        value: event.attendedCount,                                    colour: '#15803d' },
          { label: 'Walk-ins',        value: event.walkinCount,                                      colour: '#7c3aed' },
          { label: 'No-shows',        value: event.rsvpCount - event.attendedCount,                  colour: '#dc2626' },
          { label: 'Attendance rate', value: `${attendancePct}%`,                                    colour: '#0891b2' },
        ].map(c => (
          <div key={c.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.colour }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Attendance rate bar */}
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
            <div style={{ background: '#8b5cf6', width: `${Math.round((event.walkinCount  / event.rsvpCount) * 100)}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
          <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}><span style={{ color: '#10b981' }}>■</span> RSVP attended</span>
          <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}><span style={{ color: '#8b5cf6' }}>■</span> Walk-ins</span>
        </div>
      </div>

      {/* Attendee list */}
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Attendees</h2>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[['all','All'],['attended','Attended'],['rsvp','RSVP'],['walkin','Walk-in'],['noshow','No-show']].map(([key, label]) => (
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
              <tr key={a.id} style={s.tr}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ ...s.td, fontWeight: 500 }}>{a.name}</td>
                <td style={{ ...s.td, color:'var(--mut)' }}>{a.email}</td>
                <td style={s.td}>{a.occupation}</td>
                <td style={s.td}><YesNo value={a.rsvp} /></td>
                <td style={s.td}><YesNo value={a.attended} /></td>
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

      {/* QR code modal */}
      {showQr && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowQr(false); }}>
          <div style={{ ...s.modal, width: '420px', textAlign: 'center' }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Event QR Code</h2>
              <button onClick={() => setShowQr(false)} style={s.closeBtn}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                  <path d="M3 3l10 10M13 3L3 13"/>
                </svg>
              </button>
            </div>
            {/* SVG QR placeholder — in production generate from qrToken */}
            <div style={{ background:'#ffffff', border: '1px solid var(--line)', borderRadius: '8px', padding: '24px', marginBottom: '14px', display: 'inline-block' }}>
              <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
                <rect x="10" y="10" width="60" height="60" rx="4" fill="#111827"/>
                <rect x="90" y="10" width="60" height="60" rx="4" fill="#111827"/>
                <rect x="10" y="90" width="60" height="60" rx="4" fill="#111827"/>
                <rect x="20" y="20" width="40" height="40" rx="2" fill="white"/>
                <rect x="100" y="20" width="40" height="40" rx="2" fill="white"/>
                <rect x="20" y="100" width="40" height="40" rx="2" fill="white"/>
                <rect x="30" y="30" width="20" height="20" fill="#111827"/>
                <rect x="110" y="30" width="20" height="20" fill="#111827"/>
                <rect x="30" y="110" width="20" height="20" fill="#111827"/>
                <rect x="90" y="90" width="14" height="14" fill="#111827"/>
                <rect x="110" y="90" width="14" height="14" fill="#111827"/>
                <rect x="130" y="90" width="14" height="14" fill="#111827"/>
                <rect x="90" y="110" width="14" height="14" fill="#111827"/>
                <rect x="130" y="110" width="14" height="14" fill="#111827"/>
                <rect x="90" y="130" width="14" height="14" fill="#111827"/>
                <rect x="110" y="130" width="14" height="14" fill="#111827"/>
              </svg>
            </div>
            <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '4px' }}>Students scan this code to register</p>
            <p style={{ fontSize: '0.75rem', color:'var(--mut)', wordBreak: 'break-all', marginBottom: '16px' }}>{regUrl}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button style={s.primaryBtn}>Download PNG</button>
              <button onClick={() => setShowQr(false)} style={s.secondaryBtn}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
