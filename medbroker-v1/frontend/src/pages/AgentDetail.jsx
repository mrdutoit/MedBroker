/**
 * pages/AgentDetail.jsx
 * Detailed performance view for a single agent.
 * Reached from Reports → Agent Activity → View.
 */

import { useNavigate } from 'react-router-dom';
import { s } from '../styles/tokens.js';

const CALL_OUTCOMES = [
  { label: 'No Answer',           count: 48, pct: 34, colour: '#6b7280' },
  { label: 'Voicemail',           count: 29, pct: 20, colour: '#9ca3af' },
  { label: 'Callback Requested',  count: 22, pct: 15, colour: '#f59e0b' },
  { label: 'Appointment Booked',  count: 24, pct: 17, colour: '#8b5cf6' },
  { label: 'Not Interested',      count: 12, pct: 8,  colour: '#ef4444' },
  { label: 'Wrong Number',        count: 7,  pct: 5,  colour: '#fca5a5' },
];

const WEEKLY = [
  { day: 'Mon', calls: 26, booked: 3 },
  { day: 'Tue', calls: 32, booked: 5 },
  { day: 'Wed', calls: 38, booked: 7 },
  { day: 'Thu', calls: 34, booked: 6 },
  { day: 'Fri', calls: 12, booked: 2 },
];

const RECENT_LEADS = [
  { name: 'Dr Priya Naidoo',  source: 'Wits Career Fair 2026',   status: 'AppointmentBooked', lastCall: '14 May', outcome: 'AppointmentBooked' },
  { name: 'Dr Ayesha Moosa',  source: 'Manual — Referral',       status: 'Progressed',        lastCall: '13 May', outcome: 'CallbackRequested' },
  { name: 'Dr Marco Ferreira',source: 'MedLeads SA — Monthly',   status: 'InProgress',        lastCall: '12 May', outcome: 'Voicemail' },
];

const STATUS_COLOUR = {
  AppointmentBooked: { bg: '#f5f3ff', colour: '#7c3aed' },
  Progressed:        { bg: '#ecfeff', colour: '#0891b2' },
  InProgress:        { bg: '#fffbeb', colour: '#d97706' },
};

const OUTCOME_COLOUR = {
  AppointmentBooked: { bg: '#f5f3ff', colour: '#7c3aed' },
  CallbackRequested: { bg: '#fffbeb', colour: '#d97706' },
  Voicemail:         { bg: '#f3f4f6', colour: '#6b7280' },
};

function fmt(n) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

const maxCalls  = Math.max(...WEEKLY.map(w => w.calls));
const maxBooked = Math.max(...WEEKLY.map(w => w.booked));

export default function AgentDetail() {
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '6px 0 18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Agent Detail — Thabo Molefe</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color: '#6b7280' }}>Performance report · Month to date · Gauteng · Discovery</p>
        </div>
        <button style={s.secondaryBtn}>Export PDF</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Leads assigned',   value: '68',    colour: '#111827' },
          { label: 'Calls made',       value: '142',   colour: '#111827' },
          { label: 'Appts booked',     value: '24',    sub: '17% booking rate', colour: '#7c3aed' },
          { label: 'Callbacks pending',value: '4',     colour: '#d97706' },
          { label: 'Uncontactable',    value: '7',     colour: '#ef4444' },
        ].map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={{ fontSize: '0.688rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: m.colour, lineHeight: 1 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Call outcomes */}
        <div style={s.card}>
          <div style={s.cardTitle}>Call Outcome Breakdown</div>
          {CALL_OUTCOMES.map(o => (
            <div key={o.label} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{o.label}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{o.count} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({o.pct}%)</span></span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, background: o.colour, width: `${o.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Daily activity chart */}
        <div style={s.card}>
          <div style={s.cardTitle}>Daily Call Activity — This Week</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '150px', paddingTop: '12px' }}>
            {WEEKLY.map(w => (
              <div key={w.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '4px' }}>
                <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px' }}>
                  <div style={{ flex: 1, background: '#bfdbfe', borderRadius: '3px 3px 0 0', height: `${(w.calls / maxCalls) * 100}%` }} />
                  <div style={{ flex: 1, background: '#10b981', borderRadius: '3px 3px 0 0', height: `${(w.booked / maxBooked) * 100}%` }} />
                </div>
                <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{w.day}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}><span style={{ color: '#3b82f6' }}>■</span> Calls made</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}><span style={{ color: '#10b981' }}>■</span> Appts booked</span>
          </div>
        </div>
      </div>

      {/* Recent leads */}
      <div style={s.card}>
        <div style={s.cardTitle}>Recent Lead Activity</div>
        <table style={s.table}>
          <thead>
            <tr>
              {['Lead', 'Source', 'Status', 'Last Call', 'Outcome', ''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_LEADS.map(lead => {
              const sc = STATUS_COLOUR[lead.status]   ?? { bg: '#f3f4f6', colour: '#6b7280' };
              const oc = OUTCOME_COLOUR[lead.outcome] ?? { bg: '#f3f4f6', colour: '#6b7280' };
              return (
                <tr
                  key={lead.name}
                  style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{lead.name}</td>
                  <td style={{ ...s.td, color: '#6b7280', fontSize: '0.8125rem' }}>{lead.source}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.colour, fontSize: '0.688rem' }}>{lead.status}</span>
                  </td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.8125rem' }}>{lead.lastCall}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: oc.bg, color: oc.colour, fontSize: '0.688rem' }}>{lead.outcome}</span>
                  </td>
                  <td style={s.td}>
                    <button style={s.linkBtn} onClick={() => navigate('/leads')}>View →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
