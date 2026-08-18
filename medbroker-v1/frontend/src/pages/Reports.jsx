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
  KpiCard, TrendChart, PipelineHealth, DataTable, EmptyState, Section,
  DonutBreakdown, CATEGORICAL_PALETTE,
  fmt, fmtDays, fmtRatio,
} from '../components/ReportsWidgets.jsx';

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

// 16 Aug 2026 (§180) — a Won donut and a Lost donut for the same
// dimension (region, portfolio), side by side under one shared
// sub-heading. Page-local, not exported from ReportsWidgets.jsx — this
// specific "two DonutBreakdowns paired under one label" composition is
// a Won-vs-Lost-section concern, not a generic building block the way
// DonutBreakdown itself is. keyField picks the label off each row
// (r.region or r.portfolio) since the two dimensions don't share a
// common field name. 'Not captured' (region only — every appointment
// has a real portfolio, but region is nullable pre-§166) gets the same
// neutral-grey treatment as loss/cancel reasons elsewhere on this page.
// notCapturedMessage added 16 Aug 2026 (§182) — region-only, since
// that's the one dimension where "not captured" can be the WHOLE
// answer (an org whose closed deals all predate 14 Aug 2026 would see
// nothing else) — DonutBreakdown's own realTotal===0 branch needs a
// message that actually explains that rather than a generic fallback.
//
// REWORKED 16 Aug 2026 (§183) — used to wrap its own pair in a group-
// labelled <div> (its own heading, its own nested flex row). Mark's
// report: "the graphs are not equal heights" — root cause was this
// exact wrapper. The outer Won-vs-Lost row's direct children were
// [Overall-card, By-Region-wrapper, By-Portfolio-wrapper] — THREE
// items, not five — so flexbox's own align-items:stretch (the default)
// equalised those three wrapper heights, but couldn't reach two levels
// deep to equalise the actual donut CARDS inside each wrapper against
// the standalone Overall card, since they were never true siblings of
// it in the DOM. Fixed by returning the pair as a bare fragment of two
// DonutBreakdowns with compound titles ("Region · Won" style) instead
// of a labelled wrapper — every donut in the Won-vs-Lost row is now a
// genuine flex sibling of every other one, so stretch equalises all of
// them correctly, automatically, without hand-tuned heights anywhere.
//
// REWORKED AGAIN 16 Aug 2026 (§186), THEN REVERTED THE SAME DAY (§188)
// — §184 fixed "a full donut ring for one category conveys nothing" by
// replacing the ring with a compact stat. §186 went further: once §185
// corrected Won/Lost to their true counts (a small business, most
// periods will have single-digit deals), a WonLostPair with everything
// concentrated in one region and one portfolio produced four cards
// that each just restated "100% of the 2 wins" a different way — so
// §186 suppressed the whole pair whenever there were fewer than 2
// distinct categories to compare.
//
// §187 then rebuilt DonutBreakdown itself from the ground up — real
// donut with a centre label, full legend with values and percentages
// always visible, real visual weight at any category count, not just
// 2+. That rebuild quietly removed the actual justification for §186's
// suppression: a single-category card isn't decorative or repetitive
// anymore, it's genuinely informative (confirms the data, shows the
// real count, same visual language as every other card on the page).
// Mark noticed the gap immediately — "where are all the other graphs?
// I don't see the per portfolio breakdowns" — and he was right to.
// §186's own reasoning ("nothing to compare, so don't show it") was
// built for a thinner design that no longer exists; keeping it after
// §187 just hid real, working data for no remaining reason. Reverted
// to the simple check that was already here before §186 — show the
// pair whenever there's any data at all, regardless of variety.
function WonLostPair({ label, wonRows, lostRows, keyField, isMobile }) {
  if ((!wonRows || wonRows.length === 0) && (!lostRows || lostRows.length === 0)) return null;
  const toData = rows => rows.map((r, i) => ({
    label: r[keyField], value: r.count,
    colour: r[keyField] === 'Not captured' ? colors.ink400 : CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
  }));
  const notCapturedMsg = keyField === 'region'
    ? "Region wasn't captured for any of these — tracking only started 14 Aug 2026."
    : undefined;
  return (
    <>
      <DonutBreakdown title={`${label} · Won`} isMobile={isMobile} data={toData(wonRows ?? [])} emptyMessage="No wins this period." notCapturedMessage={notCapturedMsg} />
      <DonutBreakdown title={`${label} · Lost`} isMobile={isMobile} data={toData(lostRows ?? [])} emptyMessage="No losses this period." notCapturedMessage={notCapturedMsg} />
    </>
  );
}

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

  // 16 Aug 2026 (§180) — computed once here, used by the two WonLostPair
  // calls in the Won vs Lost section below.
  const wonByRegionPair = wonVsLost ? (
    <WonLostPair label="By Region" wonRows={wonVsLost.wonByRegion} lostRows={wonVsLost.lostByRegion} keyField="region" isMobile={isMobile} />
  ) : null;
  const wonByPortfolioPair = wonVsLost ? (
    <WonLostPair label="By Portfolio" wonRows={wonVsLost.wonByPortfolio} lostRows={wonVsLost.lostByPortfolio} keyField="portfolio" isMobile={isMobile} />
  ) : null;

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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${selfKpis.length}, 1fr)`, gap: '12px' }}>
            {selfKpis.map(c => (
              <div key={c.label} style={s.card}>
                <div style={s.kpiLabel}>{c.label}</div>
                <div style={{ ...s.kpiValue, marginTop: '6px' }}>{c.value}</div>
                <div style={s.kpiSub}>{c.sub}</div>
              </div>
            ))}
          </div>
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

          {/* ── 2. Executive summary ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {kpis.map(k => {
              // Only KPIs with a matching series in `trend` get a sparkline
              // (conversion/avgDaysToCloseWon have no per-bucket trend data).
              const sparklineKey = { leads: 'leads', appts: 'appts', closedWon: 'won', policyValue: 'policyValue' }[k.key];
              return (
                <KpiCard
                  key={k.key} label={k.label} current={k.current} format={k.format}
                  deltaPct={k.deltaPct} direction={k.direction} lowerIsBetter={k.lowerIsBetter}
                  sparklineData={sparklineKey ? trend : undefined} sparklineKey={sparklineKey} sparklineColour={colors.primary}
                />
              );
            })}
          </div>

          {/* ── 3. Primary trend ─────────────────────────────────────────── */}
          <Section title="Trend" subtitle="Leads, appointments, outcomes, and policy value over the period — click a series to hide/show it.">
            <TrendChart data={trend} isMobile={isMobile} />
          </Section>

          {/* ── 4. Pipeline health ───────────────────────────────────────── */}
          <Section title="Pipeline Health" subtitle="Where leads are getting stuck — conversion between adjacent stages.">
            <PipelineHealth stages={pipeline} stageConversion={stageConversion} isMobile={isMobile} />
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
          <Section title="Policy Value" subtitle="Real prominence, not just another KPI card.">
            {policyValueBreakdown && policyValueBreakdown.total > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
                  <div><div style={s.kpiLabel}>Total</div><div style={s.kpiValue}>{fmt(policyValueBreakdown.total)}</div></div>
                  <div><div style={s.kpiLabel}>Avg per deal</div><div style={s.kpiValue}>{policyValueBreakdown.avgPerDeal === null ? '—' : fmt(policyValueBreakdown.avgPerDeal)}</div></div>
                  <div><div style={s.kpiLabel}>Per appointment</div><div style={s.kpiValue}>{policyValueBreakdown.perAppointment === null ? '—' : fmt(policyValueBreakdown.perAppointment)}</div></div>
                  <div><div style={s.kpiLabel}>Per lead</div><div style={s.kpiValue}>{policyValueBreakdown.perLead === null ? '—' : fmt(policyValueBreakdown.perLead)}</div></div>
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
          <Section title="Won vs Lost">
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
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
                  <KpiCard label="Won" current={wonVsLost.won} />
                  <KpiCard label="Lost" current={wonVsLost.lost} />
                  <KpiCard label="Win Rate" current={wonVsLost.winRate} format="percent" />
                  <KpiCard label="Avg Days (Won vs Lost)" customValue={`${fmtDays(wonVsLost.avgDaysToCloseWon)} / ${fmtDays(wonVsLost.avgDaysToCloseLost)}`} />
                </div>
                {/* 16 Aug 2026 (§182) — Mark's direct question: "why could
                    these not be displayed next to each other?" They
                    couldn't, because Overall used to live in a different
                    card entirely (Pipeline Health, moved from there —
                    see PipelineHealth's own comment, ReportsWidgets.jsx)
                    while By Region/By Portfolio lived here. No good
                    reason for the split — all three are the same theme
                    (what happened to closed deals, cut three ways).
                    REWORKED again 16 Aug 2026 (§183) — alignItems:
                    'stretch' made explicit (it's flexbox's own default,
                    but stating it here is the whole point: this row's
                    five children — Overall, Region·Won, Region·Lost,
                    Portfolio·Won, Portfolio·Lost — are now TRUE flex
                    siblings, no wrapper divs in between (see
                    WonLostPair's own reworked comment for why that
                    mattered), so stretch genuinely equalises all five
                    card heights automatically, wrapping onto new lines
                    only when the viewport actually runs out of room.
                    maxWidth: 1160px added 16 Aug 2026 (§187) — cards
                    themselves got much wider that same pass (360px, up
                    from 220px, to actually carry visual weight — see
                    DonutBreakdown's own header comment for the full
                    account), but on a wide monitor a row with only 1-2
                    cards (§186 suppresses the rest when there's nothing
                    real to compare) still looked lost without SOME cap
                    on how far the row itself could stretch. 1160px fits
                    3 of the new, wider cards per line — a bounded,
                    intentional grid rather than an open-ended one, same
                    discipline as Mark's own reference dashboard's fixed
                    KPI-row column count, not infinite width waiting to
                    be filled. */}
                {/* 16 Aug 2026 (§189) — Mark's direct question: "the
                    Loss reasons graph is tucked underneath the other 5,
                    why? Can it not be in line with By Portfolio · Lost?"
                    Root cause: Loss reasons used to live in its OWN
                    separate <div> below this row (marginTop:'18px'),
                    not as a flex child WITHIN it — so it always started
                    a fresh line of its own regardless of how much room
                    was actually left in the row above (Portfolio·Won/
                    Portfolio·Lost only fill 2 of the row's 3 card
                    slots, leaving real space Loss reasons could have
                    used). Moved inside this same flex container as a
                    true sibling of Overall/Region/Portfolio — same fix
                    class as §183's own WonLostPair rework (a card
                    outside the flex row can't flow into it, no matter
                    how the row's own CSS is tuned). */}
                {/* 16 Aug 2026 (§190, CORRECTED §191) — §190's own
                    margin: '0 auto' was real but incomplete, confirmed by
                    Mark directly inspecting the live element: that rule
                    WAS present and DID correctly centre the row's own
                    bounding box — verified with DevTools, not assumed.
                    What it missed: this box has no visible border or
                    background of its own, and flex's own default
                    justify-content (flex-start) packs the CARDS against
                    the box's left edge regardless of how wide or how
                    centred the box itself is. A centred-but-invisible
                    box with left-packed content inside it is visually
                    IDENTICAL to a box that isn't centred at all — the
                    eye has no way to tell "empty space is outside the
                    box" from "empty space is inside the box, to the
                    right of the cards." Confirmed by measuring the
                    actual card positions directly (not just the row's
                    own box) against a live render of the real,
                    unmodified components — with only margin:auto, the
                    cards' own combined span started exactly at the box's
                    left edge and stopped 396px short of its right edge,
                    every time. justifyContent: 'center' added — this
                    centres the CARDS within whatever space the box
                    provides, which is what was actually missing; kept
                    margin: 'auto' too, since it's still correct for
                    centring the box itself on a screen wide enough to
                    exceed the 1160px cap. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center', gap: '20px', maxWidth: '1160px', margin: '18px auto 0' }}>
                  <DonutBreakdown
                    title="Overall"
                    isMobile={isMobile}
                    data={[
                      { label: 'Closed Won', value: wonVsLost.won, colour: colors.success },
                      { label: 'Closed Lost', value: wonVsLost.lost, colour: colors.danger },
                    ]}
                    emptyMessage="No closed appointments this period."
                  />
                  {wonByRegionPair}
                  {wonByPortfolioPair}
                  {wonVsLost.hasLossReasons ? (
                    /* 15 Aug 2026 (§175) — replaces the old ranked bar
                        list. Genuine parts-of-a-whole data (every lost
                        deal has exactly one reason) is what
                        DonutBreakdown exists for — Mark's own explicit
                        request, referencing a donut+share-list pattern
                        from another app of his. 'Not captured' stays
                        neutral grey, not a rotating palette slot — it's
                        an absence-of-data bucket, not a real category
                        the reader should visually equate with the
                        others. */
                    <DonutBreakdown
                      title="Loss reasons"
                      isMobile={isMobile}
                      data={wonVsLost.lossReasons.map((r, i) => ({
                        label: LOST_REASON_LABELS[r.reason] ?? r.reason,
                        value: r.count,
                        colour: r.reason === 'Not captured' ? colors.ink400 : CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
                      }))}
                    />
                  ) : (
                    <DonutBreakdown
                      title="Loss reasons"
                      isMobile={isMobile}
                      data={[]}
                      emptyMessage="No loss reasons captured yet this period — the field exists now (marking an appointment Lost prompts for one), but none of this period's lost appointments have one recorded."
                    />
                  )}
                </div>
              </>
            ) : (
              <EmptyState message="No closed appointments this period." />
            )}
          </Section>

          {/* ── 10. Appointment analysis ──────────────────────────────────── */}
          <Section title="Appointment Analysis">
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
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
                  <KpiCard label="Booked" current={appointmentAnalysis.booked} />
                  <KpiCard label="Appts per lead" current={appointmentAnalysis.perLead} format="ratio" />
                  <KpiCard label="Booked → Won" current={appointmentAnalysis.bookedToWonConversion} format="percent" />
                  {/* 15 Aug 2026 (§172) — real numbers now (migration
                      034/MeetingAttempt.status), not a "not tracked yet"
                      placeholder. Counts attempts LOGGED this period
                      (matches the backend's own scoping — see
                      reportService.js), not appointments whose first
                      meeting was originally booked in it. */}
                  <KpiCard label="Cancelled" current={appointmentAnalysis.cancelled} />
                  <KpiCard label="Missed / No-show" current={appointmentAnalysis.missed} />
                </div>
                {/* 16 Aug 2026 (§182) — Meeting Type and Cancellation
                    reasons are genuinely different breakdowns (what kind
                    of meeting vs why one got cancelled) but used to each
                    get their own full-width block, stacked, each with a
                    single small donut floating in an otherwise-empty
                    row. Same fix as Won vs Lost's own Overall/By Region/
                    By Portfolio consolidation just above: one flex-wrap
                    row, genuinely side by side where there's room.
                    REWORKED again 16 Aug 2026 (§183) — same fix as
                    WonLostPair's own rework: wrapper divs with their own
                    group heading broke flexbox's stretch from reaching
                    the actual donut cards, so heights came out uneven.
                    Each donut now carries its own title directly (no
                    single-word label needs a separate group heading the
                    way a Won/Lost pair does) and sits as a true flex
                    sibling of the other, so stretch equalises them
                    correctly. */}
                {/* 16 Aug 2026 (§190, CORRECTED §191) — same fix as the
                    Won vs Lost row above, same real cause: margin:auto
                    correctly centred this row's own invisible box, but
                    said nothing about where the CARDS sit within that
                    box — flex's default justify-content packed them
                    left regardless. See that row's own comment for the
                    fuller account, including how this was actually
                    confirmed (Mark inspecting the live element directly,
                    then a measured render of the real components). */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center', gap: '20px', maxWidth: '1160px', margin: '0 auto' }}>
                  {appointmentAnalysis.byMeetingType.length > 0 && (
                    /* 16 Aug 2026 (§180) — Mark's own suggestion: "perhaps
                       the Meeting Type could be a donut chart." Was a
                       DataTable (Booked/Won/Conversion Ratio columns) —
                       genuine parts-of-a-whole data (every appointment
                       has exactly one meeting type), so donut fits
                       cleanly. Won/Conversion Ratio columns dropped
                       rather than kept alongside — with only ever
                       InPerson/Virtual as categories, a supplementary
                       table for two rows added little beyond what the
                       donut (booked share) plus hover already carries.
                       Real, different metrics (not a repeat of Booked)
                       so flagging the drop rather than silently losing
                       them — easy to bring back as its own small table
                       if that comparison specifically is wanted.
                       CONDITION CHANGED to `.length > 1` in §186, then
                       REVERTED back to `.length > 0` in §188 — §186's
                       "nothing to compare yet" reasoning was built
                       around a thin single-category card design; §187
                       rebuilt DonutBreakdown to carry real weight (a
                       centre label, a full legend with values) at any
                       category count, which removed the actual
                       justification for hiding this at n=1. Mark's own
                       question after applying §187 — "where are all the
                       other graphs?" — confirmed the suppression was
                       hiding real, working data for no remaining
                       reason. See WonLostPair's own §188 comment for
                       the fuller account. */
                    <DonutBreakdown
                      title="Meeting Type"
                      isMobile={isMobile}
                      data={appointmentAnalysis.byMeetingType.map((m, i) => ({
                        label: m.meetingType, value: m.booked,
                        colour: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
                      }))}
                    />
                  )}
                  {appointmentAnalysis.cancelReasons.length > 0 ? (
                    /* 15 Aug 2026 (§175) — same DonutBreakdown as Won vs
                       Lost's own loss-reasons section, for consistency
                       between the two visually near-identical
                       breakdowns. See that section's own comment for
                       the full reasoning. */
                    <DonutBreakdown
                      title="Cancellation reasons"
                      isMobile={isMobile}
                      data={appointmentAnalysis.cancelReasons.map((r, i) => ({
                        label: CANCEL_REASON_LABELS[r.reason] ?? r.reason,
                        value: r.count,
                        colour: r.reason === 'Not captured' ? colors.ink400 : CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
                      }))}
                    />
                  ) : appointmentAnalysis.cancelled > 0 ? (
                    /* 16 Aug 2026 (§183) — routed through DonutBreakdown's
                       own empty-state branch (data=[]) rather than a bare
                       <p>, so this card matches its sibling's chrome and
                       height exactly instead of being an unstyled outlier
                       in the same row — same reasoning as the card-chrome
                       fix in DonutBreakdown itself (§179/§182). */
                    <DonutBreakdown
                      title="Cancellation reasons"
                      isMobile={isMobile}
                      data={[]}
                      emptyMessage="No cancellation reasons captured yet this period — the field exists now, but none of this period's cancelled meetings have one recorded."
                    />
                  ) : null}
                </div>

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
