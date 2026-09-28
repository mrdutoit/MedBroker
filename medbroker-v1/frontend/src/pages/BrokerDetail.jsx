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
 * and replaced with "Meetings Held" (real, counted via MeetingAttempt
 * rows with status HeldInterested/HeldNotInterested — rewritten 14 Aug
 * 2026, §164, off the old flat meeting1/2/3Status = 'Seen' columns this
 * comment used to describe). Products Sold and the meeting summary are
 * both fully real — AppointmentProduct was already correctly wired by
 * the outcome-save flow, nothing new needed there; just a report query
 * reading it.
 *
 * The broker is identified by the :id URL param (a real User.id now).
 */

import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch } from '../hooks/useFetch.js';
import { reportsApi } from '../services/api.js';
import { PeriodSelector, getPeriodLabel, referenceDateToParam, paramToReferenceDate } from '../components/PeriodSelector.jsx';
// 27 Sep 2026 — app-design-pass, Broker Detail: same chart language as
// Reports. ValueStroke is the page's signature panel (replacing the
// Products Sold list), MetricStrip replaces the KPI card grid, and the
// Meeting Outcome Summary becomes two sets of ranked rows.
import ValueStroke from '../components/viz/ValueStroke.jsx';
import MetricStrip from '../components/viz/MetricStrip.jsx';
import ReasonRows from '../components/viz/ReasonRows.jsx';
import { Section } from '../components/ReportsWidgets.jsx';

const MEETING_STATUS_LABEL = {
  HeldInterested: 'Held, interested', HeldNotInterested: 'Held, not interested',
  Rescheduled: 'Rescheduled', Cancelled: 'Cancelled', Missed: 'Missed / no-show',
  Scheduled: 'Scheduled, not yet held',
};
const MEETING_STATUS_ORDER = ['HeldInterested', 'HeldNotInterested', 'Scheduled', 'Rescheduled', 'Cancelled', 'Missed'];
function meetingRows(counts) {
  const keys = [...MEETING_STATUS_ORDER, ...Object.keys(counts ?? {}).filter(k => !MEETING_STATUS_ORDER.includes(k))];
  return keys
    .map(k => ({ key: k, label: MEETING_STATUS_LABEL[k] ?? k, count: counts?.[k] ?? 0, muted: !['HeldInterested', 'HeldNotInterested'].includes(k) }))
    .filter(r => r.count > 0);
}

// PRODUCT_COLOURS removed 27 Sep 2026 — products are drawn by ValueStroke,
// which ramps through the logo gradient instead of a rainbow.

function MeetingBadge({ status }) {
  if (!status) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) — old
  // vocabulary (Seen/Rescheduled/Cancelled) replaced by the new model's
  // statuses. 'Scheduled' shown too — a still-open meeting attempt
  // (not yet resolved) is a real, distinct state the old model never
  // surfaced here at all (a flat column was either null or one of the
  // three outcomes; there was no "booked, hasn't happened yet" signal on
  // this specific badge before).
  // Cancelled/Missed added back 15 Aug 2026 (§172) — this badge would
  // otherwise have silently fallen through to the generic grey/
  // unlabelled style for two real statuses instead of showing them
  // clearly, the exact "not carried into every place that reads this
  // status" gap this file's own §165 fix was built to catch elsewhere.
  const meta = {
    HeldInterested:    { bg: 'color-mix(in srgb, #15803d 12%, var(--panel))', colour: '#15803d' },
    HeldNotInterested: { bg: 'color-mix(in srgb, #dc2626 12%, var(--panel))', colour: '#dc2626' },
    Rescheduled:       { bg: 'color-mix(in srgb, #d97706 12%, var(--panel))', colour: '#d97706' },
    Scheduled:         { bg: 'color-mix(in srgb, var(--mut) 12%, var(--panel))', colour: 'var(--mut)' },
    Cancelled:         { bg: 'color-mix(in srgb, #b45309 12%, var(--panel))', colour: '#b45309' },
    Missed:            { bg: 'color-mix(in srgb, #7c2d12 12%, var(--panel))', colour: '#7c2d12' },
  }[status] ?? { bg: 'color-mix(in srgb, var(--mut) 12%, var(--panel))', colour: 'var(--mut)' };
  const label = { HeldInterested: 'Held – Interested', HeldNotInterested: 'Held – Not Interested', Missed: 'Missed / No-show' }[status] ?? status;
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.6875rem' }}>{label}</span>;
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

  // §107 — arriving from Reports.jsx's "View →" carries the period that
  // was selected there via ?period=&ref=; a direct link or bookmark with
  // neither param present falls back to the same Monthly/now default
  // this page always had, so existing links keep working unchanged.
  // useState(() => ...) (lazy init) reads the URL only once, on mount —
  // this page's own PeriodSelector, not the URL, owns the value from
  // then on, same as every other page with a PeriodSelector.
  const [searchParams] = useSearchParams();
  const validPeriod = ['Monthly', 'Quarterly', 'Yearly'].includes(searchParams.get('period'));
  const [period, setPeriod] = useState(() => validPeriod ? searchParams.get('period') : 'Monthly');
  const [referenceDate, setReferenceDate] = useState(() => paramToReferenceDate(searchParams.get('ref')));
  const refParam = referenceDateToParam(referenceDate);

  // Self-service roles land here directly and have no Reports overview to return
  // to, so the back link is hidden for them. Management/Supervisors arrived from
  // the overview and keep it.
  const showBackToReports = role !== 'Agent' && role !== 'Broker';

  const { data, loading, error } = useFetch(() => reportsApi.brokerDetail(id, period, refParam), [id, period, refParam]);

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

  const { meta, kpi, productsSold, meetingBreakdown, recentAppointments, avgDaysToClose } = data;
  // 23 Jul 2026 rule (bar length scales with VALUE, not count — R3,833
  // must not draw as long as R15m) is kept by ValueStroke: each segment's
  // length is its share of the value.
  const firstRows  = meetingRows(meetingBreakdown?.first);
  const secondRows = meetingRows(meetingBreakdown?.second);
  const sumOf = rows => rows.reduce((t, r) => t + r.count, 0);

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
            Performance report · {getPeriodLabel(period, referenceDate)} · {meta.region ?? '—'} · {meta.portfolios.length ? meta.portfolios.join(' + ') : 'No portfolio assigned'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <PeriodSelector
            period={period} onPeriodChange={setPeriod}
            referenceDate={referenceDate} onReferenceDateChange={setReferenceDate}
          />
        </div>
      </div>

      {loading && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading…</div>
      )}

      <ValueStroke productsSold={productsSold} signed={kpi.signed} />

      <div style={{ margin: '20px 0 16px' }}>
        <MetricStrip label="Broker performance" items={[
          { key: 'appts', label: 'Appointments', value: kpi.appts.toString() },
          { key: 'signed', label: 'Signed', value: kpi.signed.toString() },
          { key: 'conv', label: 'Conversion ratio', value: kpi.conversion, note: 'Signed per appointment' },
          { key: 'value', label: 'Policy value', value: `R${kpi.policyValue.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
          { key: 'switches', label: 'Broker switches', value: kpi.switches.toString() },
          { key: 'won', label: 'Avg days to close (won)', value: avgDaysToClose.won === null ? '—' : `${avgDaysToClose.won.toFixed(1)} days` },
          { key: 'lost', label: 'Avg days to close (lost)', value: avgDaysToClose.lost === null ? '—' : `${avgDaysToClose.lost.toFixed(1)} days` },
        ]} />
      </div>

      {/* Meeting Outcome Summary — same counts, drawn (meetingBreakdown,
          added 27 Sep 2026 beside the unchanged meetingSummary strings).
          Its old last row, "Signed (of all appointments)", is the Signed and
          Conversion figures above, so it isn't repeated here. */}
      <div style={{ marginBottom: '16px' }}>
        <Section title="Meeting outcomes" subtitle="Counts meeting attempts for this period’s appointments — a rescheduled meeting counts once for each attempt.">
          {firstRows.length + secondRows.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--mut)', fontSize: '0.875rem' }}>No meetings recorded for this period’s appointments yet.</p>
          ) : (
            <div className="mbv-pair">
              {[['First meetings', firstRows], ['Second meetings', secondRows]].map(([title, rows]) => (
                <div key={title} className="mbv-subpanel">
                  <div>
                    <h4 className="mbv-subpanel-title">{title}</h4>
                    <p className="mbv-subpanel-note">{sumOf(rows)} {sumOf(rows) === 1 ? 'attempt' : 'attempts'}</p>
                  </div>
                  {rows.length > 0
                    ? <ReasonRows label={title} rows={rows} total={sumOf(rows)} colour="var(--pl-won)" />
                    : <p className="mbv-subpanel-note">None yet.</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
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
