/**
 * pages/AgentDetail.jsx
 * Detailed performance view for a single agent.
 * Reached from Reports → Agent Activity → View.
 *
 * REWIRED TO REAL DATA 23 Jul 2026 — previously entirely mock (hardcoded
 * AGENT_META/AGENT_KPI keyed by 4 fake IDs: tm/nv/kp/bn). Backend:
 *   GET /api/reports/agent/:id?period=Monthly|Quarterly|Yearly
 * See api-lib/services/reportService.js's getAgentDetailReport() for the
 * full design writeup. One gap resolved the same way as Reports.jsx's own
 * "Uncontactable" KPI (§42): the mock's "Uncontactable" metric had no
 * backing data anywhere. Replaced with "No Answer" — a real
 * CallAttempt.outcome value, thematically the closest real thing to what
 * "Uncontactable" was gesturing at, not an invented substitute.
 *
 * The agent is identified by the :id URL param (a real User.id now, not a
 * mock key like 'tm').
 */

import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch } from '../hooks/useFetch.js';
import { reportsApi } from '../services/api.js';
import { PeriodSelector, getPeriodLabel, referenceDateToParam, paramToReferenceDate } from '../components/PeriodSelector.jsx';

const STATUS_COLOUR = {
  Unassigned:            { bg: 'var(--panel2)', colour: 'var(--mut)' },
  Assigned:              { bg: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))', colour: '#1d4ed8' },
  InProgress:            { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', colour: '#d97706' },
  AppointmentScheduled:  { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', colour: '#a78bfa' },
  Closed:                { bg: 'var(--panel2)', colour: 'var(--mut)' },
};
const OUTCOME_COLOUR = {
  AppointmentScheduled: { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', colour: '#a78bfa' },
  CallbackRequested:    { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', colour: '#d97706' },
  ClientContacted:      { bg: 'color-mix(in srgb, #15803d 14%, var(--panel))', colour: '#15803d' },
  Voicemail:            { bg: 'var(--panel2)', colour: 'var(--mut)' },
  NoAnswer:              { bg: 'var(--panel2)', colour: 'var(--mut)' },
  NotInterested:         { bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))', colour: '#dc2626' },
  WrongNumber:           { bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))', colour: '#dc2626' },
};
const OUTCOME_LABEL = {
  AppointmentScheduled: 'Appointment Scheduled', CallbackRequested: 'Callback Requested',
  ClientContacted: 'Client Contacted', Voicemail: 'Voicemail', NoAnswer: 'No Answer',
  NotInterested: 'Not Interested', WrongNumber: 'Wrong Number',
};

const CALL_OUTCOME_COLOURS = {
  'No Answer': 'var(--mut)', 'Voicemail': 'var(--mut)', 'Client Contacted': '#15803d',
  'Callback Requested': '#f59e0b', 'Appointment Booked': '#8b5cf6',
  'Not Interested': '#ef4444', 'Wrong Number': '#fca5a5',
};

export default function AgentDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { role }   = useRole();
  const { isMobile } = useWindowSize();

  // §107 — same fix as BrokerDetail.jsx; see that file's comment for the
  // full reasoning. Kept identical deliberately rather than factored into
  // a shared hook — two three-line blocks was judged not worth a new
  // shared file for, but if a third detail page needs this, that's the
  // trigger to extract one.
  const [searchParams] = useSearchParams();
  const validPeriod = ['Monthly', 'Quarterly', 'Yearly'].includes(searchParams.get('period'));
  const [period, setPeriod] = useState(() => validPeriod ? searchParams.get('period') : 'Monthly');
  const [referenceDate, setReferenceDate] = useState(() => paramToReferenceDate(searchParams.get('ref')));
  const refParam = referenceDateToParam(referenceDate);

  // Self-service roles land here directly and have no Reports overview to return
  // to, so the back link is hidden for them. Management/Supervisors arrived from
  // the overview and keep it.
  const showBackToReports = role !== 'Agent' && role !== 'Broker';

  const { data, loading, error } = useFetch(() => reportsApi.agentDetail(id, period, refParam), [id, period, refParam]);

  if (loading) {
    return <div style={{ padding: isMobile ? '12px' : '24px' }}><p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>Loading…</p></div>;
  }
  if (error) {
    return (
      <div style={{ padding: isMobile ? '12px' : '24px' }}>
        {showBackToReports && <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>}
        <div style={{ ...s.errorBox, marginTop: '12px' }}>
          Could not load this agent's report. {error.message ?? 'An unexpected error occurred.'}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: isMobile ? '12px' : '24px' }}>
        {showBackToReports && <button style={s.backBtn} onClick={() => navigate('/reports')}>← Back to Reports</button>}
        <p style={{ color: 'var(--mut)', fontSize: '0.875rem', marginTop: '12px' }}>Agent not found.</p>
      </div>
    );
  }

  const { meta, kpi, callOutcomes, activity, recentLeads, avgDaysToClose } = data;
  // FIXED 13 Aug 2026 (Mark caught it via a live testing screenshot) —
  // was Math.max(...activity.map(d => d.calls), 1), entirely ignoring
  // d.booked. Whenever a week's appointments-booked count exceeded its
  // calls-made count (e.g. 2 booked, 1 call — perfectly normal, an agent
  // can book a second appointment on an existing lead without a fresh
  // call that same week), the green bar's height computed to well over
  // 100% of its 120px container and rendered right through the card
  // title above it, since nothing clips overflow on the bar's parent.
  const maxActivity = Math.max(...activity.flatMap(d => [d.calls, d.booked]), 1);

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

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

      {/* KPIs */}
      {/* §148 (13 Aug 2026) — grid changed from a fixed repeat(5, 1fr) to
          auto-fit/minmax so the two new Avg Days to Close cards (Mark's
          request) wrap onto a second row on narrower screens instead of
          cramming 7 columns into the same width the original 5 had. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Leads assigned',    value: kpi.leads.toLocaleString(),    colour: 'var(--ink)' },
          { label: 'Calls made',        value: kpi.calls.toLocaleString(),    colour: 'var(--ink)' },
          { label: 'Appts booked',      value: kpi.appts.toString(),          colour: '#7c3aed', sub: `${kpi.conversion} booking rate` },
          { label: 'Callbacks pending', value: kpi.callbacks.toString(),      colour: '#d97706' },
          { label: 'No answer',         value: kpi.noAnswer.toString(),       colour: '#ef4444' },
          // §148 — new, Mark's explicit request. null (no deals of that
          // outcome closed this period) shown as an em dash, not "0 days".
          { label: 'Avg days to close (Won)',  value: avgDaysToClose.won  === null ? '—' : `${avgDaysToClose.won.toFixed(1)}`,  colour: '#15803d', sub: avgDaysToClose.won === null ? undefined : 'days' },
          { label: 'Avg days to close (Lost)', value: avgDaysToClose.lost === null ? '—' : `${avgDaysToClose.lost.toFixed(1)}`, colour: '#ef4444', sub: avgDaysToClose.lost === null ? undefined : 'days' },
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
          {callOutcomes.length === 0 && <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>No calls logged this period.</p>}
          {callOutcomes.map(o => (
            <div key={o.label} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.8125rem', color:'var(--ink)' }}>{o.label}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {o.count} <span style={{ color:'var(--mut)', fontWeight: 400 }}>({o.pct}%)</span>
                </span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, background: CALL_OUTCOME_COLOURS[o.label] ?? 'var(--mut)', width: `${o.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Activity chart */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            {period === 'Monthly' ? 'Weekly Call Activity — This Month' : `Call Activity — ${period}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: activity.length > 6 ? '4px' : '10px', height: '150px', paddingTop: '12px' }}>
            {activity.map((w, i) => {
              const isFuture = w.calls === 0 && w.booked === 0;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '4px' }}>
                  <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px' }}>
                    <div style={{ flex: 1, background: isFuture ? 'var(--panel2)' : 'color-mix(in srgb, var(--accent) 40%, var(--panel))', borderRadius: '3px 3px 0 0', height: isFuture ? '4px' : `${Math.max(4, (w.calls / maxActivity) * 100)}%`, transition: 'height 0.3s' }} />
                    <div style={{ flex: 1, background: isFuture ? 'var(--panel2)' : '#10b981', borderRadius: '3px 3px 0 0', height: isFuture ? '4px' : `${Math.max(w.booked > 0 ? 4 : 0, (w.booked / maxActivity) * 100)}%`, transition: 'height 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '0.625rem', color: 'var(--mut)' }}>{w.label}</span>
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
        {recentLeads.length === 0 ? (
          <p style={{ padding: '16px', color: 'var(--mut)', fontSize: '0.875rem' }}>No leads assigned yet.</p>
        ) : (
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              {['Lead','Source','Status','Last Call','Outcome',''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentLeads.map(lead => {
              const sc = STATUS_COLOUR[lead.status]   ?? { bg: 'var(--panel2)', colour: 'var(--mut)' };
              const oc = OUTCOME_COLOUR[lead.lastOutcome] ?? { bg: 'var(--panel2)', colour: 'var(--mut)' };
              return (
                <tr key={lead.leadId} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{lead.name}</td>
                  <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>{lead.source ?? '—'}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.colour, fontSize: '0.6875rem' }}>{lead.status}</span>
                  </td>
                  <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>
                    {lead.lastCallTime ? new Date(lead.lastCallTime).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                  <td style={s.td}>
                    {lead.lastOutcome
                      ? <span style={{ ...s.badge, background: oc.bg, color: oc.colour, fontSize: '0.6875rem' }}>{OUTCOME_LABEL[lead.lastOutcome] ?? lead.lastOutcome}</span>
                      : <span style={{ color: 'var(--mut)', fontSize: '0.75rem' }}>—</span>}
                  </td>
                  <td style={s.td}>
                    <button style={s.linkBtn} onClick={() => navigate(`/leads/${lead.leadId}`)}>View →</button>
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
