/**
 * pages/Reports.jsx
 *
 * Executive reporting dashboard. Period selector (Monthly / Quarterly / Yearly)
 * controls all KPI metrics, the trend chart, broker performance table, and
 * agent activity table. All data is mock — in production comes from:
 *   GET /api/reports/summary?period=monthly|quarterly|yearly
 *   GET /api/reports/brokers?period=...
 *   GET /api/reports/agents?period=...
 *
 * Period definitions (relative to current date 20 May 2026):
 *   Monthly   — current calendar month (May 2026)
 *   Quarterly — current quarter (Q2 2026: Apr–Jun)
 *   Yearly    — current calendar year (Jan–Dec 2026)
 *
 * Charts use Recharts (responsive, accessible, themed from styles/tokens.js).
 * Role-based scoping and section visibility are unchanged from the prior build:
 * management sees everything, supervisors see their direct reports, agents and
 * brokers see only their own performance. Access control also lives in App.jsx.
 */

import { useState }     from 'react';
import { useNavigate }  from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts';
import { useRole }       from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, colors, CHART_PALETTE } from '../styles/tokens.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt   = v => `R${(v / 1000000).toFixed(2)}m`;
const fmtK  = v => v >= 1000 ? `R${(v / 1000).toFixed(0)}k` : `R${v}`;
const pct   = (n, d) => d === 0 ? '0%' : `${Math.round(n / d * 100)}%`;

const TOOLTIP_STYLE = {
  background: 'var(--panel)', color: 'var(--ink)', border: `1px solid ${colors.line}`,
  borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  fontSize: '0.75rem', padding: '8px 10px',
};

// ─── Period-aware mock data ────────────────────────────────────────────────────
// Monthly   — ~1 month of activity (May 2026, partial — 20 days)
// Quarterly — ~3 months (Apr–Jun 2026, Q2 partial)
// Yearly    — ~12 months (Jan–Dec 2026, partial year)
//
// In production these are computed by the API. The scaling here produces
// realistic relative differences between periods.

const PIPELINE_DATA = {
  Monthly: [
    { status: 'Unassigned',           count:  38, colour: '#9ca3af' },
    { status: 'Assigned',             count:  64, colour: '#60a5fa' },
    { status: 'In Progress',          count:  41, colour: '#f59e0b' },
    { status: 'Appointment Booked',   count:  27, colour: '#a78bfa' },
    { status: 'Closed Won',           count:  19, colour: '#10b981' },
    { status: 'Closed Lost',          count:  31, colour: '#f87171' },
    { status: 'Uncontactable',        count:  55, colour: '#d1d5db' },
  ],
  Quarterly: [
    { status: 'Unassigned',           count:  94, colour: '#9ca3af' },
    { status: 'Assigned',             count: 187, colour: '#60a5fa' },
    { status: 'In Progress',          count: 151, colour: '#f59e0b' },
    { status: 'Appointment Booked',   count:  87, colour: '#a78bfa' },
    { status: 'Closed Won',           count:  89, colour: '#10b981' },
    { status: 'Closed Lost',          count: 171, colour: '#f87171' },
    { status: 'Uncontactable',        count: 243, colour: '#d1d5db' },
  ],
  Yearly: [
    { status: 'Unassigned',           count: 312, colour: '#9ca3af' },
    { status: 'Assigned',             count: 641, colour: '#60a5fa' },
    { status: 'In Progress',          count: 508, colour: '#f59e0b' },
    { status: 'Appointment Booked',   count: 294, colour: '#a78bfa' },
    { status: 'Closed Won',           count: 287, colour: '#10b981' },
    { status: 'Closed Lost',          count: 498, colour: '#f87171' },
    { status: 'Uncontactable',        count: 743, colour: '#d1d5db' },
  ],
};

// Trend chart — bars represent different time units per period
// Monthly:   weeks (W1–W3 of May)
// Quarterly: months (Jan Feb Mar... but Q2: Apr May Jun)
// Yearly:    months (Jan–Dec, with future months showing partial or zero)
const TREND_DATA = {
  Monthly: [
    { label: 'W1', leads: 47, won: 5 },
    { label: 'W2', leads: 61, won: 8 },
    { label: 'W3', leads: 38, won: 6 },
    { label: 'W4', leads: 0,  won: 0 },  // future
  ],
  Quarterly: [
    { label: 'Apr', leads: 142, won: 31 },
    { label: 'May', leads: 146, won: 19 },  // partial
    { label: 'Jun', leads: 0,   won: 0  },  // future
  ],
  Yearly: [
    { label: 'Jan', leads: 201, won: 48 },
    { label: 'Feb', leads: 188, won: 41 },
    { label: 'Mar', leads: 224, won: 53 },
    { label: 'Apr', leads: 142, won: 31 },
    { label: 'May', leads: 146, won: 19 },  // partial
    { label: 'Jun', leads: 0,   won: 0  },  // future
    { label: 'Jul', leads: 0,   won: 0  },
    { label: 'Aug', leads: 0,   won: 0  },
    { label: 'Sep', leads: 0,   won: 0  },
    { label: 'Oct', leads: 0,   won: 0  },
    { label: 'Nov', leads: 0,   won: 0  },
    { label: 'Dec', leads: 0,   won: 0  },
  ],
};

const BROKER_DATA = {
  Monthly: [
    { id: 'sb', name: 'Sandra van der Berg', appts: 7,  signed: 3, policyValue: 520000, portfolio: 'Discovery' },
    { id: 'pj', name: 'Pieter Joubert',       appts: 5,  signed: 3, policyValue: 490000, portfolio: 'Discovery' },
    { id: 'rb', name: 'Riaan Botha',           appts: 6,  signed: 2, policyValue: 340000, portfolio: 'M&M'       },
    { id: 'ms', name: 'Marelize Swart',        appts: 4,  signed: 2, policyValue: 310000, portfolio: 'Discovery' },
  ],
  Quarterly: [
    { id: 'sb', name: 'Sandra van der Berg', appts: 18, signed: 9, policyValue: 1420000, portfolio: 'Discovery' },
    { id: 'pj', name: 'Pieter Joubert',       appts: 12, signed: 7, policyValue: 1150000, portfolio: 'Discovery' },
    { id: 'rb', name: 'Riaan Botha',           appts: 14, signed: 6, policyValue:  980000, portfolio: 'M&M'       },
    { id: 'ms', name: 'Marelize Swart',        appts:  8, signed: 5, policyValue:  790000, portfolio: 'Discovery' },
  ],
  Yearly: [
    { id: 'sb', name: 'Sandra van der Berg', appts: 67, signed: 34, policyValue: 5280000, portfolio: 'Discovery' },
    { id: 'pj', name: 'Pieter Joubert',       appts: 48, signed: 27, policyValue: 4390000, portfolio: 'Discovery' },
    { id: 'rb', name: 'Riaan Botha',           appts: 54, signed: 22, policyValue: 3620000, portfolio: 'M&M'       },
    { id: 'ms', name: 'Marelize Swart',        appts: 31, signed: 19, policyValue: 2910000, portfolio: 'Discovery' },
  ],
};

const AGENT_DATA = {
  Monthly: [
    { id: 'tm', name: 'Thabo Molefe',   leads: 28, calls: 54, appts:  9, callbacks: 3, conversion: '32%' },
    { id: 'nv', name: 'Naledi van Wyk', leads: 24, calls: 49, appts:  8, callbacks: 2, conversion: '33%' },
    { id: 'kp', name: 'Kabelo Petersen',leads: 19, calls: 38, appts:  5, callbacks: 4, conversion: '26%' },
    { id: 'bn', name: 'Bongani Ntuli',  leads: 21, calls: 44, appts:  7, callbacks: 1, conversion: '33%' },
  ],
  Quarterly: [
    { id: 'tm', name: 'Thabo Molefe',   leads: 68, calls: 142, appts: 24, callbacks: 4,  conversion: '35%' },
    { id: 'nv', name: 'Naledi van Wyk', leads: 61, calls: 128, appts: 22, callbacks: 3,  conversion: '36%' },
    { id: 'kp', name: 'Kabelo Petersen',leads: 54, calls: 109, appts: 16, callbacks: 7,  conversion: '30%' },
    { id: 'bn', name: 'Bongani Ntuli',  leads: 58, calls: 119, appts: 20, callbacks: 2,  conversion: '34%' },
  ],
  Yearly: [
    { id: 'tm', name: 'Thabo Molefe',   leads: 241, calls: 504, appts:  84, callbacks: 12, conversion: '35%' },
    { id: 'nv', name: 'Naledi van Wyk', leads: 218, calls: 461, appts:  78, callbacks: 9,  conversion: '36%' },
    { id: 'kp', name: 'Kabelo Petersen',leads: 196, calls: 389, appts:  58, callbacks: 19, conversion: '30%' },
    { id: 'bn', name: 'Bongani Ntuli',  leads: 207, calls: 428, appts:  72, callbacks: 7,  conversion: '35%' },
  ],
};

const PERIOD_LABELS = {
  Monthly:   'Month to date (May 2026)',
  Quarterly: 'Quarter to date (Q2 2026 — Apr–Jun)',
  Yearly:    'Year to date (Jan–Dec 2026)',
};

const TREND_LABELS = {
  Monthly:   'Weekly Lead Volume vs Closed Won',
  Quarterly: 'Monthly Lead Volume vs Closed Won',
  Yearly:    'Monthly Lead Volume vs Closed Won',
};

// ─── Trend chart (grouped bars: leads vs closed won) ────────────────────────────
function TrendChart({ data }) {
  return (
    <div style={{ width: '100%', height: '240px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke={CHART_PALETTE.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.ink500 }} axisLine={{ stroke: colors.line }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: colors.ink400 }} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: colors.ink, fontWeight: 600, marginBottom: 2 }}
            cursor={{ fill: 'rgba(37,99,235,0.05)' }}
          />
          <Legend
            iconType="circle" iconSize={8}
            wrapperStyle={{ fontSize: '0.6875rem', color: colors.ink500, paddingTop: 6 }}
          />
          <Bar dataKey="leads" name="Leads"      fill={CHART_PALETTE.leads} radius={[4, 4, 0, 0]} maxBarSize={34} />
          <Bar dataKey="won"   name="Closed Won" fill={CHART_PALETTE.won}   radius={[4, 4, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Pipeline breakdown (horizontal bars, one colour per status) ────────────────
function PipelineFunnel({ data }) {
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <div style={{ width: '100%', height: '240px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART_PALETTE.grid} />
          <XAxis type="number" hide />
          <YAxis
            type="category" dataKey="status" width={118}
            tick={{ fontSize: 11, fill: colors.ink700 }} axisLine={false} tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(37,99,235,0.05)' }}
            formatter={(value) => [`${value.toLocaleString()} (${Math.round(value / total * 100)}%)`, 'Leads']}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((row, i) => <Cell key={i} fill={row.colour} />)}
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: colors.ink500, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const navigate          = useNavigate();
  const { role, persona } = useRole();
  const { isMobile }      = useWindowSize();
  const [period, setPeriod] = useState('Monthly');

  // ── Who is viewing, and at what scope ───────────────────────────────────────
  // Management sees everything. Supervisors see their direct reports. Agents and
  // Brokers see only their own performance. In production the report API scopes
  // by the authenticated user; here we match the preview persona by name.
  const isManager    = role === 'GlobalAdmin' || role === 'Admin';
  const isSupervisor = role === 'Supervisor';
  const isAgentView  = role === 'Agent';
  const isBrokerView = role === 'Broker';
  const selfView     = isAgentView || isBrokerView;
  const me           = persona?.displayName;

  // Supervisor team (mock): Supervisor One → Thabo Molefe, Naledi van Wyk.
  const SUPERVISOR_AGENTS = ['Thabo Molefe', 'Naledi van Wyk'];

  const pipeline = PIPELINE_DATA[period];
  const trend    = TREND_DATA[period];

  // Row-level scope per role.
  const brokers =
      isBrokerView ? BROKER_DATA[period].filter(b => b.name === me)
    : isAgentView  ? []
    :                BROKER_DATA[period];
  const agents =
      isAgentView   ? AGENT_DATA[period].filter(a => a.name === me)
    : isBrokerView  ? []
    : isSupervisor  ? AGENT_DATA[period].filter(a => SUPERVISOR_AGENTS.includes(a.name))
    :                 AGENT_DATA[period];

  // Section visibility.
  const showOrgCharts   = isManager || isSupervisor;   // org-wide pipeline/trend
  const showBrokerTable = brokers.length > 0;
  const showAgentTable  = agents.length > 0;

  // ── KPI cards — scoped to the viewer ────────────────────────────────────────
  const myAgent  = agents[0];
  const myBroker = brokers[0];

  const orgTotalLeads = pipeline.reduce((sum, r) => sum + r.count, 0);
  const orgClosedWon  = pipeline.find(r => r.status === 'Closed Won')?.count ?? 0;
  const orgPolicies   = BROKER_DATA[period].reduce((sum, b) => sum + b.policyValue, 0);

  const kpis = selfView
    ? (isAgentView && myAgent
        ? [
            { label: 'My leads',            value: myAgent.leads.toLocaleString(), sub: 'Assigned to you'      },
            { label: 'Calls made',          value: myAgent.calls.toLocaleString(), sub: 'Outbound calls'       },
            { label: 'Appointments booked', value: myAgent.appts.toString(),       sub: 'From your leads'      },
            { label: 'Booking rate',        value: myAgent.conversion,             sub: 'Leads → appointments' },
          ]
        : isBrokerView && myBroker
        ? [
            { label: 'My appointments', value: myBroker.appts.toString(),  sub: 'Allocated to you'  },
            { label: 'Signed',          value: myBroker.signed.toString(), sub: `${pct(myBroker.signed, myBroker.appts)} conversion` },
            { label: 'Policy value',    value: fmt(myBroker.policyValue),  sub: 'Your signed policies' },
            { label: 'Avg per signing', value: fmtK(Math.round(myBroker.policyValue / (myBroker.signed || 1))), sub: 'Policy value' },
          ]
        : [])
    : [
        { label: 'Total leads',        value: orgTotalLeads.toLocaleString(),  sub: 'All pipeline stages' },
        { label: 'Closed Won',         value: orgClosedWon.toString(),         sub: `${pct(orgClosedWon, orgTotalLeads)} conversion` },
        { label: 'Total policy value', value: fmt(orgPolicies),                sub: 'Closed Won policies' },
        { label: 'Avg per broker',     value: fmtK(Math.round(orgPolicies / (BROKER_DATA[period].length || 1))), sub: 'Policy value' },
      ];

  const noSelfData = selfView && kpis.length === 0;

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

      {/* ── Header + period selector ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={s.pageTitle}>Reports</h1>
          <p style={s.pageSubtitle}>
            {selfView ? `Your performance · ${PERIOD_LABELS[period]}` : PERIOD_LABELS[period]}
          </p>
        </div>
        <div style={s.segment}>
          {['Monthly', 'Quarterly', 'Yearly'].map((p, i) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                ...s.segmentBtn,
                ...(period === p ? s.segmentBtnActive : {}),
                borderRight: i !== 2 ? `1px solid ${colors.line}` : 'none',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI summary ─────────────────────────────────────────────────── */}
      {noSelfData ? (
        <div style={{ ...s.card, marginBottom: '16px', color: colors.ink500, fontSize: '0.875rem' }}>
          No reporting data for your account in this period.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {kpis.map(c => (
            <div key={c.label} style={s.card}>
              <div style={s.kpiLabel}>{c.label}</div>
              <div style={{ ...s.kpiValue, marginTop: '6px' }}>{c.value}</div>
              <div style={s.kpiSub}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts row — org-wide, management/supervisor only ───────────── */}
      {showOrgCharts && (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={s.card}>
          <h2 style={s.cardTitle}>Pipeline Status Breakdown</h2>
          <PipelineFunnel data={pipeline} />
        </div>
        <div style={s.card}>
          <h2 style={s.cardTitle}>{TREND_LABELS[period]}</h2>
          <TrendChart data={trend} />
        </div>
      </div>
      )}

      {/* ── Broker performance ──────────────────────────────────────────── */}
      {showBrokerTable && (
      <div style={{ ...s.tableCard, overflowX: 'auto', marginBottom: '16px' }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${colors.lineSoft}` }}>
          <h2 style={{ ...s.cardTitle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
            {isBrokerView ? 'My Performance' : 'Broker Performance'}
          </h2>
        </div>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              <th style={s.th}>Broker</th>
              <th style={s.th}>Portfolio</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Appointments</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Signed</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Policy Value</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Conversion</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {brokers
              .slice()
              .sort((a, b) => b.policyValue - a.policyValue)
              .map((b, i) => (
                <tr key={b.id} style={s.tr}>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {!selfView && i === 0 && <span title="Top performer">🏆</span>}
                      <span style={{ fontWeight: 600, color: colors.ink }}>{b.name}</span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <span style={{
                      fontSize: '0.75rem', padding: '2px 10px', borderRadius: '999px',
                      background: b.portfolio === 'Discovery' ? colors.primarySoft : 'color-mix(in srgb, var(--accent2) 16%, transparent)',
                      color: b.portfolio === 'Discovery' ? colors.primary : 'var(--accent2)',
                      fontWeight: 600,
                    }}>
                      {b.portfolio}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{b.appts}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{b.signed}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: colors.success }}>
                    {fmt(b.policyValue)}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      <div style={{ width: '50px', background: colors.surfaceSubtle, borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.round(b.signed / b.appts * 100)}%`,
                          background: colors.success, height: '100%', borderRadius: '999px',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                        {pct(b.signed, b.appts)}
                      </span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <button style={s.viewBtn} onClick={() => navigate(`/reports/broker/${b.id}`)}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      )}

      {/* ── Agent activity ──────────────────────────────────────────────── */}
      {showAgentTable && (
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${colors.lineSoft}` }}>
          <h2 style={{ ...s.cardTitle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
            {isAgentView ? 'My Activity' : 'Agent Activity'}
          </h2>
        </div>
        <table style={{ ...s.table, minWidth: '560px' }}>
          <thead>
            <tr>
              <th style={s.th}>Agent</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Calls</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Appts booked</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Callbacks</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Booking rate</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.id} style={s.tr}>
                <td style={{ ...s.td, fontWeight: 600, color: colors.ink }}>{a.name}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{a.leads.toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{a.calls.toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{a.appts}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  {a.callbacks > 3
                    ? <span style={{ color: colors.warn, fontWeight: 600 }}>{a.callbacks}</span>
                    : a.callbacks}
                </td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    <div style={{ width: '50px', background: colors.surfaceSubtle, borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: a.conversion,
                        background: colors.success, height: '100%', borderRadius: '999px',
                      }} />
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{a.conversion}</span>
                  </div>
                </td>
                <td style={s.td}>
                  <button style={s.viewBtn} onClick={() => navigate(`/reports/agent/${a.id}`)}>
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
