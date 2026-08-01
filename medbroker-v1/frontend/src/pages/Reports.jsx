/**
 * pages/Reports.jsx
 *
 * Executive reporting dashboard. Period selector (Monthly / Quarterly / Yearly)
 * controls all KPI metrics, the trend chart, broker performance table, and
 * agent activity table.
 *
 * REWIRED TO REAL DATA 23 Jul 2026 — previously entirely mock. Backend:
 *   GET /api/reports/summary?period=Monthly|Quarterly|Yearly
 *   GET /api/reports/brokers?period=...
 *   GET /api/reports/agents?period=...
 * See api-lib/services/reportService.js for the full design writeup —
 * two real gaps were found and resolved with Mark before writing any
 * backend code, not assumed:
 *   - The mock's "Uncontactable" pipeline bucket has no backing data
 *     anywhere. Dropped. Converted leads are now split by their most
 *     recent Appointment's actual outcome (Won/Lost/still active) instead
 *     of a status that only ever lived on the Lead.
 *   - No monetary/premium field exists anywhere in the schema. "Policy
 *     Value" and everything derived from it (Avg per broker, Avg per
 *     signing) are dropped rather than inventing a new capture feature —
 *     replaced with real, already-available metrics (Appointments Booked
 *     / Active Brokers org-wide; Conversion Rate / Portfolios for a
 *     broker's own view).
 *
 * Role-based scoping now happens SERVER-SIDE (reportService.js) — Admin/
 * GlobalAdmin see everything, Supervisor sees their own real direct
 * reports (getDirectReportIds(), not a hardcoded name list), Agent/Broker
 * see only their own row. The client no longer filters mock arrays by
 * persona name.
 *
 * Charts use Recharts (responsive, accessible, themed from styles/tokens.js).
 */

import { useState }     from 'react';
import { useNavigate }  from 'react-router';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts';
import { useRole }       from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch }      from '../hooks/useFetch.js';
import { reportsApi } from '../services/api.js';
import { s, colors, CHART_PALETTE } from '../styles/tokens.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const pct = (n, d) => d === 0 ? '0%' : `${Math.round(n / d * 100)}%`;
// Reintroduced 23 Jul 2026, §44 — removed in §42 when Policy Value was
// dropped for having no real data source. It has one now.
const fmt = v => `R${(v / 1000000).toFixed(2)}m`;

const TOOLTIP_STYLE = {
  background: 'var(--panel)', color: 'var(--ink)', border: `1px solid ${colors.line}`,
  borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  fontSize: '0.75rem', padding: '8px 10px',
};

// Pipeline bucket -> colour. The backend returns counts only (presentation
// detail stays client-side) — 6 buckets now, not 7: Uncontactable dropped
// (see file header), Closed Won/Lost now genuinely reflect the Appointment
// outcome rather than a status that never existed on the Lead itself.
const PIPELINE_COLOURS = {
  Unassigned:           '#9ca3af',
  Assigned:              '#60a5fa',
  'In Progress':         '#f59e0b',
  'Appointment Booked':  '#a78bfa',
  'Closed Won':          '#10b981',
  'Closed Lost':         '#f87171',
};

const TREND_LABELS = {
  Monthly:   'Weekly Lead Volume vs Closed Won',
  Quarterly: 'Monthly Lead Volume vs Closed Won',
  Yearly:    'Monthly Lead Volume vs Closed Won',
};

// Period label — computed from the real current date, not a fixed mock
// reference date. Matches reportService.js's getPeriodRange() in spirit
// (doesn't need to match exactly; this is just display copy).
function getPeriodLabel(period) {
  const now = new Date();
  if (period === 'Monthly') {
    return `Month to date (${now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })})`;
  }
  if (period === 'Quarterly') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `Quarter to date (Q${q} ${now.getFullYear()})`;
  }
  return `Year to date (Jan–Dec ${now.getFullYear()})`;
}

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
  const total = data.reduce((a, b) => a + b.count, 0) || 1;
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
            {data.map((row, i) => <Cell key={i} fill={PIPELINE_COLOURS[row.status] ?? '#9ca3af'} />)}
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

  // ── Who is viewing ──────────────────────────────────────────────────────────
  // Scoping itself now happens server-side (reportService.js) — these flags
  // only control which SECTIONS of the page render, not which rows within
  // a fetched table (the API already only returns rows this viewer may see).
  const isManager    = role === 'GlobalAdmin' || role === 'Admin';
  const isSupervisor = role === 'Supervisor';
  const isAgentView  = role === 'Agent';
  const isBrokerView = role === 'Broker';
  const selfView     = isAgentView || isBrokerView;

  const { data: summaryData, loading: summaryLoading, error: summaryError } =
    useFetch(() => reportsApi.summary(period), [period]);
  const { data: brokersData, loading: brokersLoading, error: brokersError } =
    useFetch(() => reportsApi.brokers(period), [period]);
  const { data: agentsData, loading: agentsLoading, error: agentsError } =
    useFetch(() => reportsApi.agents(period), [period]);

  const pipeline = summaryData?.pipeline ?? [];
  const trend    = summaryData?.trend ?? [];
  const brokers  = brokersData?.brokers ?? [];
  const agents   = agentsData?.agents ?? [];

  const anyLoading = summaryLoading || brokersLoading || agentsLoading;
  const anyError   = summaryError ?? brokersError ?? agentsError;

  // Section visibility — driven by what actually came back, not a client-
  // side role filter (the API already scoped the rows).
  const showOrgCharts   = isManager || isSupervisor;
  const showBrokerTable = brokers.length > 0;
  const showAgentTable  = agents.length > 0;

  // ── KPI cards — scoped to the viewer ────────────────────────────────────────
  const myAgent  = selfView ? agents[0]  : undefined;
  const myBroker = selfView ? brokers[0] : undefined;

  const orgTotalLeads     = pipeline.reduce((sum, r) => sum + r.count, 0);
  const orgClosedWon      = pipeline.find(r => r.status === 'Closed Won')?.count ?? 0;
  const orgAppts          = agents.reduce((sum, a) => sum + a.appts, 0);
  const activeBrokers     = brokers.filter(b => b.appts > 0).length;
  const orgTotalPolicyValue = summaryData?.totalPolicyValue ?? 0;

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
            { label: 'Conversion rate', value: pct(myBroker.signed, myBroker.appts), sub: 'Signed ÷ appointments' },
            { label: 'My policy value', value: fmt(myBroker.policyValue),  sub: 'Products sold this period' },
          ]
        : [])
    : [
        { label: 'Total leads',        value: orgTotalLeads.toLocaleString(), sub: 'All pipeline stages' },
        { label: 'Closed Won',         value: orgClosedWon.toString(),        sub: `${pct(orgClosedWon, orgTotalLeads)} conversion` },
        { label: 'Appointments booked',value: orgAppts.toLocaleString(),      sub: 'Booked this period' },
        { label: 'Active brokers',     value: activeBrokers.toString(),       sub: 'With ≥1 appointment' },
        { label: 'Total policy value', value: fmt(orgTotalPolicyValue),       sub: 'Across all products sold' },
      ];

  const noSelfData = selfView && !anyLoading && kpis.length === 0;

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

      {/* ── Header + period selector ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={s.pageTitle}>Reports</h1>
          <p style={s.pageSubtitle}>
            {selfView ? `Your performance · ${getPeriodLabel(period)}` : getPeriodLabel(period)}
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

      {anyLoading && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading report data…</div>
      )}
      {anyError && (
        <div style={{ ...s.errorBox, marginBottom: '14px' }}>
          Could not load some report data: {anyError.message ?? 'An unexpected error occurred.'}
        </div>
      )}

      {/* ── KPI summary ─────────────────────────────────────────────────── */}
      {noSelfData ? (
        <div style={{ ...s.card, marginBottom: '16px', color: colors.ink500, fontSize: '0.875rem' }}>
          No reporting data for your account in this period.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${kpis.length}, 1fr)`, gap: '12px', marginBottom: '16px' }}>
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
                      {!isBrokerView && i === 0 && b.policyValue > 0 && <span title="Top performer">🏆</span>}
                      <span style={{ fontWeight: 600, color: colors.ink }}>{b.name}</span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {b.portfolios.length === 0 && <span style={{ color: colors.ink400, fontSize: '0.75rem' }}>—</span>}
                      {b.portfolios.map(p => (
                        <span key={p} style={{
                          fontSize: '0.75rem', padding: '2px 10px', borderRadius: '999px',
                          background: p === 'Discovery' ? colors.primarySoft : 'color-mix(in srgb, var(--accent2) 16%, transparent)',
                          color: p === 'Discovery' ? colors.primary : 'var(--accent2)',
                          fontWeight: 600,
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
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
                          width: b.appts > 0 ? `${Math.round(b.signed / b.appts * 100)}%` : '0%',
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
