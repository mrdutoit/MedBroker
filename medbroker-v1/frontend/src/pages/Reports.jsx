/**
 * pages/Reports.jsx
 *
 * REBUILT FROM THE GROUND UP 14 Aug 2026 (§156 external brief, §162 build).
 * §151/§155's donut-and-bar layout is gone entirely — Mark rejected it
 * outright (six donut charts across four reports, several pairing a volume
 * donut with a conversion bar for the SAME categories, a 100%-width bar
 * rendering for a single-appointment dataset, zero narrative layer, every
 * metric equal visual weight). Full diagnosis and the brief itself live in
 * Status_Vercel.md §156; the honest "what §158 did and didn't fix" account
 * of the pushback that led here lives in §161.
 *
 * STRUCTURE follows the brief's own priority order: toolbar (broker/
 * portfolio/source filters, §163) -> executive summary (6 KPIs, period-
 * over-period deltas) -> primary trend (multi-series, toggleable) ->
 * pipeline health (stage-to-stage conversion, not just bucket counts) ->
 * Broker/Agent performance tables -> Lead Source and Portfolio
 * performance (TABLES, not donuts) -> Policy Value (real prominence, not
 * a KPI card) -> Won vs Lost (with loss reasons, §163) -> Appointment
 * Analysis -> generated insights.
 *
 * NOT IN THIS DELIVERY, flagged explicitly rather than left for Mark to
 * find (see §162 for the initial build, §163 for what got added on top):
 *   - Appointment Analysis' cancelled/missed breakdown — DELIBERATELY
 *     not built even after Mark asked for all three originally-flagged
 *     gaps (toolbar filters and loss reasons ARE built, 14 Aug 2026,
 *     §163). This one is different: it isn't just missing data, it's a
 *     real architectural conflict with §138 (the Meeting/Appointment
 *     attempt-history redesign — still the TOP PRIORITY queued item,
 *     fully specced, zero code written), which will define exactly where
 *     a "missed"/"cancelled" concept belongs. Building it now risked
 *     either throwaway work or a second status model for that redesign
 *     to reconcile with later.
 *
 * Backend: GET /api/reports/dashboard (reportService.getDashboardData) for
 * everything above; GET /api/reports/brokers, /agents, and
 * /closed-won-by-product are REUSED unchanged (§162's own reuse-over-
 * rebuild accounting) for the Broker/Agent tables and the product mix
 * under Policy Value. getDashboardData() itself gained a scope + filters
 * parameter 14 Aug 2026 (§163) — Supervisor scoping and the toolbar's
 * three filters both thread through every internal query now, not just
 * the top-level totals.
 *
 * Self-view (Agent/Broker) is deliberately NOT rebuilt to this same
 * structure — the brief's whole frame ("how is my BROKERAGE performing")
 * is an org-wide question; an individual's own four KPI cards from before
 * are kept, since a personal Pipeline Health or Lead Source breakdown
 * doesn't mean anything at that scope.
 *
 * SCOPE, built 14 Aug 2026 (§163): Supervisor sees only their own direct
 * reports' leads/appointments across every section of this dashboard
 * (Pipeline Health, Trend, Lead Source, Portfolio Performance, Won vs
 * Lost, Appointment Analysis all scope down) — Admin/GlobalAdmin still
 * see the full org. Broker Performance deliberately STAYS org-wide for
 * Supervisor too, matching that table's own long-standing, separately-
 * fetched behaviour (getBrokerReport never scoped Supervisor by broker,
 * only by self — not a new inconsistency introduced here, an existing
 * one this rebuild chose not to silently change).
 */

import { useState }     from 'react';
import { useNavigate }  from 'react-router';
import { useRole }       from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch }      from '../hooks/useFetch.js';
import { reportsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';
import { PeriodSelector, getPeriodLabel, referenceDateToParam } from '../components/PeriodSelector.jsx';
import {
  TrendChart, DataTable, EmptyState, Section,
  fmt, fmtDays, fmtRatio,
} from '../components/ReportsWidgets.jsx';
// 27 Sep 2026 — every metric row on this page (Executive summary, Policy
// value, Won vs Lost, Appointment analysis, and the Agent/Broker self-
// view) is now one MetricStrip instead of a grid of identical KpiCards.
// Same values, same deltas; see MetricStrip.jsx's header.
import MetricStrip, { fmtMetric } from '../components/viz/MetricStrip.jsx';
// 27 Sep 2026 (later) — Won vs Lost and Appointment Analysis rebuilt from
// the approved canvas mock-up: the breakdown rings (DonutBreakdown /
// BreakdownRing, and the page-local WonLostPair) are replaced by these.
import OutcomeFlow from '../components/viz/OutcomeFlow.jsx';
import PortfolioSplit from '../components/viz/PortfolioSplit.jsx';
import ReasonRows from '../components/viz/ReasonRows.jsx';
import SplitFigures from '../components/viz/SplitFigures.jsx';
// Replaces PipelineHealth — app-design-pass skill, Reports page pilot
// (designed 24 Sep 2026, delivered 27 Sep 2026). See PipelineJourney.jsx's
// header for the concept and the data-semantics decisions.
import PipelineJourney from '../components/viz/PipelineJourney.jsx';
import { MEETING_TYPE_LABELS } from '../constants/appointmentOptions.js';

// 14 Aug 2026 (§163) — matches AppointmentDetail.jsx's lostReason dropdown
// labels exactly (kept as a second copy deliberately, not imported across
// page files — these are presentation labels, not shared business logic).
const LOST_REASON_LABELS = {
  PriceTooHigh: 'Price too high',
  ChoseCompetitor: 'Chose a competitor',
  NoLongerInterested: 'No longer interested',
  Uncontactable: 'Uncontactable',
  NotEligible: 'Not eligible',
  Other: 'Other',
  // 24 Aug 2026 (migration 038) — written only by appointmentService.
  // closeOpenAppointmentsForErasure() (POPIA erasure/restriction), never
  // selectable from the "Reason for loss" dropdown itself. Included as
  // its own line here on Mark's explicit decision, 24 Aug 2026: these
  // DO count as genuine Lost appointments throughout Reports — this
  // label is what stops them silently reading as 'ConsentWithdrawn'
  // (the raw enum value) in the Loss Reason breakdown.
  ConsentWithdrawn: 'Consent withdrawn (POPIA)',
  'Not captured': 'Not captured',
};

// 15 Aug 2026 (§172) — matches AppointmentDetail.jsx's cancelReason
// dropdown labels exactly, same second-copy-not-shared-import reasoning
// as LOST_REASON_LABELS immediately above. Note: 'NoLongerInterested'
// is a real, separate category value here from lostReason's own
// identically-named one above — same label text, different field
// (Appointment.lostReason vs MeetingAttempt.cancelReason), not a typo.
//
// SchedulingConflict/FoundAlternative SHORTENED here, 16 Aug 2026
// (§189) — Mark, directly: "the Cancellation Reason label for
// Scheduling conflict shortened. It's way too long and makes the graph
// difficult to read." Deliberately NOT changed to match in
// AppointmentDetail.jsx's own copy of these same two labels (its own
// dropdown, line ~102-103) — that's a full-width <select>, plenty of
// room, and the extra context (", wants to rebook" / "broker/solution")
// genuinely helps whoever's choosing the right reason while recording
// an outcome. The readability problem is specific to this file's own
// narrow donut-legend column, not the underlying category names
// themselves — shortened only where the actual constraint is.
const CANCEL_REASON_LABELS = {
  NoLongerInterested: 'No longer interested',
  FoundAlternative: 'Found an alternative',
  SchedulingConflict: 'Scheduling conflict',
  Uncontactable: 'Uncontactable',
  Other: 'Other',
  'Not captured': 'Not captured',
};

// WonLostPair (16 Aug 2026, §180-§188) — REMOVED 27 Sep 2026. It paired a
// Won ring and a Lost ring per dimension; region now lives in OutcomeFlow
// and portfolio in PortfolioSplit (components/viz/). The §186/§188 lesson
// it recorded still holds and is kept by both: show a breakdown whenever
// there's any data, even a single category — never hide real data for
// lack of variety.

export default function Reports() {
  const navigate           = useNavigate();
  const { role, portfolios: allPortfolios } = useRole();
  const { isMobile }       = useWindowSize();
  const [period, setPeriod] = useState('Monthly');
  const [referenceDate, setReferenceDate] = useState(undefined);
  const refParam = referenceDateToParam(referenceDate);

  // 14 Aug 2026 (§163) — toolbar filters, org view only (self-view has no
  // use for them). Cleared automatically on period change would be
  // surprising (the whole point is comparing the same slice across
  // periods) — deliberately NOT reset when period/referenceDate change.
  const [filterBrokerId, setFilterBrokerId]   = useState('');
  const [filterPortfolio, setFilterPortfolio] = useState('');
  const [filterSource, setFilterSource]       = useState('');
  const hasActiveFilters = !!(filterBrokerId || filterPortfolio || filterSource);
  function clearFilters() { setFilterBrokerId(''); setFilterPortfolio(''); setFilterSource(''); }

  // §107 — carries the currently-selected period across to BrokerDetail/
  // AgentDetail's own View link, which otherwise silently resets to "this
  // month" on arrival.
  const detailLinkQuery = `?period=${period}${refParam ? `&ref=${refParam}` : ''}`;

  const isAgentView  = role === 'Agent';
  const isBrokerView = role === 'Broker';
  const selfView     = isAgentView || isBrokerView;

  // Dashboard + product-mix calls are org-wide data self-view users never
  // render — skipped for them rather than fetched and discarded (an
  // immediately-resolved null, not a real network call).
  const dashboardFilters = { brokerId: filterBrokerId || undefined, portfolio: filterPortfolio || undefined, source: filterSource || undefined };
  const { data: dashboardData, loading: dashboardLoading, error: dashboardError } =
    useFetch(() => selfView ? Promise.resolve(null) : reportsApi.dashboard(period, refParam, dashboardFilters), [period, refParam, selfView, filterBrokerId, filterPortfolio, filterSource]);
  const { data: brokersData, loading: brokersLoading, error: brokersError } =
    useFetch(() => reportsApi.brokers(period, refParam), [period, refParam]);
  const { data: agentsData, loading: agentsLoading, error: agentsError } =
    useFetch(() => reportsApi.agents(period, refParam), [period, refParam]);
  const { data: productData, loading: productLoading, error: productError } =
    useFetch(() => selfView ? Promise.resolve(null) : reportsApi.closedWonByProduct(period, refParam), [period, refParam, selfView]);

  const brokers = brokersData?.brokers ?? [];
  const agents  = agentsData?.agents ?? [];
  const closedWonByProduct = productData?.rows ?? [];

  const anyLoading = dashboardLoading || brokersLoading || agentsLoading || productLoading;
  const anyError   = dashboardError ?? brokersError ?? agentsError ?? productError;

  const myAgent  = selfView ? agents[0]  : undefined;
  const myBroker = selfView ? brokers[0] : undefined;

  const selfKpis = isAgentView && myAgent
    ? [
        { label: 'My leads',            value: myAgent.leads.toLocaleString(), sub: 'Assigned to you'      },
        { label: 'Calls made',          value: myAgent.calls.toLocaleString(), sub: 'Outbound calls'       },
        { label: 'Appointments booked', value: myAgent.appts.toString(),       sub: 'From your leads'      },
        { label: 'Bookings Ratio',      value: myAgent.conversion,             sub: 'Appts booked / leads' },
      ]
    : isBrokerView && myBroker
    ? [
        { label: 'My appointments', value: myBroker.appts.toString(),  sub: 'Allocated to you'  },
        { label: 'Signed',          value: myBroker.signed.toString(), sub: `${myBroker.appts === 0 ? '0.0' : (myBroker.signed / myBroker.appts).toFixed(1)} signed / appts` },
        { label: 'Conversion Ratio', value: myBroker.appts === 0 ? '0.0' : (myBroker.signed / myBroker.appts).toFixed(1), sub: 'Signed / appointments' },
        { label: 'My policy value', value: fmt(myBroker.policyValue),  sub: 'Products sold this period' },
      ]
    : [];
  const noSelfData = selfView && !anyLoading && selfKpis.length === 0;

  const dash = dashboardData ?? {};
  const kpis          = dash.kpis ?? [];
  const trend         = dash.trend ?? [];
  const pipeline      = dash.pipeline?.stages ?? [];
  const stageConversion = dash.pipeline?.stageConversion ?? [];
  const sourceTable    = dash.sourceTable ?? [];
  const portfolioTable = dash.portfolioTable ?? [];
  const policyValueBreakdown = dash.policyValueBreakdown ?? null;
  const wonVsLost      = dash.wonVsLost ?? null;
  const appointmentAnalysis = dash.appointmentAnalysis ?? null;
  const insights       = dash.insights ?? [];

  // 14 Aug 2026 — Mark's request: the old inline 🏆 in the Broker name
  // column ("skews the text" — only the top row got the extra glyph,
  // making that one cell visually wider/misaligned against every other
  // row). Replaced with a dedicated "#" column, gold/silver/bronze for
  // the top 3. Rank is computed from a FIXED metric (policyValue for
  // Broker, appts for Agent — Mark's own instruction), independent of
  // whatever column the table is currently sorted by — DataTable sorts
  // a local copy internally (`[...rows].sort(...)`), never the row
  // objects themselves, so a rank attached here travels correctly with
  // each row no matter how the visible order changes. Rows at 0 (no
  // sales / no appointments) get no rank at all — a gold medal for zero
  // of anything would be misleading, not celebratory; matches the old
  // topPerformer logic's own `> 0` guard. Ties broken by original array
  // order only — this is cosmetic ranking (Mark's own words, "probably
  // more aesthetics than anything"), not a scored leaderboard that
  // needs exact tie-break rules.
  function withRank(rows, metricKey) {
    const ranked = [...rows]
      .filter(r => (Number(r[metricKey]) || 0) > 0)
      .sort((a, b) => (Number(b[metricKey]) || 0) - (Number(a[metricKey]) || 0));
    const rankById = new Map(ranked.map((r, i) => [r.id, i + 1]));
    return rows.map(r => ({ ...r, rank: rankById.get(r.id) ?? null }));
  }
  function RankCell({ rank }) {
    if (!rank) return <span style={{ color: 'var(--mut)' }}>—</span>;
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[rank];
    return medal ? <span title={`#${rank}`}>{medal}</span> : <span>{rank}</span>;
  }
  const rankColumn = { key: 'rank', label: '#', align: 'center', sortable: false, render: r => <RankCell rank={r.rank} /> };

  const brokerColumns = [
    rankColumn,
    { key: 'name',         label: 'Broker', sortable: false },
    { key: 'appts',        label: 'Appointments', align: 'right' },
    { key: 'signed',       label: 'Signed',       align: 'right' },
    { key: 'policyValue',  label: 'Policy Value', align: 'right', render: r => fmt(r.policyValue) },
    { key: 'conversion',   label: 'Conversion Ratio', align: 'right', render: r => (r.appts === 0 ? '0.0' : (r.signed / r.appts).toFixed(1)) },
  ];
  const brokerRows = withRank(
    brokers.map(b => ({ ...b, id: b.id, conversion: b.appts === 0 ? 0 : b.signed / b.appts })),
    'policyValue'
  );

  const agentColumns = [
    rankColumn,
    { key: 'name',    label: 'Agent', sortable: false },
    { key: 'leads',   label: 'Leads',   align: 'right' },
    { key: 'calls',   label: 'Calls',   align: 'right' },
    { key: 'appts',   label: 'Appts Booked', align: 'right' },
    { key: 'conversion', label: 'Bookings Ratio', align: 'right' },
  ];
  const agentRows = withRank(agents, 'appts');

  const sourceColumns = [
    { key: 'source',      label: 'Source', sortable: false },
    { key: 'leads',       label: 'Leads',        align: 'right' },
    { key: 'appointments',label: 'Appointments', align: 'right' },
    { key: 'closedWon',   label: 'Won',          align: 'right' },
    { key: 'conversion',  label: 'Conversion Ratio', align: 'right' },
    { key: 'policyValue', label: 'Policy Value', align: 'right', render: r => fmt(r.policyValue) },
  ];

  const portfolioColumns = [
    { key: 'portfolio',   label: 'Portfolio', sortable: false },
    { key: 'booked',      label: 'Appointments', align: 'right' },
    { key: 'closedWon',   label: 'Won',  align: 'right' },
    { key: 'closedLost',  label: 'Lost', align: 'right' },
    { key: 'conversion',  label: 'Conversion Ratio', align: 'right' },
    { key: 'avgPolicyValueWon', label: 'Avg Policy Value (Won)', align: 'right', render: r => r.avgPolicyValueWon === null ? '—' : fmt(r.avgPolicyValueWon) },
  ];

  const productColumns = [
    { key: 'product', label: 'Product', sortable: false },
    { key: 'count',   label: 'Sold', align: 'right' },
    { key: 'totalValue', label: 'Value', align: 'right', render: r => fmt(r.totalValue) },
  ];

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>

      {/* ── Header + period selector ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={s.pageTitle}>Reports</h1>
          <p style={s.pageSubtitle}>
            {selfView ? `Your performance · ${getPeriodLabel(period, referenceDate)}` : getPeriodLabel(period, referenceDate)}
          </p>
        </div>
        <PeriodSelector
          period={period} onPeriodChange={setPeriod}
          referenceDate={referenceDate} onReferenceDateChange={setReferenceDate}
        />
      </div>

      {anyLoading && <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading report data…</div>}
      {anyError && (
        <div style={{ ...s.errorBox, marginBottom: '14px' }}>
          Could not load some report data: {anyError.message ?? 'An unexpected error occurred.'}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SELF VIEW — Agent/Broker. Deliberately not rebuilt to the full
          brief structure — see this file's own header note for why.
          ══════════════════════════════════════════════════════════════ */}
      {selfView && (
        noSelfData ? (
          <div style={{ ...s.card, color: colors.ink500, fontSize: '0.875rem' }}>No reporting data for your account in this period.</div>
        ) : (
          <MetricStrip label="Your performance this period" items={selfKpis.map(c => ({ key: c.label, label: c.label, value: c.value, note: c.sub }))} />
        )
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ORG VIEW — Admin/GlobalAdmin/Supervisor. The full §156 rebuild.
          ══════════════════════════════════════════════════════════════ */}
      {!selfView && !anyLoading && (
        <>
          {/* ── 1. Toolbar — 14 Aug 2026 (§163). Broker options come from
              the already-fetched `brokers` list (no extra request);
              Portfolio from useRole()'s existing portfolio list; Source is
              a fixed set matching the four origin categories this app
              actually has (originExprFor() in reportService.js). Filters
              persist across period changes deliberately — comparing the
              same filtered slice across periods is the more common intent
              than resetting on every navigation. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '16px', padding: '12px 14px', background: colors.surfaceSubtle, borderRadius: '8px' }}>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.6875rem' }}>Broker</label>
              <select value={filterBrokerId} onChange={e => setFilterBrokerId(e.target.value)} style={{ ...s.formInput, minWidth: '160px' }}>
                <option value="">All brokers</option>
                {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.6875rem' }}>Portfolio</label>
              <select value={filterPortfolio} onChange={e => setFilterPortfolio(e.target.value)} style={{ ...s.formInput, minWidth: '160px' }}>
                <option value="">All portfolios</option>
                {allPortfolios.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.6875rem' }}>Source</label>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ ...s.formInput, minWidth: '160px' }}>
                <option value="">All sources</option>
                <option value="Manual">Manual</option>
                <option value="Import">Import</option>
                <option value="Medical Subscription">Medical Subscription</option>
                <option value="Event">Event</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ ...s.secondaryBtn, height: '34px', fontSize: '0.8125rem' }}>Clear filters</button>
            )}
          </div>

          {/* ── 2. Pipeline Journey — the page hero (app-design-pass skill).
              Moved here from its old position after the trend chart (the
              former "Pipeline Health" section): one signature panel per
              page, answering "where are leads getting stuck" at a glance.
              Same stages/stageConversion data, wired identically — only
              the visual treatment and its position changed. */}
          <PipelineJourney stages={pipeline} stageConversion={stageConversion} isMobile={isMobile} />

          {/* ── 3. Executive summary ─────────────────────────────────────── */}
          <div style={{ marginTop: '20px', marginBottom: '16px' }}>
            <MetricStrip
              label="Executive summary"
              items={kpis.map(k => {
                // Only KPIs with a matching series in `trend` get a
                // sparkline (conversion/avgDaysToCloseWon have no
                // per-bucket trend data) — unchanged from KpiCard.
                const sparklineKey = { leads: 'leads', appts: 'appts', closedWon: 'won', policyValue: 'policyValue' }[k.key];
                return {
                  key: k.key, label: k.label, value: fmtMetric(['count', 'currency', undefined].includes(k.format) ? (k.current ?? 0) : k.current, k.format),
                  deltaPct: k.deltaPct, direction: k.direction, lowerIsBetter: k.lowerIsBetter, showNoPrior: true,
                  spark: sparklineKey ? trend.map(t => ({ label: t.label, value: t[sparklineKey] ?? 0, future: t.future })) : undefined,
                  sparkFormat: k.format,
                };
              })}
            />
          </div>

          {/* ── 4. Primary trend ─────────────────────────────────────────── */}
          <Section title="Trend" subtitle="Leads, appointments, outcomes and policy value over the period. Select a series below to show or hide it; hover or use the arrow keys to read any period.">
            <TrendChart data={trend} isMobile={isMobile} />
          </Section>

          {/* ── 5. Broker / Agent performance ────────────────────────────── */}
          {/* 16 Aug 2026 — Mark's request: the side-by-side grid squeezed
              both tables into half-width each, and Conversion Ratio/
              Bookings Ratio's own column headers (wider than their
              values) were eating space the Broker/Agent name column
              actually needed, especially for longer names (e.g. "William
              Barclay-Beuthin" wrapping awkwardly). Stacked full-width
              instead — each table gets the whole row's width, no shared
              grid to fight over. Section's own marginBottom already
              spaces them apart, so no extra wrapper needed here. */}
          <Section title="Broker Performance">
            <DataTable
              columns={brokerColumns} rows={brokerRows} defaultSortKey="policyValue" highlightKey="policyValue"
              onRowClick={r => navigate(`/reports/broker/${r.id}${detailLinkQuery}`)}
              emptyMessage="No broker activity this period."
            />
          </Section>
          <Section title="Agent Activity">
            <DataTable
              columns={agentColumns} rows={agentRows} defaultSortKey="appts" highlightKey="appts"
              onRowClick={r => navigate(`/reports/agent/${r.id}${detailLinkQuery}`)}
              emptyMessage="No agent activity this period."
            />
          </Section>

          {/* ── 6. Lead Source analysis ──────────────────────────────────── */}
          <Section title="Lead Source Analysis" subtitle="Volume and outcome by where the lead came from.">
            <DataTable columns={sourceColumns} rows={sourceTable} defaultSortKey="leads" highlightKey="leads" emptyMessage="No leads this period." />
          </Section>

          {/* ── 7. Portfolio performance ─────────────────────────────────── */}
          <Section title="Portfolio Performance">
            <DataTable columns={portfolioColumns} rows={portfolioTable} defaultSortKey="booked" highlightKey="booked" emptyMessage="No appointments this period." />
          </Section>

          {/* ── 8. Policy value ──────────────────────────────────────────── */}
          <Section title="Policy Value" subtitle="What this period's closed deals were worth.">
            {policyValueBreakdown && policyValueBreakdown.total > 0 ? (
              <>
                <div style={{ marginBottom: '18px' }}>
                  <MetricStrip label="Policy value" items={[
                    { key: 'total', label: 'Total', value: fmt(policyValueBreakdown.total) },
                    { key: 'deal',  label: 'Avg per deal', value: policyValueBreakdown.avgPerDeal === null ? '—' : fmt(policyValueBreakdown.avgPerDeal) },
                    { key: 'appt',  label: 'Per appointment', value: policyValueBreakdown.perAppointment === null ? '—' : fmt(policyValueBreakdown.perAppointment) },
                    { key: 'lead',  label: 'Per lead', value: policyValueBreakdown.perLead === null ? '—' : fmt(policyValueBreakdown.perLead) },
                  ]} />
                </div>
                {closedWonByProduct.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.ink500, marginBottom: '8px' }}>By product</div>
                    <DataTable columns={productColumns} rows={closedWonByProduct} defaultSortKey="totalValue" highlightKey="totalValue" />
                  </>
                )}
              </>
            ) : (
              <EmptyState message="No policy value recorded this period." />
            )}
          </Section>

          {/* ── 9. Won vs Lost ───────────────────────────────────────────── */}
          <Section title="Won vs Lost" subtitle="This period only — these figures don't yet have a comparison with the previous period.">
            {wonVsLost && (wonVsLost.won + wonVsLost.lost) > 0 ? (
              <>
                {/* 18 Aug 2026 — Mark's request: this row was four bare
                    numbers with no card treatment at all, unlike
                    Appointment Analysis' identically-shaped row just
                    below in this same file (§172's own KpiCard switch).
                    Same component, same reasoning: no period-over-period
                    delta computed for these four either, so KpiCard's
                    existing "No prior-period data" fallback covers that
                    honestly. Win Rate keeps the same null-safe "—" via
                    fmtPct (format="percent") rather than the manual
                    ternary this row used to have — one less bespoke
                    null check, same behaviour. Avg Days is the one
                    genuinely compound value on this whole page (two
                    fmtDays() results, not one) — see KpiCard's own
                    customValue comment for why that needed a real prop
                    rather than a fmtDays()-as-string workaround. */}
                {/* 27 Sep 2026 — MetricStrip replaces the four KpiCards. The
                    honest "no prior-period comparison" note moved from
                    each card (four identical lines) to the Section
                    subtitle — said once, still said. */}
                <MetricStrip label="Won vs lost" items={[
                  { key: 'won',  label: 'Won',  value: fmtMetric(wonVsLost.won) },
                  { key: 'lost', label: 'Lost', value: fmtMetric(wonVsLost.lost) },
                  { key: 'rate', label: 'Win rate', value: fmtMetric(wonVsLost.winRate, 'percent') },
                  { key: 'days', label: 'Avg days to close (won / lost)', value: `${fmtDays(wonVsLost.avgDaysToCloseWon)} / ${fmtDays(wonVsLost.avgDaysToCloseLost)}` },
                ]} />
                {/* 27 Sep 2026 (later) — the six rings that were here (Overall,
                    By Region · Won/Lost, By Portfolio · Won/Lost, Loss
                    reasons) are replaced, from the canvas mock-up Mark
                    approved: OutcomeFlow carries region → outcome → loss
                    reason as one flow (continuing the hero's Won/Lost fork);
                    PortfolioSplit compares won and lost per portfolio. Same
                    API fields, nothing dropped. The §182-§191 layout history
                    (flex rows, centring, equal heights) belonged to the ring
                    cards and is retired with them — see Status_Vercel_Archive.md. */}
                <div className="mbv-pair" style={{ marginTop: '18px' }}>
                  <div className="mbv-subpanel wide">
                    <div>
                      <h4 className="mbv-subpanel-title">Where this period’s closed deals ended</h4>
                      <p className="mbv-subpanel-note">Each band is real deals: from the region they came from, to won or lost, and on to why they were lost.</p>
                    </div>
                    <OutcomeFlow
                      wonByRegion={wonVsLost.wonByRegion}
                      lostByRegion={wonVsLost.lostByRegion}
                      lossReasons={(wonVsLost.lossReasons ?? []).map(r => ({
                        key: r.reason, label: LOST_REASON_LABELS[r.reason] ?? r.reason,
                        count: r.count, notCaptured: r.reason === 'Not captured',
                      }))}
                      policyValue={policyValueBreakdown?.total ?? 0}
                      isMobile={isMobile}
                    />
                    {!wonVsLost.hasLossReasons && wonVsLost.lost > 0 && (
                      <p className="mbv-subpanel-note">No loss reasons captured yet this period — the field exists (marking an appointment Lost prompts for one), but none of this period’s lost appointments have one recorded.</p>
                    )}
                  </div>
                  {((wonVsLost.wonByPortfolio?.length ?? 0) + (wonVsLost.lostByPortfolio?.length ?? 0)) > 0 && (() => {
                    const sumWon  = (wonVsLost.wonByPortfolio ?? []).reduce((t, r) => t + r.count, 0);
                    const sumLost = (wonVsLost.lostByPortfolio ?? []).reduce((t, r) => t + r.count, 0);
                    const overlaps = sumWon > wonVsLost.won || sumLost > wonVsLost.lost;
                    return (
                      <div className="mbv-subpanel">
                        <div>
                          <h4 className="mbv-subpanel-title">By portfolio</h4>
                          <p className="mbv-subpanel-note">
                            {overlaps
                              ? `One deal can cover more than one portfolio, so these add up to more than the ${wonVsLost.won} won and ${wonVsLost.lost} lost.`
                              : 'One deal can cover more than one portfolio; each portfolio is compared on its own.'}
                          </p>
                        </div>
                        <PortfolioSplit won={wonVsLost.wonByPortfolio} lost={wonVsLost.lostByPortfolio} />
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              <EmptyState message="No closed appointments this period." />
            )}
          </Section>

          {/* ── 10. Appointment analysis ──────────────────────────────────── */}
          <Section title="Appointment Analysis" subtitle="This period only — these figures don't yet have a comparison with the previous period.">
            {appointmentAnalysis && appointmentAnalysis.booked > 0 ? (
              <>
                {/* 15 Aug 2026 — Mark's request: this row was five bare
                    numbers with no visual weight at all, unlike every
                    other KPI on this page. Switched to the same KpiCard
                    used in Executive Summary — no period-over-period
                    delta for these five specifically (that needs a
                    prior-period query this section doesn't compute
                    today, a real follow-up if wanted, not silently
                    faked here) — KpiCard's own existing "No prior-period
                    data" fallback covers that honestly rather than
                    showing a delta that isn't real. */}
                <div style={{ marginBottom: '18px' }}>
                  {/* 27 Sep 2026 — MetricStrip replaces the five KpiCards;
                      same values. Cancelled/Missed still count attempts
                      LOGGED this period (reportService.js, §172). */}
                  <MetricStrip label="Appointment analysis" items={[
                    { key: 'booked', label: 'Booked', value: fmtMetric(appointmentAnalysis.booked) },
                    { key: 'per',    label: 'Appointments per lead', value: fmtMetric(appointmentAnalysis.perLead, 'ratio') },
                    { key: 'conv',   label: 'Booked → won', value: fmtMetric(appointmentAnalysis.bookedToWonConversion, 'percent') },
                    { key: 'canc',   label: 'Cancelled', value: fmtMetric(appointmentAnalysis.cancelled) },
                    { key: 'miss',   label: 'Missed / no-show', value: fmtMetric(appointmentAnalysis.missed) },
                  ]} />
                </div>
                {/* 27 Sep 2026 (later) — Meeting Type and Cancellation reasons
                    rings replaced (canvas mock-up, approved): a two-way split
                    reads best as big figures over one bar; reasons as ranked
                    rows. Deliberately NOT a flow like Won vs Lost — Booked
                    counts appointments created this period, Cancelled counts
                    meeting attempts logged this period (reportService.js,
                    §172): two different clocks, never drawn as one flow. */}
                {(appointmentAnalysis.byMeetingType.length > 0 || appointmentAnalysis.cancelled > 0) && (
                  <div className="mbv-pair">
                    {appointmentAnalysis.byMeetingType.length > 0 && (() => {
                      const MEETING_COLOURS = ['var(--accent)', 'var(--pl-booked)', 'var(--limited)'];
                      const parts = appointmentAnalysis.byMeetingType.map((m, i) => ({
                        key: m.meetingType,
                        // Plain language, not the raw enum (27 Sep 2026).
                        label: MEETING_TYPE_LABELS[m.meetingType] ?? m.meetingType, // 1 Oct 2026 — shared labels
                        count: m.booked, colour: MEETING_COLOURS[i % MEETING_COLOURS.length],
                      }));
                      return (
                        <div className="mbv-subpanel">
                          <div>
                            <h4 className="mbv-subpanel-title">Meeting type</h4>
                            <p className="mbv-subpanel-note">Appointments booked this period.</p>
                          </div>
                          <SplitFigures label="Meeting type" parts={parts} total={parts.reduce((t, p) => t + p.count, 0)} />
                        </div>
                      );
                    })()}
                    {appointmentAnalysis.cancelled > 0 && (
                      <div className="mbv-subpanel">
                        <div>
                          <h4 className="mbv-subpanel-title">Why meetings were cancelled</h4>
                          <p className="mbv-subpanel-note">Meetings cancelled this period.</p>
                        </div>
                        {appointmentAnalysis.cancelReasons.length > 0 ? (
                          <ReasonRows
                            label="Why meetings were cancelled"
                            total={appointmentAnalysis.cancelReasons.reduce((t, r) => t + r.count, 0)}
                            rows={[...appointmentAnalysis.cancelReasons]
                              .sort((x, y) => (x.reason === 'Not captured') - (y.reason === 'Not captured') || y.count - x.count)
                              .map(r => ({ key: r.reason, label: CANCEL_REASON_LABELS[r.reason] ?? r.reason, count: r.count, notCaptured: r.reason === 'Not captured' }))}
                          />
                        ) : (
                          <p className="mbv-subpanel-note">No cancellation reasons captured yet this period — the field exists, but none of this period’s cancelled meetings have one recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <EmptyState message="No appointments booked this period." />
            )}
          </Section>

          {/* ── 11. Insights ─────────────────────────────────────────────── */}
          <Section title="Insights" subtitle="Generated from this period's real data only.">
            {insights.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.875rem', color: colors.ink700, lineHeight: 1.8 }}>
                {insights.map((text, i) => <li key={i}>{text}</li>)}
              </ul>
            ) : (
              <EmptyState message="Not enough data yet this period for a reliable insight." />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
