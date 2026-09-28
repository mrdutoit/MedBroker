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
// 27 Sep 2026 — app-design-pass, Agent Detail: same chart language as
// Reports. CallFlow is the page's signature panel (replacing the Call
// Outcome Breakdown list), MetricStrip replaces the KPI card grid, and the
// weekly activity bars become the shared interactive TrendLines.
import CallFlow from '../components/viz/CallFlow.jsx';
import MetricStrip from '../components/viz/MetricStrip.jsx';
import TrendLines from '../components/viz/TrendLines.jsx';
import { Section } from '../components/ReportsWidgets.jsx';

// Plain language for Lead.status (27 Sep 2026) — the raw enum values
// ("AppointmentScheduled", "InProgress") were on screen in the table.
const STATUS_LABEL = {
  Unassigned: 'Unassigned', Assigned: 'Assigned', InProgress: 'In progress',
  AppointmentScheduled: 'Appointment booked', Closed: 'Closed',
};
const ACTIVITY_SERIES = [
  { key: 'calls',  label: 'Calls made',   colour: 'var(--accent)', scale: 'count' },
  { key: 'booked', label: 'Appointments booked', colour: 'var(--live)', scale: 'count' },
];

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

// CALL_OUTCOME_COLOURS removed 27 Sep 2026 — outcome colours now live in
// components/viz/CallFlow.jsx with the chart that uses them.

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
  // maxActivity (13 Aug 2026 overflow fix) retired with the hand-drawn
  // bars — TrendLines scales to the larger series itself.
  const spark = key => activity.map(w => ({ label: w.label, value: w[key], future: w.future }));

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

      <CallFlow callOutcomes={callOutcomes} isMobile={isMobile} />

      {/* §148's seven figures, unchanged in meaning; one MetricStrip instead
          of a card grid. Avg days: null (nothing of that outcome closed this
          period) stays an em dash, never "0 days". */}
      <div style={{ margin: '20px 0 16px' }}>
        <MetricStrip label="Agent performance" items={[
          { key: 'leads', label: 'Leads assigned', value: kpi.leads.toLocaleString() },
          { key: 'calls', label: 'Calls made', value: kpi.calls.toLocaleString(), spark: spark('calls') },
          { key: 'appts', label: 'Appointments booked', value: kpi.appts.toString(), note: `${kpi.conversion} bookings ratio`, spark: spark('booked') },
          { key: 'callbacks', label: 'Callbacks pending', value: kpi.callbacks.toString() },
          { key: 'noAnswer', label: 'No answer', value: kpi.noAnswer.toString() },
          { key: 'won', label: 'Avg days to close (won)', value: avgDaysToClose.won === null ? '—' : `${avgDaysToClose.won.toFixed(1)} days` },
          { key: 'lost', label: 'Avg days to close (lost)', value: avgDaysToClose.lost === null ? '—' : `${avgDaysToClose.lost.toFixed(1)} days` },
        ]} />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <Section
          title={period === 'Monthly' ? 'Calls and bookings by week' : 'Calls and bookings over the period'}
          subtitle="Hover or use the arrow keys to read any period; select a series below to show or hide it."
        >
          <TrendLines data={activity} isMobile={isMobile} series={ACTIVITY_SERIES} defaultHidden={[]} label="Calls and bookings" />
        </Section>
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
                    <span style={{ ...s.badge, background: sc.bg, color: sc.colour, fontSize: '0.6875rem' }}>{STATUS_LABEL[lead.status] ?? lead.status}</span>
                  </td>
                  <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>
                    {/* 24 Aug 2026 — deliberately left out of this
                        session's app-wide date-format sweep, not an
                        oversight: this is a narrow performance-table
                        column ("last call"), and dropping the year on
                        purpose keeps it readable at that width — the
                        year is rarely informative for a recency signal
                        like this one. lastCallTime is a genuine
                        timestamp (derived from CallLog.attemptedAt,
                        TIMESTAMPTZ), so the mechanism itself isn't a
                        DATE-only/timezone concern the way the sweep's
                        other fixes were. Flagged explicitly rather than
                        left silently different — worth a second look if
                        Mark wants the year here too. */}
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
