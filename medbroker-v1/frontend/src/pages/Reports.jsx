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
 */

import { useState }      from 'react';
import { useNavigate }   from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s }             from '../styles/tokens.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt   = v => `R${(v / 1000000).toFixed(2)}m`;
const fmtK  = v => v >= 1000 ? `R${(v / 1000).toFixed(0)}k` : `R${v}`;
const pct   = (n, d) => d === 0 ? '0%' : `${Math.round(n / d * 100)}%`;

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

// ─── Bar chart ──────────────────────────────────────────────────────────────────
function TrendChart({ data }) {
  const maxLeads = Math.max(...data.map(d => d.leads), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px', paddingTop: '8px' }}>
        {data.map((d, i) => {
          const isFuture = d.leads === 0 && d.won === 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
              {d.won > 0 && (
                <span style={{ fontSize: '0.5625rem', color: '#10b981', fontWeight: 600 }}>{d.won}</span>
              )}
              <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px' }}>
                <div style={{
                  flex: 1, borderRadius: '3px 3px 0 0',
                  background: isFuture ? '#f3f4f6' : '#bfdbfe',
                  height: isFuture ? '4px' : `${Math.max(4, Math.round(d.leads / maxLeads * 100))}%`,
                  transition: 'height 0.4s ease',
                }} />
                <div style={{
                  flex: 1, borderRadius: '3px 3px 0 0',
                  background: isFuture ? '#f3f4f6' : '#10b981',
                  height: isFuture ? '4px' : `${Math.max(d.won > 0 ? 4 : 0, Math.round(d.won / maxLeads * 100))}%`,
                  transition: 'height 0.4s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.625rem', color: isFuture ? '#d1d5db' : '#6b7280' }}>{d.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
        <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}><span style={{ color: '#60a5fa' }}>■</span> Leads</span>
        <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}><span style={{ color: '#10b981' }}>■</span> Closed Won</span>
      </div>
    </div>
  );
}

// ─── Pipeline funnel ──────────────────────────────────────────────────────────
function PipelineFunnel({ data }) {
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map(row => (
        <div key={row.status}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{row.status}</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
              {row.count.toLocaleString()}{' '}
              <span style={{ fontWeight: 400, color: '#9ca3af' }}>({Math.round(row.count / total * 100)}%)</span>
            </span>
          </div>
          <div style={{ background: '#f3f4f6', borderRadius: '4px', height: '8px' }}>
            <div style={{
              background: row.colour,
              width: `${Math.max(2, Math.round(row.count / total * 100))}%`,
              height: '100%', borderRadius: '4px', transition: 'width 0.5s',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const navigate          = useNavigate();
  const { isMobile }      = useWindowSize();
  const [period, setPeriod] = useState('Monthly');

  const pipeline = PIPELINE_DATA[period];
  const trend    = TREND_DATA[period];
  const brokers  = BROKER_DATA[period];
  const agents   = AGENT_DATA[period];

  const totalLeads    = pipeline.reduce((a, b) => a + b.count, 0);
  const closedWon     = pipeline.find(r => r.status === 'Closed Won')?.count ?? 0;
  const totalPolicies = brokers.reduce((a, b) => a + b.policyValue, 0);
  const convRate      = pct(closedWon, totalLeads);

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

      {/* ── Header + period selector ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Reports</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            {PERIOD_LABELS[period]}
          </p>
        </div>
        <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          {['Monthly', 'Quarterly', 'Yearly'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontFamily: 'inherit', fontWeight: period === p ? 600 : 400,
                background: period === p ? '#1d4ed8' : 'white',
                color:      period === p ? 'white'   : '#6b7280',
                borderRight: p !== 'Yearly' ? '1px solid #e5e7eb' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI summary ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Total leads',    value: totalLeads.toLocaleString(), sub: 'All pipeline stages'     },
          { label: 'Closed Won',     value: closedWon.toString(),        sub: `${convRate} conversion`  },
          { label: 'Total policy value', value: fmt(totalPolicies),      sub: 'Closed Won policies'     },
          { label: 'Avg per broker', value: fmtK(Math.round(totalPolicies / brokers.length)), sub: 'Policy value' },
        ].map(c => (
          <div key={c.label} style={s.card}>
            <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '3px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
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

      {/* ── Broker performance ──────────────────────────────────────────── */}
      <div style={{ ...s.tableCard, overflowX: 'auto', marginBottom: '16px' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={s.cardTitle}>Broker Performance</h2>
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
                      {i === 0 && <span title="Top performer">🏆</span>}
                      <span style={{ fontWeight: 500, color: '#111827' }}>{b.name}</span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <span style={{
                      fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px',
                      background: b.portfolio === 'Discovery' ? '#eff6ff' : '#f5f3ff',
                      color: b.portfolio === 'Discovery' ? '#1d4ed8' : '#7c3aed',
                      fontWeight: 500,
                    }}>
                      {b.portfolio}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{b.appts}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{b.signed}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                    {fmt(b.policyValue)}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      <div style={{ width: '50px', background: '#f3f4f6', borderRadius: '4px', height: '6px' }}>
                        <div style={{
                          width: `${Math.round(b.signed / b.appts * 100)}%`,
                          background: '#10b981', height: '100%', borderRadius: '4px',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                        {pct(b.signed, b.appts)}
                      </span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <button
                      style={{ background: 'none', border: 'none', color: '#1d4ed8', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: '4px' }}
                      onClick={() => navigate(`/reports/broker/${b.id}`)}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ── Agent activity ──────────────────────────────────────────────── */}
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={s.cardTitle}>Agent Activity</h2>
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
                <td style={{ ...s.td, fontWeight: 500, color: '#111827' }}>{a.name}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{a.leads.toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{a.calls.toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{a.appts}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  {a.callbacks > 3
                    ? <span style={{ color: '#d97706', fontWeight: 500 }}>{a.callbacks}</span>
                    : a.callbacks}
                </td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 500 }}>{a.conversion}</td>
                <td style={s.td}>
                  <button
                    style={{ background: 'none', border: 'none', color: '#1d4ed8', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: '4px' }}
                    onClick={() => navigate(`/reports/agent/${a.id}`)}
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
