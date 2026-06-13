/**
 * pages/AgentDetail.jsx
 * Detailed performance view for a single agent.
 * Reached from Reports → Agent Activity → View.
 *
 * Period selector (Monthly / Quarterly / Yearly) mirrors Reports.jsx so
 * the data shown here is consistent with the period selected in the parent table.
 * The agent is identified by the :id URL param (matches AGENT_DATA keys).
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

// ─── Period-aware mock data ────────────────────────────────────────────────────
// Mirrors the IDs and values in Reports.jsx AGENT_DATA exactly.
const AGENT_META = {
  tm: { name: 'Thabo Molefe',    region: 'Gauteng',    portfolio: 'Discovery' },
  nv: { name: 'Naledi van Wyk',  region: 'Gauteng',    portfolio: 'Discovery' },
  kp: { name: 'Kabelo Petersen', region: 'Limpopo',    portfolio: 'Discovery' },
  bn: { name: 'Bongani Ntuli',   region: 'Mpumalanga', portfolio: 'M&M' },
};

const AGENT_KPI = {
  tm: {
    Monthly:   { leads: 28,  calls: 54,  appts: 9,  callbacks: 3,  uncontactable: 2, conversion: '32%' },
    Quarterly: { leads: 68,  calls: 142, appts: 24, callbacks: 4,  uncontactable: 6, conversion: '35%' },
    Yearly:    { leads: 241, calls: 504, appts: 84, callbacks: 12, uncontactable: 18, conversion: '35%' },
  },
  nv: {
    Monthly:   { leads: 24,  calls: 49,  appts: 8,  callbacks: 2,  uncontactable: 1, conversion: '33%' },
    Quarterly: { leads: 61,  calls: 128, appts: 22, callbacks: 3,  uncontactable: 5, conversion: '36%' },
    Yearly:    { leads: 218, calls: 461, appts: 78, callbacks: 9,  uncontactable: 14, conversion: '36%' },
  },
  kp: {
    Monthly:   { leads: 19,  calls: 38,  appts: 5,  callbacks: 4,  uncontactable: 3, conversion: '26%' },
    Quarterly: { leads: 54,  calls: 109, appts: 16, callbacks: 7,  uncontactable: 9, conversion: '30%' },
    Yearly:    { leads: 196, calls: 389, appts: 58, callbacks: 19, uncontactable: 28, conversion: '30%' },
  },
  bn: {
    Monthly:   { leads: 21,  calls: 44,  appts: 7,  callbacks: 1,  uncontactable: 2, conversion: '33%' },
    Quarterly: { leads: 58,  calls: 119, appts: 20, callbacks: 2,  uncontactable: 7, conversion: '34%' },
    Yearly:    { leads: 207, calls: 428, appts: 72, callbacks: 7,  uncontactable: 21, conversion: '35%' },
  },
};

// Call outcome breakdown — scales proportionally per period
const CALL_OUTCOMES_BASE = [
  { label: 'No Answer',          pctBase: 34, colour: 'var(--mut)' },
  { label: 'Voicemail',          pctBase: 20, colour: 'var(--mut)' },
  { label: 'Callback Requested', pctBase: 15, colour: '#f59e0b' },
  { label: 'Appointment Booked', pctBase: 17, colour: '#8b5cf6' },
  { label: 'Not Interested',     pctBase: 8,  colour: '#ef4444' },
  { label: 'Wrong Number',       pctBase: 5,  colour: '#fca5a5' },
];

// Weekly/monthly activity chart data per period
const ACTIVITY_DATA = {
  Monthly:   [{ label:'W1', calls:26, booked:3 }, { label:'W2', calls:32, booked:5 }, { label:'W3', calls:38, booked:7 }, { label:'W4', calls:12, booked:2 }],
  Quarterly: [{ label:'Apr', calls:98, booked:16 }, { label:'May', calls:109, booked:18 }, { label:'Jun', calls:0, booked:0 }],
  Yearly:    [
    { label:'Jan', calls:114, booked:18 }, { label:'Feb', calls:98, booked:15 }, { label:'Mar', calls:121, booked:20 },
    { label:'Apr', calls:98,  booked:16 }, { label:'May', calls:109, booked:18 }, { label:'Jun', calls:0, booked:0 },
    { label:'Jul', calls:0, booked:0 }, { label:'Aug', calls:0, booked:0 }, { label:'Sep', calls:0, booked:0 },
    { label:'Oct', calls:0, booked:0 }, { label:'Nov', calls:0, booked:0 }, { label:'Dec', calls:0, booked:0 },
  ],
};

const RECENT_LEADS = [
  { leadId:'lead-001', name:'Dr Priya Naidoo',   source:'Wits Career Fair 2026',  status:'AppointmentScheduled', lastCall:'14 May', outcome:'AppointmentScheduled' },
  { leadId:'lead-002', name:'Dr Ayesha Moosa',   source:'Manual — Referral',      status:'InProgress',           lastCall:'13 May', outcome:'CallbackRequested'    },
  { leadId:'lead-003', name:'Dr Marco Ferreira', source:'MedLeads SA — Monthly',  status:'InProgress',           lastCall:'12 May', outcome:'Voicemail'            },
];

const STATUS_COLOUR = {
  AppointmentScheduled: { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', colour: '#a78bfa' },
  InProgress:           { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', colour: '#d97706' },
};
const OUTCOME_COLOUR = {
  AppointmentScheduled: { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', colour: '#a78bfa' },
  CallbackRequested:    { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', colour: '#d97706' },
  Voicemail:            { bg: 'var(--panel2)', colour: 'var(--mut)' },
};

const PERIOD_LABELS = {
  Monthly:   'Month to date (May 2026)',
  Quarterly: 'Quarter to date (Q2 2026)',
  Yearly:    'Year to date (2026)',
};

export default function AgentDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { role }   = useRole();
  const { isMobile } = useWindowSize();
  const [period, setPeriod] = useState('Monthly');

  // Self-service roles land here directly and have no Reports overview to return
  // to, so the back link is hidden for them. Management/Supervisors arrived from
  // the overview and keep it.
  const showBackToReports = role !== 'Agent' && role !== 'Broker';

  const agentId  = Object.keys(AGENT_META).includes(id) ? id : 'tm';
  const meta     = AGENT_META[agentId];
  const kpi      = AGENT_KPI[agentId][period];
  const activity = ACTIVITY_DATA[period];
  const maxActivity = Math.max(...activity.map(d => d.calls), 1);

  const outcomes = CALL_OUTCOMES_BASE.map(o => ({
    ...o,
    count: Math.round((o.pctBase / 100) * kpi.calls),
  }));

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '960px' }}>

      {/* Header */}
      {showBackToReports && (
        <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '6px 0 18px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>
            Agent Detail — {meta.name}
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
                color:      period === p ? 'white'   : 'var(--mut)',
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
          { label: 'Leads assigned',    value: kpi.leads.toLocaleString(),  colour: 'var(--ink)' },
          { label: 'Calls made',        value: kpi.calls.toLocaleString(),  colour: 'var(--ink)' },
          { label: 'Appts booked',      value: kpi.appts.toString(),        colour: '#7c3aed', sub: `${kpi.conversion} booking rate` },
          { label: 'Callbacks pending', value: kpi.callbacks.toString(),    colour: '#d97706' },
          { label: 'Uncontactable',     value: kpi.uncontactable.toString(),colour: '#ef4444' },
        ].map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: m.colour, lineHeight: 1 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: '0.75rem', color:'var(--mut)', marginTop: '4px' }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Call outcome breakdown */}
        <div style={s.card}>
          <div style={s.cardTitle}>Call Outcome Breakdown</div>
          {outcomes.map(o => (
            <div key={o.label} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.8125rem', color:'var(--ink)' }}>{o.label}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {o.count} <span style={{ color:'var(--mut)', fontWeight: 400 }}>({o.pctBase}%)</span>
                </span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, background: o.colour, width: `${o.pctBase}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Activity chart */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            {period === 'Monthly' ? 'Daily Call Activity — This Week' : `Call Activity — ${period === 'Quarterly' ? 'Q2 2026' : '2026'}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'Yearly' ? '4px' : '10px', height: '150px', paddingTop: '12px' }}>
            {activity.map((w, i) => {
              const isFuture = w.calls === 0 && w.booked === 0;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '4px' }}>
                  <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px' }}>
                    <div style={{ flex: 1, background: isFuture ? 'var(--panel2)' : 'color-mix(in srgb, var(--accent) 40%, var(--panel))', borderRadius: '3px 3px 0 0', height: isFuture ? '4px' : `${Math.max(4, (w.calls / maxActivity) * 100)}%`, transition: 'height 0.3s' }} />
                    <div style={{ flex: 1, background: isFuture ? 'var(--panel2)' : '#10b981', borderRadius: '3px 3px 0 0', height: isFuture ? '4px' : `${Math.max(w.booked > 0 ? 4 : 0, (w.booked / maxActivity) * 100)}%`, transition: 'height 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '0.625rem', color: isFuture ? 'var(--mut)' : 'var(--mut)' }}>{w.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}><span style={{ color: '#3b82f6' }}>■</span> Calls made</span>
            <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}><span style={{ color: '#10b981' }}>■</span> Appts booked</span>
          </div>
        </div>
      </div>

      {/* Recent leads */}
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom:'1px solid var(--line)' }}>
          <div style={s.cardTitle}>Recent Lead Activity</div>
        </div>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              {['Lead','Source','Status','Last Call','Outcome',''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_LEADS.map(lead => {
              const sc = STATUS_COLOUR[lead.status]   ?? { bg: 'var(--panel2)', colour: 'var(--mut)' };
              const oc = OUTCOME_COLOUR[lead.outcome] ?? { bg: 'var(--panel2)', colour: 'var(--mut)' };
              return (
                <tr key={lead.name} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{lead.name}</td>
                  <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>{lead.source}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.colour, fontSize: '0.6875rem' }}>{lead.status}</span>
                  </td>
                  <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>{lead.lastCall}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: oc.bg, color: oc.colour, fontSize: '0.6875rem' }}>{lead.outcome}</span>
                  </td>
                  <td style={s.td}>
                    <button style={s.linkBtn} onClick={() => navigate(`/leads/${lead.leadId}`)}>View →</button>
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
