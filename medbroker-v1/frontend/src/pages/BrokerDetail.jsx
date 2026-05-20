/**
 * pages/BrokerDetail.jsx
 * Detailed performance view for a single broker.
 * Reached from Reports → Broker Performance → View.
 */

import { useNavigate } from 'react-router-dom';
import { s } from '../styles/tokens.js';

const PRODUCTS_SOLD = [
  { name: 'Life Insurance',    count: 6, colour: '#3b82f6' },
  { name: 'Income Protection', count: 5, colour: '#3b82f6' },
  { name: 'Disability Cover',  count: 4, colour: '#3b82f6' },
  { name: 'Medical Aid',       count: 3, colour: '#06b6d4' },
  { name: 'Gap Cover',         count: 2, colour: '#06b6d4' },
  { name: 'Vitality',          count: 2, colour: '#10b981' },
];

const RECENT = [
  { name: 'Dr Priya Naidoo',   portfolio: 'Discovery', m1: 'Pending',    m2: null,        signed: null  },
  { name: 'Dr Amara Osei',     portfolio: 'M&M',       m1: 'Seen',       m2: 'Rescheduled', signed: 'Yes' },
  { name: 'Dr Lerato Mokoena', portfolio: 'Discovery', m1: 'Seen',       m2: 'Seen',       signed: 'Yes' },
  { name: 'Dr Marco Ferreira', portfolio: 'M&M',       m1: 'Cancelled',  m2: null,        signed: 'No'  },
];

const MEETING_SUMMARY = [
  { label: '1st meeting — Seen',       value: '16 / 18', colour: '#15803d' },
  { label: '1st meeting — Rescheduled',value: '2 / 18',  colour: '#111827' },
  { label: '2nd meeting — Seen',       value: '12 / 16', colour: '#15803d' },
  { label: '2nd meeting — Rescheduled',value: '2 / 16',  colour: '#111827' },
  { label: '2nd meeting — Cancelled',  value: '2 / 16',  colour: '#dc2626' },
  { label: 'Signed after 2nd meeting', value: '9 / 12 (75%)', colour: '#15803d', bold: true },
];

function fmt(n) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

const maxSold = Math.max(...PRODUCTS_SOLD.map(p => p.count));

function MeetingBadge({ status }) {
  if (!status) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
  const meta = {
    Seen:        { bg: '#f0fdf4', colour: '#15803d' },
    Rescheduled: { bg: '#fffbeb', colour: '#d97706' },
    Cancelled:   { bg: '#fef2f2', colour: '#dc2626' },
    Pending:     { bg: '#f3f4f6', colour: '#6b7280' },
  }[status] ?? { bg: '#f3f4f6', colour: '#6b7280' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.688rem' }}>{status}</span>;
}

function SignedBadge({ signed }) {
  if (!signed) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
  return (
    <span style={{
      ...s.badge, fontSize: '0.688rem',
      background: signed === 'Yes' ? '#f0fdf4' : '#fef2f2',
      color:      signed === 'Yes' ? '#15803d' : '#dc2626',
    }}>
      {signed}
    </span>
  );
}

export default function BrokerDetail() {
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '6px 0 18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Broker Detail — Sandra van der Berg</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color: '#6b7280' }}>
            Performance report · Month to date · Gauteng, Limpopo · Discovery + Money &amp; Medicine
          </p>
        </div>
        <button style={s.secondaryBtn}>Export PDF</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Appointments',   value: '18',           colour: '#111827' },
          { label: 'Signed',         value: '9',            colour: '#15803d' },
          { label: 'Conversion',     value: '50%',          colour: '#15803d' },
          { label: 'Policy value',   value: fmt(1_420_000), colour: '#15803d' },
          { label: 'Broker switches',value: '3',            colour: '#111827' },
        ].map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={{ fontSize: '0.688rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: m.colour, lineHeight: 1 }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Products sold */}
        <div style={s.card}>
          <div style={s.cardTitle}>Products Sold This Month</div>
          {PRODUCTS_SOLD.map(p => (
            <div key={p.name} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{p.name}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{p.count}</span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, background: p.colour, width: `${(p.count / maxSold) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Meeting outcome summary */}
        <div style={s.card}>
          <div style={s.cardTitle}>Meeting Outcome Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {MEETING_SUMMARY.map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: '#6b7280' }}>{row.label}</span>
                <span style={{ fontWeight: row.bold ? 700 : 500, color: row.colour }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent appointments */}
      <div style={s.card}>
        <div style={s.cardTitle}>Recent Appointments</div>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              {['Lead', 'Portfolio', '1st Meeting', '2nd Meeting', 'Signed', 'Products'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT.map(a => {
              const pm = a.portfolio === 'Discovery'
                ? { bg: '#eff6ff', colour: '#1d4ed8' }
                : { bg: '#f5f3ff', colour: '#7c3aed' };
              return (
                <tr
                  key={a.name}
                  style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{a.name}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: pm.bg, color: pm.colour, fontSize: '0.688rem' }}>{a.portfolio}</span>
                  </td>
                  <td style={s.td}><MeetingBadge status={a.m1} /></td>
                  <td style={s.td}><MeetingBadge status={a.m2} /></td>
                  <td style={s.td}><SignedBadge signed={a.signed} /></td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', color: '#6b7280' }}>
                    {a.signed === 'Yes' ? 'Life Insurance, Income Protection' : '—'}
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
