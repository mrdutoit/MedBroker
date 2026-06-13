/**
 * pages/BrokerDetail.jsx
 * Detailed performance view for a single broker.
 * Reached from Reports → Broker Performance → View.
 *
 * Period selector (Monthly / Quarterly / Yearly) mirrors Reports.jsx so
 * the data shown here is consistent with the period selected in the parent table.
 * The broker is identified by the :id URL param (matches BROKER_DATA keys).
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

// ─── Period-aware mock data ────────────────────────────────────────────────────
// Mirrors the IDs and values in Reports.jsx BROKER_DATA exactly.
const BROKER_META = {
  sb: { name: 'Sandra van der Berg', region: 'Gauteng, Limpopo',  portfolio: 'Discovery + M&M' },
  pj: { name: 'Pieter Joubert',       region: 'Gauteng',           portfolio: 'Discovery'       },
  rb: { name: 'Riaan Botha',           region: 'Western Cape',      portfolio: 'M&M'             },
  ms: { name: 'Marelize Swart',        region: 'Gauteng',           portfolio: 'Discovery'       },
};

const BROKER_KPI = {
  sb: {
    Monthly:   { appts: 7,  signed: 3, policyValue: 520000,  switches: 1, conversion: '43%' },
    Quarterly: { appts: 18, signed: 9, policyValue: 1420000, switches: 3, conversion: '50%' },
    Yearly:    { appts: 67, signed:34, policyValue: 5280000, switches: 9, conversion: '51%' },
  },
  pj: {
    Monthly:   { appts: 5,  signed: 3, policyValue: 490000,  switches: 0, conversion: '60%' },
    Quarterly: { appts: 12, signed: 7, policyValue: 1150000, switches: 2, conversion: '58%' },
    Yearly:    { appts: 48, signed:27, policyValue: 4390000, switches: 6, conversion: '56%' },
  },
  rb: {
    Monthly:   { appts: 6,  signed: 2, policyValue: 340000,  switches: 1, conversion: '33%' },
    Quarterly: { appts: 14, signed: 6, policyValue: 980000,  switches: 2, conversion: '43%' },
    Yearly:    { appts: 54, signed:22, policyValue: 3620000, switches: 8, conversion: '41%' },
  },
  ms: {
    Monthly:   { appts: 4,  signed: 2, policyValue: 310000,  switches: 0, conversion: '50%' },
    Quarterly: { appts: 8,  signed: 5, policyValue: 790000,  switches: 1, conversion: '63%' },
    Yearly:    { appts: 31, signed:19, policyValue: 2910000, switches: 3, conversion: '61%' },
  },
};

const PRODUCTS_SOLD = [
  { name: 'Life Insurance',    count: 6, colour: '#3b82f6' },
  { name: 'Income Protection', count: 5, colour: '#3b82f6' },
  { name: 'Disability Cover',  count: 4, colour: '#6366f1' },
  { name: 'Medical Aid',       count: 3, colour: '#06b6d4' },
  { name: 'Gap Cover',         count: 2, colour: '#06b6d4' },
  { name: 'Vitality',          count: 2, colour: '#10b981' },
];

const MEETING_SUMMARY = [
  { label: '1st meeting — Seen',        value: '16 / 18', colour: '#15803d' },
  { label: '1st meeting — Rescheduled', value: '2 / 18',  colour: 'var(--mut)' },
  { label: '2nd meeting — Seen',        value: '12 / 16', colour: '#15803d' },
  { label: '2nd meeting — Rescheduled', value: '2 / 16',  colour: 'var(--mut)' },
  { label: '2nd meeting — Cancelled',   value: '2 / 16',  colour: '#dc2626' },
  { label: 'Signed after 2nd meeting',  value: '9 / 12 (75%)', colour: '#15803d', bold: true },
];

const RECENT = [
  { name: 'Dr Priya Naidoo',   portfolio:'Discovery', m1:'Pending',   m2:null,          signed:null  },
  { name: 'Dr Amara Osei',     portfolio:'M&M',       m1:'Seen',       m2:'Rescheduled', signed:'Yes' },
  { name: 'Dr Lerato Mokoena', portfolio:'Discovery', m1:'Seen',       m2:'Seen',        signed:'Yes' },
  { name: 'Dr Marco Ferreira', portfolio:'M&M',       m1:'Cancelled',  m2:null,          signed:'No'  },
];

const PERIOD_LABELS = {
  Monthly:   'Month to date (May 2026)',
  Quarterly: 'Quarter to date (Q2 2026)',
  Yearly:    'Year to date (2026)',
};

const fmt = n => `R${(n / 1000000).toFixed(2)}m`;

function MeetingBadge({ status }) {
  if (!status) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  const meta = {
    Seen:        { bg: 'color-mix(in srgb, #15803d 12%, var(--panel))', colour: '#15803d' },
    Rescheduled: { bg: 'color-mix(in srgb, #d97706 12%, var(--panel))', colour: '#d97706' },
    Cancelled:   { bg: 'color-mix(in srgb, #dc2626 12%, var(--panel))', colour: '#dc2626' },
    Pending:     { bg: 'color-mix(in srgb, var(--mut) 12%, var(--panel))', colour: 'var(--mut)' },
  }[status] ?? { bg: 'color-mix(in srgb, var(--mut) 12%, var(--panel))', colour: 'var(--mut)' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.6875rem' }}>{status}</span>;
}

function SignedBadge({ signed }) {
  if (!signed) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  return (
    <span style={{
      ...s.badge, fontSize: '0.6875rem',
      background: signed === 'Yes' ? 'color-mix(in srgb, #15803d 12%, var(--panel))' : 'color-mix(in srgb, #dc2626 12%, var(--panel))',
      color:      signed === 'Yes' ? '#15803d' : '#dc2626',
    }}>
      {signed}
    </span>
  );
}

const maxProducts = Math.max(...PRODUCTS_SOLD.map(p => p.count));

export default function BrokerDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { role }   = useRole();
  const { isMobile } = useWindowSize();
  const [period, setPeriod] = useState('Monthly');

  // Self-service roles land here directly and have no Reports overview to return
  // to, so the back link is hidden for them. Management/Supervisors arrived from
  // the overview and keep it.
  const showBackToReports = role !== 'Agent' && role !== 'Broker';

  const brokerId = Object.keys(BROKER_META).includes(id) ? id : 'sb';
  const meta     = BROKER_META[brokerId];
  const kpi      = BROKER_KPI[brokerId][period];

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '960px' }}>

      {/* Header */}
      {showBackToReports && (
        <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '6px 0 18px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>
            Broker Detail — {meta.name}
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color:'var(--mut)' }}>
            Performance report · {PERIOD_LABELS[period]} · {meta.region} · {meta.portfolio}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
            {['Monthly','Quarterly','Yearly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '5px 12px', border: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontFamily: 'inherit', fontWeight: period === p ? 600 : 400,
                background: period === p ? 'var(--accent)' : 'var(--panel)',
                color:      period === p ? '#ffffff'       : 'var(--mut)',
                borderRight: p !== 'Yearly' ? '1px solid var(--line)' : 'none',
                transition: 'background 0.15s',
              }}>
                {p}
              </button>
            ))}
          </div>
          <button style={s.secondaryBtn}>Export PDF</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Appointments',    value: kpi.appts.toString(),         colour: 'var(--ink)' },
          { label: 'Signed',          value: kpi.signed.toString(),        colour: '#15803d' },
          { label: 'Conversion',      value: kpi.conversion,               colour: '#15803d' },
          { label: 'Policy value',    value: fmt(kpi.policyValue),         colour: '#15803d' },
          { label: 'Broker switches', value: kpi.switches.toString(),      colour: 'var(--ink)' },
        ].map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: m.colour, lineHeight: 1 }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Products sold */}
        <div style={s.card}>
          <div style={s.cardTitle}>Products Sold — {period}</div>
          {PRODUCTS_SOLD.map(p => (
            <div key={p.name} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.8125rem', color:'var(--ink)' }}>{p.name}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{p.count}</span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, background: p.colour, width: `${(p.count / maxProducts) * 100}%` }} />
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
                <span style={{ color:'var(--mut)' }}>{row.label}</span>
                <span style={{ fontWeight: row.bold ? 700 : 500, color: row.colour }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent appointments */}
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom:'1px solid var(--line)' }}>
          <div style={s.cardTitle}>Recent Appointments</div>
        </div>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              {['Lead','Portfolio','1st Meeting','2nd Meeting','Signed','Products'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT.map(a => {
              const pm = a.portfolio === 'Discovery'
                ? { bg: 'color-mix(in srgb, #1d4ed8 12%, var(--panel))', colour: '#3b82f6' }
                : { bg: 'color-mix(in srgb, #7c3aed 12%, var(--panel))', colour: '#a78bfa' };
              return (
                <tr key={a.name} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{a.name}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: pm.bg, color: pm.colour, fontSize: '0.6875rem' }}>{a.portfolio}</span>
                  </td>
                  <td style={s.td}><MeetingBadge status={a.m1} /></td>
                  <td style={s.td}><MeetingBadge status={a.m2} /></td>
                  <td style={s.td}><SignedBadge  signed={a.signed} /></td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--mut)' }}>
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
