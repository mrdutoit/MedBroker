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

  const brokerColumns = [
    { key: 'name',         label: 'Broker', sortable: false, render: r => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {r.topPerformer && <span title="Top performer">🏆</span>}{r.name}
        </span>
      ) },
    { key: 'appts',        label: 'Appointments', align: 'right' },
    { key: 'signed',       label: 'Signed',       align: 'right' },
    { key: 'policyValue',  label: 'Policy Value', align: 'right', render: r => fmt(r.policyValue) },
    { key: 'conversion',   label: 'Conversion Ratio', align: 'right', render: r => (r.appts === 0 ? '0.0' : (r.signed / r.appts).toFixed(1)) },
  ];
  const brokerRows = brokers.map(b => ({ ...b, id: b.id, conversion: b.appts === 0 ? 0 : b.signed / b.appts, topPerformer: b.policyValue > 0 && b.policyValue === Math.max(...brokers.map(x => x.policyValue)) }));

  const agentColumns = [
    { key: 'name',    label: 'Agent', sortable: false },
    { key: 'leads',   label: 'Leads',   align: 'right' },
    { key: 'calls',   label: 'Calls',   align: 'right' },
    { key: 'appts',   label: 'Appts Booked', align: 'right' },
    { key: 'conversion', label: 'Bookings Ratio', align: 'right' },
  ];

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

  const meetingTypeColumns = [
    { key: 'meetingType', label: 'Meeting Type', sortable: false },
    { key: 'booked',      label: 'Booked', align: 'right' },
    { key: 'closedWon',   label: 'Won',    align: 'right' },
    { key: 'conversion',  label: 'Conversion Ratio', align: 'right' },
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Section title="Broker Performance">
              <DataTable
                columns={brokerColumns} rows={brokerRows} defaultSortKey="policyValue" highlightKey="policyValue"
                onRowClick={r => navigate(`/reports/broker/${r.id}${detailLinkQuery}`)}
                emptyMessage="No broker activity this period."
              />
            </Section>
            <Section title="Agent Activity">
              <DataTable
                columns={agentColumns} rows={agents} defaultSortKey="appts" highlightKey="appts"
                onRowClick={r => navigate(`/reports/agent/${r.id}${detailLinkQuery}`)}
                emptyMessage="No agent activity this period."
              />
            </Section>
          </div>

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
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
                  <div><div style={s.kpiLabel}>Won</div><div style={{ ...s.kpiValue, color: colors.success }}>{wonVsLost.won}</div></div>
                  <div><div style={s.kpiLabel}>Lost</div><div style={{ ...s.kpiValue, color: colors.danger }}>{wonVsLost.lost}</div></div>
                  <div><div style={s.kpiLabel}>Win Rate</div><div style={s.kpiValue}>{wonVsLost.winRate === null ? '—' : `${wonVsLost.winRate}%`}</div></div>
                  <div><div style={s.kpiLabel}>Avg Days (Won vs Lost)</div><div style={{ ...s.kpiValue, fontSize: '1.1rem' }}>{fmtDays(wonVsLost.avgDaysToCloseWon)} / {fmtDays(wonVsLost.avgDaysToCloseLost)}</div></div>
                </div>
                {wonVsLost.hasLossReasons ? (
                  <div style={{ marginTop: '18px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.ink500, marginBottom: '8px' }}>Loss reasons</div>
                    {(() => {
                      const maxCount = Math.max(...wonVsLost.lossReasons.map(r => r.count), 1);
                      return wonVsLost.lossReasons.map(r => (
                        <div key={r.reason} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.8125rem', width: isMobile ? '110px' : '160px', flexShrink: 0, color: r.reason === 'Not captured' ? colors.ink400 : colors.ink700 }}>
                            {LOST_REASON_LABELS[r.reason] ?? r.reason}
                          </span>
                          <div style={{ flex: 1, height: '16px', background: colors.surfaceSubtle, borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(4, (r.count / maxCount) * 100)}%`, height: '100%', background: r.reason === 'Not captured' ? colors.ink400 : colors.danger, opacity: r.reason === 'Not captured' ? 0.5 : 0.85 }} />
                          </div>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, width: '24px', textAlign: 'right' }}>{r.count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: colors.ink400, marginTop: '14px', marginBottom: 0 }}>
                    No loss reasons captured yet this period — the field exists now (marking an appointment Lost prompts for one), but none of this period's lost appointments have one recorded.
                  </p>
                )}
              </>
            ) : (
              <EmptyState message="No closed appointments this period." />
            )}
          </Section>

          {/* ── 10. Appointment analysis ──────────────────────────────────── */}
          <Section title="Appointment Analysis">
            {appointmentAnalysis && appointmentAnalysis.booked > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
                  <div><div style={s.kpiLabel}>Booked</div><div style={s.kpiValue}>{appointmentAnalysis.booked}</div></div>
                  <div><div style={s.kpiLabel}>Appts per lead</div><div style={s.kpiValue}>{fmtRatio(appointmentAnalysis.perLead)}</div></div>
                  <div><div style={s.kpiLabel}>Booked → Won</div><div style={s.kpiValue}>{appointmentAnalysis.bookedToWonConversion === null ? '—' : `${appointmentAnalysis.bookedToWonConversion}%`}</div></div>
                </div>
                {appointmentAnalysis.byMeetingType.length > 0 && (
                  <DataTable columns={meetingTypeColumns} rows={appointmentAnalysis.byMeetingType} defaultSortKey="booked" highlightKey="booked" />
                )}
                {!appointmentAnalysis.hasCancelledMissedTracking && (
                  <p style={{ fontSize: '0.75rem', color: colors.ink400, marginTop: '14px', marginBottom: 0 }}>
                    Cancelled and missed appointments aren't tracked as distinct statuses yet — this section covers booked/won only.
                  </p>
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
