/**
 * pages/BrokerDetail.jsx
 * Detailed performance view for a single broker.
 * Reached from Reports → Broker Performance → View.
 *
 * REWIRED TO REAL DATA 23 Jul 2026 — previously entirely mock (hardcoded
 * BROKER_META/BROKER_KPI keyed by 4 fake IDs: sb/pj/rb/ms). Backend:
 *   GET /api/reports/broker/:id?period=Monthly|Quarterly|Yearly
 * See api-lib/services/reportService.js's getBrokerDetailReport() for the
 * full design writeup. Same Policy Value gap as Reports.jsx (§42) — no
 * monetary field exists anywhere in the schema, so that KPI and "Broker
 * switches" stayed (isBrokerSwitch is real) while Policy Value was dropped
 * and replaced with "Meetings Held" (real, counted across meeting1/2/3
 * Status = 'Seen'). Products Sold and the meeting summary are both fully
 * real — AppointmentProduct was already correctly wired by the outcome-
 * save flow, nothing new needed there; just a report query reading it.
 *
 * The broker is identified by the :id URL param (a real User.id now).
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch } from '../hooks/useFetch.js';
import { reportsApi, apiMode } from '../services/api.js';

function getPeriodLabel(period) {
  const now = new Date();
  if (period === 'Monthly')   return `Month to date (${now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })})`;
  if (period === 'Quarterly') return `Quarter to date (Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()})`;
  return `Year to date (${now.getFullYear()})`;
}

const PRODUCT_COLOURS = ['#3b82f6', '#3b82f6', '#6366f1', '#06b6d4', '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#f97316'];

function MeetingBadge({ status }) {
  if (!status) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  const meta = {
    Seen:        { bg: 'color-mix(in srgb, #15803d 12%, var(--panel))', colour: '#15803d' },
    Rescheduled: { bg: 'color-mix(in srgb, #d97706 12%, var(--panel))', colour: '#d97706' },
    Cancelled:   { bg: 'color-mix(in srgb, #dc2626 12%, var(--panel))', colour: '#dc2626' },
  }[status] ?? { bg: 'color-mix(in srgb, var(--mut) 12%, var(--panel))', colour: 'var(--mut)' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.6875rem' }}>{status}</span>;
}

function SignedBadge({ signed }) {
  if (signed === null || signed === undefined) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  return (
    <span style={{
      ...s.badge, fontSize: '0.6875rem',
      background: signed ? 'color-mix(in srgb, #15803d 12%, var(--panel))' : 'color-mix(in srgb, #dc2626 12%, var(--panel))',
      color:      signed ? '#15803d' : '#dc2626',
    }}>
      {signed ? 'Yes' : 'No'}
    </span>
  );
}

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

  const { data, loading, error } = useFetch(() => reportsApi.brokerDetail(id, period), [id, period]);

  if (loading) {
    return <div style={{ padding: isMobile ? '12px' : '24px' }}><p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>Loading…</p></div>;
  }
  if (error) {
    return (
      <div style={{ padding: isMobile ? '12px' : '24px' }}>
        {showBackToReports && <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>}
        <div style={{ ...s.errorBox, marginTop: '12px' }}>
          Could not load this broker's report. {error.message ?? 'An unexpected error occurred.'}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: isMobile ? '12px' : '24px' }}>
        {showBackToReports && <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>}
        <p style={{ color: 'var(--mut)', fontSize: '0.875rem', marginTop: '12px' }}>Broker not found.</p>
      </div>
    );
  }

  const { meta, kpi, productsSold, meetingSummary, recentAppointments } = data;
  // Bar width must scale with value, not count — count only tells you how
  // many times a product was sold, not how much it was worth. With every
  // product sold exactly once (as in early test data), every bar computed
  // to the same 100% width regardless of value, which is what Mark
  // spotted from a screenshot: R3,833 (TFSA) rendering the same length as
  // R15,000,000 (Life Insurance). Fixed 23 Jul 2026.
  const maxProductValue = Math.max(...productsSold.map(p => p.value), 1);

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

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
            Performance report · {getPeriodLabel(period)} · {meta.region ?? '—'} · {meta.portfolios.length ? meta.portfolios.join(' + ') : 'No portfolio assigned'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
        </div>
      </div>

      {apiMode.DEMO_MODE && loading && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading…</div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Appointments',    value: kpi.appts.toString(),        colour: 'var(--ink)' },
          { label: 'Signed',          value: kpi.signed.toString(),       colour: '#15803d' },
          { label: 'Conversion',      value: kpi.conversion,              colour: '#15803d' },
          { label: 'Policy value',    value: `R${kpi.policyValue.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, colour: '#15803d' },
          { label: 'Broker switches', value: kpi.switches.toString(),     colour: 'var(--ink)' },
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
          {productsSold.length === 0 && <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>No products sold this period.</p>}
          {productsSold.map((p, i) => (
            <div key={p.name} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.8125rem', color:'var(--ink)' }}>{p.name}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {p.count} {p.value > 0 && <span style={{ color: '#15803d', fontWeight: 500 }}>· R{p.value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>}
                </span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, background: PRODUCT_COLOURS[i % PRODUCT_COLOURS.length], width: `${p.value > 0 ? Math.max(2, (p.value / maxProductValue) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Meeting outcome summary */}
        <div style={s.card}>
          <div style={s.cardTitle}>Meeting Outcome Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {meetingSummary.map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color:'var(--mut)' }}>{row.label}</span>
                <span style={{ fontWeight: row.bold ? 700 : 500, color: row.bold ? '#15803d' : 'var(--ink)' }}>{row.value}</span>
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
        {recentAppointments.length === 0 ? (
          <p style={{ padding: '16px', color: 'var(--mut)', fontSize: '0.875rem' }}>No appointments yet.</p>
        ) : (
        <table style={{ ...s.table, minWidth: '680px' }}>
          <thead>
            <tr>
              {['Lead','Portfolio','1st Meeting','2nd Meeting','Signed','Products','Total Value'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentAppointments.map(a => {
              const pillMeta = (name) => name === 'Discovery'
                ? { bg: 'color-mix(in srgb, #1d4ed8 12%, var(--panel))', colour: '#3b82f6' }
                : { bg: 'color-mix(in srgb, #7c3aed 12%, var(--panel))', colour: '#a78bfa' };
              const portfolioList = a.portfolios?.length ? a.portfolios : [a.portfolio];
              return (
                <tr key={a.id} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{a.name}</td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {portfolioList.map(p => {
                        const pm = pillMeta(p);
                        return <span key={p} style={{ ...s.badge, background: pm.bg, color: pm.colour, fontSize: '0.6875rem' }}>{p}</span>;
                      })}
                    </div>
                  </td>
                  <td style={s.td}><MeetingBadge status={a.m1} /></td>
                  <td style={s.td}><MeetingBadge status={a.m2} /></td>
                  <td style={s.td}><SignedBadge  signed={a.signed} /></td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--mut)' }}>
                    {a.products.length ? a.products.join(', ') : '—'}
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', fontWeight: 600, color: a.totalValue > 0 ? '#15803d' : 'var(--mut)' }}>
                    {a.totalValue > 0 ? `R${a.totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
