/**
 * services/reportService.js — NEW, 23 Jul 2026.
 * Backs the Reports dashboard — previously entirely mock data (Reports.jsx's
 * own header comment already documented the intended API shape:
 * GET /api/reports/summary|brokers|agents?period=... — this implements it).
 *
 * PIPELINE BUCKET MAPPING — decided with Mark before writing any code, not
 * assumed: the mock had 7 buckets including "Uncontactable", which has no
 * backing data anywhere (CallAttempt.outcome has no such value, and nothing
 * tracks "no answer after N attempts" as a derived state). Dropped. The
 * mock's Closed Won/Closed Lost split lives on Appointment, not Lead — a
 * Lead's own pipelineStatus only ever says Converted or Closed, never
 * Won/Lost specifically (and since §35, a Lead can have several
 * Appointments over time, so "the" outcome means the most recent one's).
 * Real buckets: Unassigned, Assigned, InProgress (straight from
 * pipelineStatus), then Converted leads split by their most recent
 * appointment's actual status — still active -> AppointmentBooked, ClosedWon
 * -> ClosedWon, ClosedLost -> ClosedLost. Leads that closed
 * via a call outcome without ever getting an appointment
 * (pipelineStatus = 'Closed') are folded into ClosedLost too — both
 * represent "didn't convert", no reason to split into a 7th/8th bucket.
 * ReturnedToLeads is DELIBERATELY EXCLUDED from ClosedLost — 16 Aug 2026
 * (§185, Mark's explicit decision): it's not a sales outcome (the
 * appointment went back to the pool, might still convert with a
 * different broker), and folding it into "lost" skews Win Rate and
 * every breakdown built on it. See mergeClosedMetrics()'s own header
 * comment, this file, for the full account.
 *
 * POLICY VALUE — also decided with Mark: no monetary/premium field exists
 * anywhere in the schema (checked, not assumed). The mock's Policy Value
 * column and its derived KPIs are dropped from this build rather than
 * inventing a new capture feature nobody asked for. Real KPIs substituted
 * in its place (Appointments Booked / Active Brokers org-wide, Meetings
 * Held for a broker's own view) — see reportHandlers.js's KPI assembly.
 *
 * SCOPE: period-over-period trend/pipeline scoping is by Lead.createdAt
 * (the cohort of leads created within the period) — matches how the
 * pipeline breakdown and the trend chart's "leads" series both need a
 * consistent, single definition of "in this period". Broker/Agent activity
 * tables scope by activity within the period (calls made, appointments
 * booked), not by when the person was created — different question.
 */

import { executeQuery, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { getDirectReportIds } from './userService.js';

// ─── Period → date range ────────────────────────────────────────────────────
/**
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {Date} [referenceDate] - a date within the period instance to view.
 * Defaults to the actual current moment, i.e. "the period we're in right
 * now". When this falls within the SAME month/quarter/year as today, `end`
 * is the actual current moment (a progressive "to date" view of an ongoing
 * period). When it's an earlier period, `end` is that period's own actual
 * last moment — a completed month/quarter/year shouldn't have its range
 * artificially truncated at today, or activity in its later days would be
 * silently excluded.
 */
export function getPeriodRange(period, referenceDate = new Date()) {
  const actualNow = new Date();
  const start = new Date(referenceDate);
  let end;

  if (period === 'Monthly') {
    start.setDate(1);
    const isCurrent = start.getFullYear() === actualNow.getFullYear() && start.getMonth() === actualNow.getMonth();
    end = isCurrent ? actualNow : new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'Quarterly') {
    const qStartMonth = Math.floor(referenceDate.getMonth() / 3) * 3;
    start.setMonth(qStartMonth, 1);
    const actualQStartMonth = Math.floor(actualNow.getMonth() / 3) * 3;
    const isCurrent = start.getFullYear() === actualNow.getFullYear() && qStartMonth === actualQStartMonth;
    end = isCurrent ? actualNow : new Date(start.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    const isCurrent = start.getFullYear() === actualNow.getFullYear();
    end = isCurrent ? actualNow : new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// ─── Period → trend buckets ─────────────────────────────────────────────────
// Monthly: weeks within the viewed month. Quarterly/Yearly: months within
// the viewed quarter/year. Small N (<=12) — one pair of COUNT queries per
// bucket in getReportSummary() below is simpler and far more maintainable
// than dynamic SQL date-bucketing for a low-traffic internal report; not a
// performance concern at this scale.
function getTrendBuckets(period, referenceDate = new Date()) {
  const { start, end } = getPeriodRange(period, referenceDate);
  const buckets = [];
  if (period === 'Monthly') {
    let weekStart = new Date(start);
    let weekNum = 1;
    while (weekStart.getMonth() === start.getMonth()) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const clampedEnd = weekEnd > end ? end : weekEnd;
      buckets.push({ label: `W${weekNum}`, start: new Date(weekStart), end: clampedEnd });
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
      weekNum += 1;
      if (weekNum > 5) break; // a month never spans more than 5 week-buckets this way
    }
  } else {
    const monthCount = period === 'Quarterly' ? 3 : 12;
    for (let i = 0; i < monthCount; i++) {
      const monthStart = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 23, 59, 59, 999);
      const label = monthStart.toLocaleDateString('en-ZA', { month: 'short' });
      // Future months (haven't started yet, relative to the viewed period's
      // own end) still get a bucket — zero activity, same as before — but
      // no query needed for them, they're always 0.
      buckets.push({ label, start: monthStart, end: monthEnd, future: monthStart > end });
    }
  }
  return buckets;
}

/**
 * Pipeline status breakdown + trend chart data for the current period.
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @returns {Promise<{pipeline: Array, trend: Array}>}
 */
export async function getReportSummary(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);

  // §148 (13 Aug 2026) — pipeline breakdown split into two genuinely
  // different scopes, per Mark's explicit decision: Unassigned/Assigned/
  // InProgress/Appointment Booked stay a COHORT view (leads CREATED in
  // this period — unchanged from the original 23 Jul design). Closed
  // Won/Closed Lost move to a SNAPSHOT view instead (appointments that
  // CLOSED in this period, via the new Appointment.closedAt column,
  // regardless of when their parent Lead was created) — this was the
  // actual bug Mark's testing surfaced: a lead created in July that only
  // closed in August was being reported against July.
  //
  // These can no longer live in one combined query the way they used
  // to — a lead's cohort membership and its appointment's close-period
  // membership are independent questions now, not both driven by the
  // same l.createdAt filter.
  const [cohortRows, closedRows] = await Promise.all([
    executeQuery(
      `SELECT
         CASE
           WHEN l.pipelineStatus = 'Unassigned' THEN 'Unassigned'
           WHEN l.pipelineStatus = 'Assigned'   THEN 'Assigned'
           WHEN l.pipelineStatus = 'InProgress' THEN 'InProgress'
           WHEN l.pipelineStatus = 'AppointmentScheduled' AND ap.status NOT IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads')
             THEN 'AppointmentBooked'
           ELSE NULL
         END AS bucket,
         COUNT(*) AS count
       FROM Lead l
       LEFT JOIN LATERAL (
         SELECT status FROM Appointment WHERE leadId = l.id ORDER BY createdAt DESC LIMIT 1
       ) ap ON true
       WHERE l.createdAt >= @start AND l.createdAt <= @end
         AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       GROUP BY bucket`,
      {
        start: { type: sql.DateTimeOffset, value: start },
        end: { type: sql.DateTimeOffset, value: end },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      }
    ),
    // Closed Won/Lost, snapshot view: appointments whose OWN closedAt
    // falls in this period. Folded in here too: leads that closed
    // without ever having an appointment at all (pipelineStatus =
    // 'Closed', a direct call-outcome close) — no equivalent closedAt
    // exists for that path (there's no Appointment row to hang one off),
    // so this one sub-case still approximates via Lead.updatedAt.
    // CORRECTED 21 Aug 2026 (Mark, live testing — a real Closed WON
    // appointment was showing up as an EXTRA Closed Lost, not just an
    // imprecise date): pipelineStatus = 'Closed' is NOT specific to "lost
    // at the call stage" — appointmentService.js sets it identically once
    // ANY Appointment reaches ClosedWon or ClosedLost with nothing else
    // left open for that Lead. Without the NOT EXISTS guard below, this
    // branch double-counted every Lead whose real appointment had already
    // closed (Won included) as an additional, spurious "Lost, no
    // appointment" — this was a genuine correctness bug, not the
    // "flagged imprecision" this comment previously described it as.
    executeQuery(
      `SELECT 'ClosedWon' AS bucket, COUNT(*) AS count FROM Appointment
       WHERE status = 'ClosedWon' AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId
       UNION ALL
       SELECT 'ClosedLost' AS bucket, COUNT(*) AS count FROM Appointment
       WHERE status = 'ClosedLost' AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId
       UNION ALL
       SELECT 'ClosedLost' AS bucket, COUNT(*) AS count FROM Lead
       WHERE pipelineStatus = 'Closed' AND updatedAt >= @start AND updatedAt <= @end
         AND deletedAt IS NULL AND organisationId = @organisationId
         AND NOT EXISTS (SELECT 1 FROM Appointment apx WHERE apx.leadId = Lead.id)`,
      {
        start: { type: sql.DateTimeOffset, value: start },
        end: { type: sql.DateTimeOffset, value: end },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      }
    ),
  ]);
  const pipelineCounts = Object.fromEntries(cohortRows.filter(r => r.bucket).map(r => [r.bucket, Number(r.count)]));
  for (const row of closedRows) {
    pipelineCounts[row.bucket] = (pipelineCounts[row.bucket] ?? 0) + Number(row.count);
  }
  const pipeline = [
    { status: 'Unassigned',          count: pipelineCounts.Unassigned ?? 0 },
    { status: 'Assigned',            count: pipelineCounts.Assigned ?? 0 },
    { status: 'In Progress',         count: pipelineCounts.InProgress ?? 0 },
    { status: 'Appointment Booked',  count: pipelineCounts.AppointmentBooked ?? 0 },
    { status: 'Closed Won',          count: pipelineCounts.ClosedWon ?? 0 },
    { status: 'Closed Lost',         count: pipelineCounts.ClosedLost ?? 0 },
  ];

  const buckets = getTrendBuckets(period, referenceDate);
  const trend = [];
  for (const b of buckets) {
    if (b.future) { trend.push({ label: b.label, leads: 0, won: 0 }); continue; }
    const [leadsRows, wonRows] = await Promise.all([
      executeQuery(
        `SELECT COUNT(*) AS count FROM Lead
         WHERE createdAt >= @start AND createdAt <= @end AND deletedAt IS NULL AND organisationId = @organisationId`,
        { start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
      ),
      // §148 — was updatedAt (drifts on any later edit to a closed
      // appointment); now closedAt, set once at the actual close moment.
      executeQuery(
        `SELECT COUNT(*) AS count FROM Appointment
         WHERE status = 'ClosedWon' AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId`,
        { start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
      ),
    ]);
    trend.push({ label: b.label, leads: Number(leadsRows[0].count), won: Number(wonRows[0].count) });
  }

  // Org-wide total policy value — added 23 Jul 2026, §44. Its own
  // standalone query, not folded into the pipeline/trend queries above,
  // to avoid any fan-out risk from joining AppointmentProduct alongside
  // Lead/Appointment aggregates that weren't designed around it.
  // §148 (13 Aug 2026) — two changes, both Mark's explicit decision:
  // (1) scoped by the appointment's closedAt, not createdAt (a deal's
  // value is realised when it closes, not when the appointment was
  // booked); (2) now filtered to status = 'ClosedWon' only — "a deal's
  // value only really exists once won" — the old query had no status
  // filter at all and summed policyValue across every appointment
  // created in the period regardless of outcome, which is a genuine
  // correction, not just a date-basis change.
  const policyValueRows = await executeQuery(
    `SELECT COALESCE(SUM(ap.policyValue), 0) AS "total" FROM AppointmentProduct ap
     JOIN Appointment a ON a.id = ap.appointmentId
     WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId`,
    { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  const totalPolicyValue = Number(policyValueRows[0].total);

  // Avg Days to Close — new metric, §148, Mark's explicit request. Won
  // and Lost tracked separately (his choice — "interesting to compare").
  // Measured from the parent LEAD's createdAt, not the appointment's own
  // — a lead can have several Appointment rows over its life (a failed
  // attempt, a Reopen, a second attempt that succeeds), so measuring
  // from the appointment's own createdAt would understate the true
  // time-to-close by missing everything before the final, successful
  // attempt. Matches how Mark framed the original bug report too ("the
  // Lead was created in July").
  const daysToCloseRows = await executeQuery(
    `SELECT a.status,
       AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
     FROM Appointment a
     JOIN Lead l ON l.id = a.leadId
     WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end
       AND a.organisationId = @organisationId
     GROUP BY a.status`,
    { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  const daysToCloseByStatus = Object.fromEntries(daysToCloseRows.map(r => [r.status, r.avgDays === null ? null : Number(r.avgDays)]));
  const avgDaysToClose = {
    won:  daysToCloseByStatus.ClosedWon  ?? null,
    lost: daysToCloseByStatus.ClosedLost ?? null,
  };

  return { pipeline, trend, totalPolicyValue, avgDaysToClose };
}

/**
 * Single-agent drill-down — AgentDetail.jsx. Permission: Admin/GlobalAdmin
 * can view any agent; Supervisor only their own direct reports; Agent only
 * themselves. Returns null if not found OR not permitted — the handler
 * treats both the same (404), not leaking which case it was.
 * @param {string} agentId
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {{role: string, userId: string}} scope
 */
export async function getAgentDetailReport(agentId, period, scope, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);

  if (scope.role === 'Agent' && scope.userId !== agentId) return null;
  if (scope.role === 'Supervisor') {
    const reportIds = await getDirectReportIds(scope.userId);
    if (!reportIds.includes(agentId)) return null;
  }
  if (scope.role === 'Broker') return null;

  const metaRows = await executeQuery(
    `SELECT u.id, u.displayName AS "name", u.region,
       COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS "portfolios"
     FROM "User" u
     LEFT JOIN UserPortfolio up ON up.userId = u.id
     LEFT JOIN Portfolio p ON p.id = up.portfolioId
     WHERE u.id = @agentId AND u.role = 'Agent' AND u.organisationId = @organisationId
     GROUP BY u.id, u.displayName, u.region`,
    { agentId: { type: sql.UniqueIdentifier, value: agentId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (metaRows.length === 0) return null;
  const meta = metaRows[0];

  const kpiRows = await executeQuery(
    `SELECT
       COUNT(DISTINCT l.id) AS "leads",
       COUNT(DISTINCT ca.id) AS "calls",
       COUNT(DISTINCT ca.id) FILTER (WHERE ca.outcome = 'CallbackRequested') AS "callbacks",
       COUNT(DISTINCT ca.id) FILTER (WHERE ca.outcome = 'NoAnswer') AS "noAnswer",
       COUNT(DISTINCT a.id) AS "appts"
     FROM "User" u
     LEFT JOIN Lead l ON l.assignedAgentId = u.id AND l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL
     LEFT JOIN CallAttempt ca ON ca.agentId = u.id AND ca.callTime >= @start AND ca.callTime <= @end
     LEFT JOIN Appointment a ON a.agentId = u.id AND a.createdAt >= @start AND a.createdAt <= @end
     WHERE u.id = @agentId
     GROUP BY u.id`,
    { agentId: { type: sql.UniqueIdentifier, value: agentId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const k = kpiRows[0] ?? { leads: 0, calls: 0, callbacks: 0, noAnswer: 0, appts: 0 };
  const leads = Number(k.leads), appts = Number(k.appts);
  // §153 (13 Aug 2026, Mark's decision) — was a '%' string, could exceed
  // 100 (Stacey Brookes' 200% — a lead with one appointment Returned to
  // Leads, then re-booked, both counted in the same period). Nothing
  // was wrong with the underlying counts — the "rate"/"%" framing was
  // just misleading for a metric with no natural upper bound. Now a
  // plain ratio (e.g. "2.0"), same numbers, no implied 0-100% ceiling.
  const kpi = {
    leads, calls: Number(k.calls), callbacks: Number(k.callbacks), noAnswer: Number(k.noAnswer), appts,
    conversion: leads === 0 ? '0.0' : (appts / leads).toFixed(1),
  };

  // Call outcome breakdown — all 7 real CallAttempt.outcome values, not the
  // mock's 6 (which omitted ClientContacted).
  const outcomeRows = await executeQuery(
    `SELECT outcome, COUNT(*) AS count FROM CallAttempt
     WHERE agentId = @agentId AND callTime >= @start AND callTime <= @end
     GROUP BY outcome`,
    { agentId: { type: sql.UniqueIdentifier, value: agentId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const outcomeCounts = Object.fromEntries(outcomeRows.map(r => [r.outcome, Number(r.count)]));
  const totalCalls = Object.values(outcomeCounts).reduce((a, b) => a + b, 0);
  const callOutcomes = [
    { outcome: 'NoAnswer',             label: 'No Answer' },
    { outcome: 'Voicemail',            label: 'Voicemail' },
    { outcome: 'ClientContacted',      label: 'Client Contacted' },
    { outcome: 'CallbackRequested',    label: 'Callback Requested' },
    { outcome: 'AppointmentScheduled', label: 'Appointment Booked' },
    { outcome: 'NotInterested',        label: 'Not Interested' },
    { outcome: 'WrongNumber',          label: 'Wrong Number' },
  ].map(o => {
    const count = outcomeCounts[o.outcome] ?? 0;
    return { label: o.label, count, pct: totalCalls === 0 ? 0 : Math.round((count / totalCalls) * 100) };
  }).filter(o => o.count > 0 || totalCalls === 0);

  // Activity trend — calls made + appointments booked per bucket, scoped
  // to this one agent. Same bucket generator getReportSummary() uses.
  const buckets = getTrendBuckets(period, referenceDate);
  const activity = [];
  for (const b of buckets) {
    if (b.future) { activity.push({ label: b.label, calls: 0, booked: 0 }); continue; }
    const [callRows, bookedRows] = await Promise.all([
      executeQuery(
        `SELECT COUNT(*) AS count FROM CallAttempt WHERE agentId = @agentId AND callTime >= @start AND callTime <= @end`,
        { agentId: { type: sql.UniqueIdentifier, value: agentId }, start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end } }
      ),
      executeQuery(
        `SELECT COUNT(*) AS count FROM Appointment WHERE agentId = @agentId AND createdAt >= @start AND createdAt <= @end`,
        { agentId: { type: sql.UniqueIdentifier, value: agentId }, start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end } }
      ),
    ]);
    activity.push({ label: b.label, calls: Number(callRows[0].count), booked: Number(bookedRows[0].count) });
  }

  // Recent lead activity — last 5 leads assigned to this agent, with the
  // most recent call attempt THIS AGENT made on each (if any). Fixed 23
  // Jul 2026: the LATERAL subquery previously filtered only by leadId, so
  // it surfaced the most recent call ANY agent ever made on that lead —
  // including a prior agent's, from before the lead was reassigned to
  // this one. That's misleading here specifically: a lead reassigned to
  // a new agent legitimately keeps its full call history (nothing about
  // reassignment deletes or transfers past CallAttempt rows — matches how
  // Appointment.agentId also stays with whoever booked it, not whoever
  // holds the lead now, per §35), but showing an activity the CURRENT
  // agent never performed under their own name on their own detail page
  // is a genuine bug, not just an artifact of the data model.
  const recentLeads = await executeQuery(
    `SELECT
       l.id AS "leadId", l.firstName AS "firstName", l.lastName AS "lastName",
       COALESCE(ev.name, ms.name, l.manualSourceName) AS "source",
       l.pipelineStatus AS "status",
       lc.outcome AS "lastOutcome", lc.callTime AS "lastCallTime"
     FROM Lead l
     LEFT JOIN LATERAL (
       SELECT outcome, callTime FROM CallAttempt
       WHERE leadId = l.id AND agentId = @agentId
       ORDER BY callTime DESC LIMIT 1
     ) lc ON true
     LEFT JOIN Event ev ON l.linkedEventId = ev.id
     LEFT JOIN MedicalSubscription ms ON l.linkedSubscriptionId = ms.id
     WHERE l.assignedAgentId = @agentId AND l.deletedAt IS NULL
     ORDER BY l.updatedAt DESC
     LIMIT 5`,
    { agentId: { type: sql.UniqueIdentifier, value: agentId } }
  );

  // §148 (13 Aug 2026) — Avg Days to Close, broken down per agent per
  // Mark's decision. Same measurement basis as the org-wide version in
  // getReportSummary(): parent Lead's createdAt to Appointment.closedAt,
  // Won and Lost tracked separately.
  const agentDaysToCloseRows = await executeQuery(
    `SELECT a.status,
       AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
     FROM Appointment a
     JOIN Lead l ON l.id = a.leadId
     WHERE a.agentId = @agentId AND a.status IN ('ClosedWon', 'ClosedLost')
       AND a.closedAt >= @start AND a.closedAt <= @end
     GROUP BY a.status`,
    { agentId: { type: sql.UniqueIdentifier, value: agentId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const agentDaysToCloseByStatus = Object.fromEntries(agentDaysToCloseRows.map(r => [r.status, r.avgDays === null ? null : Number(r.avgDays)]));
  const avgDaysToClose = {
    won:  agentDaysToCloseByStatus.ClosedWon  ?? null,
    lost: agentDaysToCloseByStatus.ClosedLost ?? null,
  };

  return {
    meta: { name: meta.name, region: meta.region, portfolios: meta.portfolios },
    kpi, callOutcomes, activity, avgDaysToClose,
    recentLeads: recentLeads.map(r => ({
      leadId: r.leadId, name: `${r.firstName} ${r.lastName}`, source: r.source,
      status: r.status, lastOutcome: r.lastOutcome, lastCallTime: r.lastCallTime,
    })),
  };
}

/**
 * Single-broker drill-down — BrokerDetail.jsx. Permission: Admin/
 * GlobalAdmin/Supervisor can view any broker (brokers aren't in a
 * supervisor's direct-report line, same as the list view); Broker only
 * themselves; Agent cannot view broker detail at all (no path to it from
 * their own Reports view either).
 * @param {string} brokerId
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {{role: string, userId: string}} scope
 */
export async function getBrokerDetailReport(brokerId, period, scope, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);

  if (scope.role === 'Agent') return null;
  if (scope.role === 'Broker' && scope.userId !== brokerId) return null;

  const metaRows = await executeQuery(
    `SELECT u.id, u.displayName AS "name", u.region,
       COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS "portfolios"
     FROM "User" u
     LEFT JOIN UserPortfolio up ON up.userId = u.id
     LEFT JOIN Portfolio p ON p.id = up.portfolioId
     WHERE u.id = @brokerId AND u.role = 'Broker' AND u.organisationId = @organisationId
     GROUP BY u.id, u.displayName, u.region`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (metaRows.length === 0) return null;
  const meta = metaRows[0];

  const kpiRows = await executeQuery(
    `SELECT
       COUNT(a.id) AS "appts",
       COUNT(a.id) FILTER (WHERE a.isBrokerSwitch = true) AS "switches",
       -- 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) —
       -- rewritten off the old flat meeting{1,2,3}Status columns onto
       -- MeetingAttempt. 'Held' now covers BOTH HeldInterested and
       -- HeldNotInterested (matches the old 'Seen' semantics exactly —
       -- that value never distinguished interested/not either; the new
       -- model just captures more, it doesn't narrow what counts here).
       (SELECT COUNT(*) FROM MeetingAttempt ma JOIN Appointment a2 ON a2.id = ma.appointmentId
        WHERE a2.brokerId = @brokerId AND a2.createdAt >= @start AND a2.createdAt <= @end
          AND ma.status IN ('HeldInterested', 'HeldNotInterested')) AS "meetingsHeld"
     FROM Appointment a
     WHERE a.brokerId = @brokerId AND a.createdAt >= @start AND a.createdAt <= @end`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  // §148 follow-up (13 Aug 2026) — found via Mark's own testing: "Signed"
  // was still scoped by a.createdAt (when booked), not closedAt (when
  // actually won), same bug §148 fixed for the org-wide Closed Won count
  // but missed carrying through here. A deal booked in an earlier month
  // that closed this month wouldn't count as "Signed" for this month at
  // all under the old query — exactly what Mark caught (a signed R106,000
  // deal visible in Recent Appointments but not reflected in Signed/
  // Policy Value above it). Split into its own query, closedAt-scoped,
  // matching the definition established everywhere else in this file.
  const signedRows = await executeQuery(
    `SELECT COUNT(*) AS "signed" FROM Appointment
     WHERE brokerId = @brokerId AND status = 'ClosedWon' AND closedAt >= @start AND closedAt <= @end`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const k = kpiRows[0] ?? { appts: 0, switches: 0, meetingsHeld: 0 };
  const appts = Number(k.appts), signed = Number(signedRows[0]?.signed ?? 0);

  // Products sold — real, via AppointmentProduct (already fully wired by
  // the outcome-save flow; nothing new needed there). policyValue added
  // 23 Jul 2026, §44 — per-product Rand value, now tracked and summed.
  // §148 follow-up (13 Aug 2026) — same two corrections already applied
  // to the org-wide Total Policy Value: (1) closedAt-scoped, not
  // createdAt (a deal's value is realised when it closes); (2) filtered
  // to status = 'ClosedWon' — the old query summed policyValue across
  // every appointment created in the period regardless of outcome, no
  // status filter at all. Both missed here when §148 fixed the org-wide
  // version; caught by the same R106,000 discrepancy Mark found.
  const productRows = await executeQuery(
    `SELECT p.name, COUNT(*) AS count, COALESCE(SUM(ap.policyValue), 0) AS "totalValue"
     FROM AppointmentProduct ap
     JOIN Appointment a ON a.id = ap.appointmentId
     JOIN Product p ON p.id = ap.productId
     WHERE a.brokerId = @brokerId AND a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end
     GROUP BY p.name
     ORDER BY "totalValue" DESC`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const productsSold = productRows.map(r => ({ name: r.name, count: Number(r.count), value: Number(r.totalValue) }));
  const totalPolicyValue = productsSold.reduce((sum, p) => sum + p.value, 0);

  // Conversion = signed (closedAt-scoped) / appts (createdAt-scoped) —
  // deliberately mixed basis, matching the exact same shape already
  // established for the org-wide "Closed Won" conversion % in
  // getReportSummary (orgClosedWon / orgTotalLeads has the identical
  // characteristic). A broker can show >100% conversion in a period
  // where more deals close than were newly booked — the exact reason
  // §154 (13 Aug 2026) changed this same shape to a ratio for Agent
  // booking rate. Extended here 14 Aug 2026 (§157/§158, Mark's decision:
  // "most accurate metric, industry standard") — a plain ratio, not a
  // '%' string with no real ceiling.
  const kpi = {
    appts, signed, switches: Number(k.switches), meetingsHeld: Number(k.meetingsHeld),
    policyValue: totalPolicyValue,
    conversion: appts === 0 ? '0.0' : (signed / appts).toFixed(1),
  };

  // Meeting outcome summary — real counts per meeting number/status, plus
  // an overall signed-vs-appointments-with-a-held-meeting ratio. Simpler
  // than the mock's exact "signed after 2nd meeting" framing (which
  // implied a stricter causal link this data doesn't actually establish),
  // but every number in it is real.
  //
  // REWRITTEN 14 Aug 2026 (§138 spec, session 20; §164 build, session
  // 23) off the old flat meeting{1,2}Status columns onto MeetingAttempt.
  // Two real changes at the time, not just a mechanical port:
  //   - The old 'Seen' value never distinguished interested from not —
  //     the new model does, so this summary shows that split explicitly
  //     (a genuine improvement in what's reportable, not a like-for-
  //     like port).
  //   - 'Cancelled' briefly had no equivalent (collapsed into
  //     'Rescheduled' by migration 031's own original design) — REVERSED
  //     15 Aug 2026 (§172, migration 034): Cancelled and Missed are both
  //     real, separately reportable statuses again, and both now have
  //     their own row below, same as Held/Rescheduled always did.
  // "Total" per meeting number is COUNT(*) of ALL attempt rows for that
  // number (every reschedule creates a new row) — deliberately NOT the
  // same as "how many appointments have reached this meeting number",
  // since an appointment rescheduled twice before being held contributes
  // 3 rows to that meeting number's total, not 1. Worth knowing when
  // reading this: it's counting attempts, not appointments, matching
  // what "Total" already meant under the old model too (meeting1Date IS
  // NOT NULL counted a row per appointment there only because the old
  // model could never have more than one row per meeting number at all
  // — this isn't a behaviour change for meeting number 1 specifically
  // unless it was actually rescheduled more than once, it's just now
  // capable of reflecting that history instead of silently overwriting it).
  const meetingRows = await executeQuery(
    `SELECT ma.meetingNumber AS "meetingNumber", ma.status, COUNT(*) AS count
     FROM MeetingAttempt ma JOIN Appointment a ON a.id = ma.appointmentId
     WHERE a.brokerId = @brokerId AND a.createdAt >= @start AND a.createdAt <= @end AND ma.meetingNumber IN (1, 2)
     GROUP BY ma.meetingNumber, ma.status`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const mCounts = { 1: {}, 2: {} };
  for (const row of meetingRows) {
    if (mCounts[row.meetingNumber]) mCounts[row.meetingNumber][row.status] = Number(row.count);
  }
  const mTotal = n => Object.values(mCounts[n]).reduce((sum, c) => sum + c, 0);
  const meetingSummary = [
    { label: '1st meeting — Held (Interested)',     value: `${mCounts[1].HeldInterested ?? 0} / ${mTotal(1)}` },
    { label: '1st meeting — Held (Not Interested)', value: `${mCounts[1].HeldNotInterested ?? 0} / ${mTotal(1)}` },
    { label: '1st meeting — Rescheduled',           value: `${mCounts[1].Rescheduled ?? 0} / ${mTotal(1)}` },
    { label: '1st meeting — Cancelled',             value: `${mCounts[1].Cancelled ?? 0} / ${mTotal(1)}` },
    { label: '1st meeting — Missed / No-show',      value: `${mCounts[1].Missed ?? 0} / ${mTotal(1)}` },
    { label: '2nd meeting — Held (Interested)',     value: `${mCounts[2].HeldInterested ?? 0} / ${mTotal(2)}` },
    { label: '2nd meeting — Held (Not Interested)', value: `${mCounts[2].HeldNotInterested ?? 0} / ${mTotal(2)}` },
    { label: '2nd meeting — Rescheduled',           value: `${mCounts[2].Rescheduled ?? 0} / ${mTotal(2)}` },
    { label: '2nd meeting — Cancelled',             value: `${mCounts[2].Cancelled ?? 0} / ${mTotal(2)}` },
    { label: '2nd meeting — Missed / No-show',      value: `${mCounts[2].Missed ?? 0} / ${mTotal(2)}` },
    { label: 'Signed (of all appointments)', value: `${signed} / ${appts}${appts > 0 ? ` (${Math.round(signed / appts * 100)}%)` : ''}`, bold: true },
  ];

  // Recent appointments — last 5, with lead name, portfolio, meeting
  // statuses, signed decision, and products sold (joined names).
  // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) — m1/m2
  // now pull the MOST RECENT attempt row for that meeting number
  // (ORDER BY createdAt DESC LIMIT 1), not a flat column — "most recent"
  // is the meaningful equivalent of "current state" now that a meeting
  // number can have more than one row (a reschedule creates a new one;
  // only the latest one is still actionable/current).
  const recentRows = await executeQuery(
    `SELECT
       a.id, l.firstName AS "firstName", l.lastName AS "lastName", pf.name AS "portfolio",
       -- Full portfolio set (§45) — was only the primary via the JOIN
       -- above, same gap AppointmentList.jsx's filter had before this fix.
       (SELECT COALESCE(array_agg(p4.name ORDER BY p4.name), ARRAY[]::text[])
        FROM AppointmentPortfolio ap4 JOIN Portfolio p4 ON p4.id = ap4.portfolioId
        WHERE ap4.appointmentId = a.id) AS "portfolios",
       (SELECT ma1.status FROM MeetingAttempt ma1 WHERE ma1.appointmentId = a.id AND ma1.meetingNumber = 1 ORDER BY ma1.createdAt DESC LIMIT 1) AS "m1",
       (SELECT ma2.status FROM MeetingAttempt ma2 WHERE ma2.appointmentId = a.id AND ma2.meetingNumber = 2 ORDER BY ma2.createdAt DESC LIMIT 1) AS "m2",
       a.customerSigned AS "signed",
       (SELECT COALESCE(array_agg(p2.name), ARRAY[]::text[]) FROM AppointmentProduct ap2
        JOIN Product p2 ON p2.id = ap2.productId WHERE ap2.appointmentId = a.id) AS "products",
       (SELECT COALESCE(SUM(ap3.policyValue), 0) FROM AppointmentProduct ap3
        WHERE ap3.appointmentId = a.id) AS "totalValue"
     FROM Appointment a
     JOIN Lead l ON l.id = a.leadId
     JOIN Portfolio pf ON pf.id = a.portfolioId
     WHERE a.brokerId = @brokerId
     ORDER BY a.createdAt DESC
     LIMIT 5`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId } }
  );

  // §148 (13 Aug 2026) — Avg Days to Close, broken down per broker per
  // Mark's decision. Same basis as the agent version just above: parent
  // Lead's createdAt to Appointment.closedAt, Won and Lost separately.
  const brokerDaysToCloseRows = await executeQuery(
    `SELECT a.status,
       AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
     FROM Appointment a
     JOIN Lead l ON l.id = a.leadId
     WHERE a.brokerId = @brokerId AND a.status IN ('ClosedWon', 'ClosedLost')
       AND a.closedAt >= @start AND a.closedAt <= @end
     GROUP BY a.status`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const brokerDaysToCloseByStatus = Object.fromEntries(brokerDaysToCloseRows.map(r => [r.status, r.avgDays === null ? null : Number(r.avgDays)]));
  const avgDaysToClose = {
    won:  brokerDaysToCloseByStatus.ClosedWon  ?? null,
    lost: brokerDaysToCloseByStatus.ClosedLost ?? null,
  };

  return {
    meta: { name: meta.name, region: meta.region, portfolios: meta.portfolios },
    kpi, productsSold, meetingSummary, avgDaysToClose,
    recentAppointments: recentRows.map(r => ({
      id: r.id, name: `${r.firstName} ${r.lastName}`, portfolio: r.portfolio, portfolios: r.portfolios,
      m1: r.m1, m2: r.m2, signed: r.signed, products: r.products, totalValue: Number(r.totalValue),
    })),
  };
}

/**
 * Broker performance table. Scoped by role: Admin/GlobalAdmin/Supervisor see
 * all brokers (brokers aren't in a supervisor's direct-report line the way
 * agents are — matches the mock's own scoping, where Supervisor fell
 * through to the full list); Broker sees only themselves; Agent sees none.
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {{role: string, userId: string}} scope
 */
export async function getBrokerReport(period, scope, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);

  if (scope.role === 'Agent') return [];

  const rows = await executeQuery(
    `SELECT
       u.id, u.displayName AS "name",
       -- COUNT(DISTINCT a.id), not COUNT(a.id) — §106/§107 bug fix.
       -- Mark caught this: a broker with 2 portfolios showed exactly
       -- double the real appts/signed counts here vs the correct,
       -- single-broker getBrokerDetailReport() below. Root cause: this
       -- query also joins UserPortfolio/Portfolio (to build the
       -- "portfolios" array), and a broker with N portfolios fans out
       -- to N appointment rows per real appointment — a plain COUNT()
       -- counts every duplicate. DISTINCT collapses them back to one
       -- per real appointment id, exactly the same defensive pattern
       -- getAgentReport() below already uses correctly for its own
       -- (worse — three-way) fan-out from joining Lead/CallAttempt/
       -- Appointment all in one query. policyValue was already immune
       -- to this (scalar subquery, not a join) — this brings appts/
       -- signed up to the same standard rather than restructuring the
       -- whole query, since DISTINCT alone fully closes the gap here.
       COUNT(DISTINCT a.id) AS "appts",
       -- §148 follow-up (13 Aug 2026) — was COUNT(DISTINCT a.id) FILTER
       -- (WHERE a.status = 'ClosedWon') off the same createdAt-scoped
       -- JOIN as "appts" above. Same bug just fixed in
       -- getBrokerDetailReport(): a deal booked in an earlier period
       -- that closed THIS period wouldn't count as signed at all. Now a
       -- scalar subquery, closedAt-scoped, independent of the "appts"
       -- JOIN's own (correctly different) date window.
       COALESCE((
         SELECT COUNT(*) FROM Appointment a3
         WHERE a3.brokerId = u.id AND a3.status = 'ClosedWon' AND a3.closedAt >= @start AND a3.closedAt <= @end
       ), 0) AS "signed",
       COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS "portfolios",
       -- Scalar subquery, not a direct JOIN to AppointmentProduct — a
       -- direct join would fan out one row per product sold, silently
       -- inflating the appts/signed counts above (an appointment with 3
       -- products sold would count as 3 appointments). This keeps the
       -- appointment-level aggregates correct regardless of how many
       -- products any given appointment has.
       -- §148 follow-up (13 Aug 2026) — two corrections, same as
       -- getBrokerDetailReport() just above and the org-wide Total
       -- Policy Value fixed earlier in §148: closedAt-scoped, not
       -- createdAt, AND filtered to status = 'ClosedWon' — this
       -- subquery had no status filter at all before, summing every
       -- product recorded on any appointment created in the period
       -- regardless of outcome.
       COALESCE((
         SELECT SUM(ap2.policyValue) FROM AppointmentProduct ap2
         JOIN Appointment a2 ON a2.id = ap2.appointmentId
         WHERE a2.brokerId = u.id AND a2.status = 'ClosedWon' AND a2.closedAt >= @start AND a2.closedAt <= @end
       ), 0) AS "policyValue"
     FROM "User" u
     LEFT JOIN Appointment a ON a.brokerId = u.id AND a.createdAt >= @start AND a.createdAt <= @end
     LEFT JOIN UserPortfolio up ON up.userId = u.id
     LEFT JOIN Portfolio p ON p.id = up.portfolioId
     WHERE u.role = 'Broker' AND u.isActive = true AND u.organisationId = @organisationId
       ${scope.role === 'Broker' ? 'AND u.id = @selfId' : ''}
     GROUP BY u.id, u.displayName
     ORDER BY u.displayName`,
    {
      start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      ...(scope.role === 'Broker' ? { selfId: { type: sql.UniqueIdentifier, value: scope.userId } } : {}),
    }
  );

  return rows.map(r => ({
    id: r.id, name: r.name, appts: Number(r.appts), signed: Number(r.signed), portfolios: r.portfolios,
    policyValue: Number(r.policyValue),
  }));
}

/**
 * Agent activity table. Scoped by role: Admin/GlobalAdmin see all agents;
 * Supervisor sees their own direct reports only (getDirectReportIds() —
 * the real team lookup, not the mock's hardcoded SUPERVISOR_AGENTS list);
 * Agent sees only themselves; Broker sees none.
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {{role: string, userId: string}} scope
 */
export async function getAgentReport(period, scope, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);

  if (scope.role === 'Broker') return [];

  let agentFilter = '';
  const params = {
    start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end },
    organisationId: { type: sql.UniqueIdentifier, value: organisationId },
  };
  if (scope.role === 'Agent') {
    agentFilter = 'AND u.id = @selfId';
    params.selfId = { type: sql.UniqueIdentifier, value: scope.userId };
  } else if (scope.role === 'Supervisor') {
    const reportIds = await getDirectReportIds(scope.userId);
    if (reportIds.length === 0) return [];
    agentFilter = 'AND u.id = ANY(@reportIds)';
    params.reportIds = { type: sql.NVarChar(sql.MAX), value: reportIds };
  }

  const rows = await executeQuery(
    `SELECT
       u.id, u.displayName AS "name",
       COUNT(DISTINCT l.id) AS "leads",
       COUNT(DISTINCT ca.id) AS "calls",
       COUNT(DISTINCT ca.id) FILTER (WHERE ca.outcome = 'CallbackRequested') AS "callbacks",
       COUNT(DISTINCT a.id) AS "appts"
     FROM "User" u
     LEFT JOIN Lead l ON l.assignedAgentId = u.id AND l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL
     LEFT JOIN CallAttempt ca ON ca.agentId = u.id AND ca.callTime >= @start AND ca.callTime <= @end
     LEFT JOIN Appointment a ON a.agentId = u.id AND a.createdAt >= @start AND a.createdAt <= @end
     WHERE u.role = 'Agent' AND u.isActive = true AND u.organisationId = @organisationId ${agentFilter}
     GROUP BY u.id, u.displayName
     ORDER BY u.displayName`,
    params
  );

  return rows.map(r => {
    const leads = Number(r.leads);
    const appts = Number(r.appts);
    // §153 (13 Aug 2026, Mark's decision) — same fix as
    // getAgentDetailReport() above: ratio, not a '%' string that could
    // exceed 100 for the same structural reason (a lead can get more
    // than one appointment attempt in a period).
    return {
      id: r.id, name: r.name, leads, calls: Number(r.calls),
      appts, callbacks: Number(r.callbacks),
      conversion: leads === 0 ? '0.0' : (appts / leads).toFixed(1),
    };
  });
}

// §151 (13 Aug 2026) — four new breakdown reports, Mark's explicit
// request: Leads by Source, Leads by Portfolio, Appointments by
// Portfolio, Appointments by Meeting Type. No drill-through by design
// (Mark's decision — a category like "CSVImport" or "Discovery" isn't a
// single navigable entity the way an Agent or Broker is, and doing a
// date-scoped drill-through properly would have meant adding date-range
// filtering to LeadList.jsx/AppointmentList.jsx, which he chose to skip
// rather than take on). Summary tables only.
//
// All four closed-date metrics (Closed Won/Lost counts, Avg Days to
// Close) follow the same closedAt-based scoping established in §148/149
// — a deal counts against the period it actually closed in, not when
// its lead or appointment was created. "Booked"/"Leads" counts stay
// cohort-based (created in period), matching the rest of Reports.jsx.
//
// Small shared helper below merges a COUNT-by-(group,status) result set
// and an AVG-days-by-(group,status) result set into one map per group —
// the same merge shape repeats across all four functions, pulled out
// once rather than copy-pasted four times.
//
// "Lost" MEANS status = 'ClosedLost', STRICTLY — 16 Aug 2026 (§185,
// Mark's explicit decision). This function used to fold ANY non-
// ClosedWon row into closedLost (an `else`, not an `else if`), which
// silently included ReturnedToLeads — an appointment sent back to the
// pool, not a sales rejection, explicitly called out as such when that
// status was first built (see this file's own header comment, and
// Status_Vercel.md's original §35-era note: "'ReturnedToLeads' is
// deliberately its OWN status, not folded into ClosedWon/ClosedLost —
// it's not a sales outcome, so lumping it in would skew win/loss
// reporting"). §151 built this function without that cross-reference,
// and it went unnoticed until Mark checked the raw appointment table
// directly and found zero ClosedLost rows against a report showing
// "Lost: 1" — every caller of this function inherited the same bug.
// Every WHERE clause feeding rows into this function has also been
// corrected to stop fetching ReturnedToLeads rows at all (search this
// file for '§185' to find each one) — this explicit status check is
// now closer to a second, defensive guard than the only line of
// defence, but kept explicit rather than reverted to a bare else, so a
// future caller that DOES pass a stray ReturnedToLeads row (or any
// other non-terminal status) fails safe instead of silently counting it.
function mergeClosedMetrics(countRows, avgDaysRows) {
  const map = {};
  const ensure = (key) => (map[key] ??= { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null });
  for (const row of countRows) {
    const g = ensure(row.groupKey);
    if (row.status === 'ClosedWon') g.closedWon += Number(row.count);
    else if (row.status === 'ClosedLost') g.closedLost += Number(row.count); // ReturnedToLeads deliberately excluded — see this function's own header comment (§185)
  }
  for (const row of avgDaysRows) {
    const g = ensure(row.groupKey);
    const days = row.avgDays === null ? null : Number(row.avgDays);
    if (row.status === 'ClosedWon') g.avgDaysWon = days;
    else if (row.status === 'ClosedLost') g.avgDaysLost = days;
  }
  return map;
}

/**
 * Leads by Source (Origin) — §151, corrected §155 (13 Aug 2026). First
 * pass grouped by the free-text sourceLabel (event name, subscription
 * name, or manual source string) — Mark clarified that's not what he
 * wanted at all: he wants the four ORIGIN categories (Manual entry vs
 * CSV Import vs Medical Subscription vs Event), not which specific
 * event or CSV batch a lead came from. Derived directly from which of
 * the four linkage columns is populated on the Lead row — the same
 * columns leadService.js's own sourceLabel COALESCE already reads, just
 * bucketed into categories instead of concatenated into a free-text
 * name. linkedSubscriptionId takes priority over csvImportBatchId
 * deliberately: LeadImport.jsx's "subscription" tab sets BOTH
 * (confirmed directly — see §142's own note on this), and "Medical
 * Subscription" is the more specific, more useful category for those
 * rows than a generic "Import" bucket would be.
 */
export async function getLeadsBySourceReport(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);
  const params = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const originExpr = `CASE
    WHEN l.linkedEventId IS NOT NULL THEN 'Event'
    WHEN l.linkedSubscriptionId IS NOT NULL THEN 'Medical Subscription'
    WHEN l.csvImportBatchId IS NOT NULL THEN 'Import'
    ELSE 'Manual'
  END`;

  const [leadsRows, closedCountRows, noApptClosedRows, avgDaysRows] = await Promise.all([
    executeQuery(
      `SELECT ${originExpr} AS "groupKey", COUNT(*) AS count FROM Lead l
       WHERE l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       GROUP BY ${originExpr}`, params
    ),
    executeQuery(
      `SELECT ${originExpr} AS "groupKey", a.status, COUNT(*) AS count
       FROM Appointment a JOIN Lead l ON l.id = a.leadId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY ${originExpr}, a.status`, params
    ),
    executeQuery(
      `SELECT ${originExpr} AS "groupKey", COUNT(*) AS count FROM Lead l
       WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
         AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE ax.leadId = l.id)
       GROUP BY ${originExpr}`, params
    ),
    executeQuery(
      `SELECT ${originExpr} AS "groupKey", a.status,
         AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
       FROM Appointment a JOIN Lead l ON l.id = a.leadId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY ${originExpr}, a.status`, params
    ),
  ]);
  const leadsByGroup = Object.fromEntries(leadsRows.map(r => [r.groupKey, Number(r.count)]));
  const closed = mergeClosedMetrics([...closedCountRows, ...noApptClosedRows.map(r => ({ groupKey: r.groupKey, status: 'ClosedLost', count: r.count }))], avgDaysRows);

  const allKeys = new Set([...Object.keys(leadsByGroup), ...Object.keys(closed)]);
  return [...allKeys].sort().map(source => {
    const leads = leadsByGroup[source] ?? 0;
    const c = closed[source] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
    return {
      source, leads, closedWon: c.closedWon, closedLost: c.closedLost,
      // Ratio, not '%' — same §157/§158 extension as Broker conversion
      // (14 Aug 2026), same underlying mixed-basis shape §154 fixed for
      // Agent booking rate.
      conversion: leads === 0 ? '0.0' : (c.closedWon / leads).toFixed(1),
      avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost,
    };
  });
}

/**
 * Leads by Portfolio — §151. Same shape as by-Source, but Portfolio is
 * multi-valued (LeadPortfolio for the cohort, AppointmentPortfolio for
 * closed metrics) — a lead or appointment tagged with two portfolios
 * contributes to both portfolios' rows, matching this app's established
 * "not limited to one portfolio" treatment everywhere else (§41, §45).
 * COUNT(DISTINCT ...) throughout to guard against the LeadPortfolio/
 * AppointmentPortfolio join fan-out this project has been bitten by
 * before (see Status_Vercel.md's own documented SQL fan-out lesson).
 */
export async function getLeadsByPortfolioReport(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);
  const params = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  const [leadsRows, closedCountRows, noApptClosedRows, avgDaysRows] = await Promise.all([
    executeQuery(
      `SELECT p.name AS "groupKey", COUNT(DISTINCT l.id) AS count
       FROM Lead l JOIN LeadPortfolio lp ON lp.leadId = l.id JOIN Portfolio p ON p.id = lp.portfolioId
       WHERE l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       GROUP BY p.name`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", a.status, COUNT(DISTINCT a.id) AS count
       FROM Appointment a JOIN AppointmentPortfolio ap ON ap.appointmentId = a.id JOIN Portfolio p ON p.id = ap.portfolioId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name, a.status`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", COUNT(DISTINCT l.id) AS count
       FROM Lead l JOIN LeadPortfolio lp ON lp.leadId = l.id JOIN Portfolio p ON p.id = lp.portfolioId
       WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
         AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE ax.leadId = l.id)
       GROUP BY p.name`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", a.status,
         AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
       FROM Appointment a JOIN AppointmentPortfolio ap ON ap.appointmentId = a.id JOIN Portfolio p ON p.id = ap.portfolioId
       JOIN Lead l ON l.id = a.leadId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name, a.status`, params
    ),
  ]);
  const leadsByGroup = Object.fromEntries(leadsRows.map(r => [r.groupKey, Number(r.count)]));
  const closed = mergeClosedMetrics([...closedCountRows, ...noApptClosedRows.map(r => ({ groupKey: r.groupKey, status: 'ClosedLost', count: r.count }))], avgDaysRows);

  const allKeys = new Set([...Object.keys(leadsByGroup), ...Object.keys(closed)]);
  return [...allKeys].sort().map(portfolio => {
    const leads = leadsByGroup[portfolio] ?? 0;
    const c = closed[portfolio] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
    return {
      portfolio, leads, closedWon: c.closedWon, closedLost: c.closedLost,
      // Ratio, not '%' — §157/§158 extension (14 Aug 2026), same reasoning
      // as Leads by Source just above.
      conversion: leads === 0 ? '0.0' : (c.closedWon / leads).toFixed(1),
      avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost,
    };
  });
}

/**
 * Appointments by Portfolio — §151. Appointment-centric rather than
 * Lead-centric: "booked" is the appointment's own createdAt (matches
 * "Appts booked" semantics used everywhere else in this file), closed
 * metrics are closedAt-scoped as usual. Avg policy value added — the
 * one metric unique to Appointments among the four new reports, since
 * policy value only exists at the appointment/product level. The
 * per-appointment total is computed once via a LATERAL scalar subquery
 * BEFORE joining AppointmentPortfolio, specifically to avoid a double
 * fan-out (AppointmentPortfolio rows x AppointmentProduct rows) that a
 * direct join of both multi-valued tables would cause — same class of
 * bug this project's own documented SQL fan-out lesson warns about.
 */
export async function getAppointmentsByPortfolioReport(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);
  const params = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  const [bookedRows, closedCountRows, avgDaysRows, avgPolicyRows] = await Promise.all([
    executeQuery(
      `SELECT p.name AS "groupKey", COUNT(DISTINCT a.id) AS count
       FROM Appointment a JOIN AppointmentPortfolio ap ON ap.appointmentId = a.id JOIN Portfolio p ON p.id = ap.portfolioId
       WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", a.status, COUNT(DISTINCT a.id) AS count
       FROM Appointment a JOIN AppointmentPortfolio ap ON ap.appointmentId = a.id JOIN Portfolio p ON p.id = ap.portfolioId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name, a.status`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", a.status,
         AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
       FROM Appointment a JOIN AppointmentPortfolio ap ON ap.appointmentId = a.id JOIN Portfolio p ON p.id = ap.portfolioId
       JOIN Lead l ON l.id = a.leadId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name, a.status`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", AVG(av.total) AS "avgPolicyValue"
       FROM Appointment a
       JOIN AppointmentPortfolio ap ON ap.appointmentId = a.id
       JOIN Portfolio p ON p.id = ap.portfolioId
       CROSS JOIN LATERAL (SELECT COALESCE(SUM(pr.policyValue), 0) AS total FROM AppointmentProduct pr WHERE pr.appointmentId = a.id) av
       WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name`, params
    ),
  ]);
  const bookedByGroup = Object.fromEntries(bookedRows.map(r => [r.groupKey, Number(r.count)]));
  const closed = mergeClosedMetrics(closedCountRows, avgDaysRows);
  const avgPolicyByGroup = Object.fromEntries(avgPolicyRows.map(r => [r.groupKey, r.avgPolicyValue === null ? null : Number(r.avgPolicyValue)]));

  const allKeys = new Set([...Object.keys(bookedByGroup), ...Object.keys(closed)]);
  return [...allKeys].sort().map(portfolio => {
    const booked = bookedByGroup[portfolio] ?? 0;
    const c = closed[portfolio] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
    return {
      portfolio, booked, closedWon: c.closedWon, closedLost: c.closedLost,
      // Ratio, not '%' — §157/§158 extension (14 Aug 2026), same reasoning
      // as the two Leads-based breakdown reports above (booked-scoped
      // denominator here instead of leads-scoped, same >100%-possible
      // characteristic).
      conversion: booked === 0 ? '0.0' : (c.closedWon / booked).toFixed(1),
      avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost,
      avgPolicyValueWon: avgPolicyByGroup[portfolio] ?? null,
    };
  });
}

/**
 * Appointments by Meeting Type (In Person vs Virtual) — §151. The
 * simplest of the four: meetingType is a single-value column directly
 * on Appointment (§140d), no junction table, no fan-out risk at all.
 * Same metric set as Appointments by Portfolio, including avg policy
 * value.
 */
export async function getAppointmentsByMeetingTypeReport(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);
  const params = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  const [bookedRows, closedCountRows, avgDaysRows, avgPolicyRows] = await Promise.all([
    executeQuery(
      `SELECT meetingType AS "groupKey", COUNT(*) AS count FROM Appointment
       WHERE createdAt >= @start AND createdAt <= @end AND organisationId = @organisationId
       GROUP BY meetingType`, params
    ),
    executeQuery(
      `SELECT meetingType AS "groupKey", status, COUNT(*) AS count FROM Appointment
       WHERE status IN ('ClosedWon', 'ClosedLost') AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId
       GROUP BY meetingType, status`, params
    ),
    executeQuery(
      `SELECT a.meetingType AS "groupKey", a.status,
         AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
       FROM Appointment a JOIN Lead l ON l.id = a.leadId
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY a.meetingType, a.status`, params
    ),
    executeQuery(
      `SELECT a.meetingType AS "groupKey", AVG(av.total) AS "avgPolicyValue"
       FROM Appointment a
       CROSS JOIN LATERAL (SELECT COALESCE(SUM(pr.policyValue), 0) AS total FROM AppointmentProduct pr WHERE pr.appointmentId = a.id) av
       WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY a.meetingType`, params
    ),
  ]);
  const bookedByGroup = Object.fromEntries(bookedRows.map(r => [r.groupKey, Number(r.count)]));
  const closed = mergeClosedMetrics(closedCountRows, avgDaysRows);
  const avgPolicyByGroup = Object.fromEntries(avgPolicyRows.map(r => [r.groupKey, r.avgPolicyValue === null ? null : Number(r.avgPolicyValue)]));

  const allKeys = new Set([...Object.keys(bookedByGroup), ...Object.keys(closed)]);
  return [...allKeys].sort().map(meetingType => {
    const booked = bookedByGroup[meetingType] ?? 0;
    const c = closed[meetingType] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
    return {
      meetingType, booked, closedWon: c.closedWon, closedLost: c.closedLost,
      // Ratio, not '%' — §157/§158 extension (14 Aug 2026), completes the
      // set (last of the four §151 breakdown reports + Broker conversion).
      conversion: booked === 0 ? '0.0' : (c.closedWon / booked).toFixed(1),
      avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost,
      avgPolicyValueWon: avgPolicyByGroup[meetingType] ?? null,
    };
  });
}

/**
 * Closed Won by Product — §155 (13 Aug 2026), Mark's explicit request,
 * new cut not covered by any of §151's four reports. "Which products
 * actually get sold when we win a deal" — distinct from Appointments by
 * Portfolio, which shows deal volume, not product mix within those
 * deals. No fan-out risk: each row of AppointmentProduct already IS one
 * product association, the natural grain for "how many of this product
 * did we sell" — no junction-table multiplication like the Portfolio
 * reports have to guard against.
 */
export async function getClosedWonByProductReport(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);

  const rows = await executeQuery(
    `SELECT p.name AS "product", COUNT(*) AS "count", COALESCE(SUM(ap.policyValue), 0) AS "totalValue"
     FROM AppointmentProduct ap
     JOIN Appointment a ON a.id = ap.appointmentId
     JOIN Product p ON p.id = ap.productId
     WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
     GROUP BY p.name
     ORDER BY "totalValue" DESC`,
    { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  return rows.map(r => ({ product: r.product, count: Number(r.count), totalValue: Number(r.totalValue) }));
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS PAGE — FULL GROUND-UP REDESIGN — 14 Aug 2026 (§156 external brief,
// §162 build). getDashboardData() is the single new endpoint backing the
// rebuilt page. Per the brief's own Step 1 ("do not create duplicate
// infrastructure that already exists"), this REUSES rather than reimplements
// wherever a §148-155 query already does the job correctly:
//   - getReportSummary() — pipeline breakdown, called once for the current
//     period to source Pipeline Health's stage counts.
//   - getLeadsBySourceReport() — called as-is, then supplemented with two
//     small new queries (appointments, policy value per source) rather than
//     rewritten, since the brief's own Lead Source table needs those two
//     extra columns this existing function was never asked to carry.
//   - getAppointmentsByPortfolioReport() — used UNCHANGED as the Portfolio
//     Performance table's data source; its existing shape (booked/closedWon/
//     closedLost/conversion/avgPolicyValueWon) already IS the "one
//     visualisation, not a donut-plus-bar pair" the brief asks for — this
//     needed a presentation change, not a new query.
//   - getAppointmentsByMeetingTypeReport() — used UNCHANGED as Appointment
//     Analysis's meeting-type comparison table.
// New code below is only what genuinely didn't exist yet: period-over-period
// KPI deltas, an extended multi-series trend, stage-to-stage pipeline
// conversion, and the insights rules.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prior-period range for period-over-period comparison. Deliberately the
 * full CALENDAR prior period (last month/quarter/year), not a trailing
 * same-duration window ending yesterday — matches how Stripe/Linear-style
 * dashboards frame "vs last period" (the brief's own named reference
 * points), and reuses getPeriodRange() unmodified rather than needing new
 * range-calculation logic: shifting referenceDate back one period unit
 * before calling it means getPeriodRange's own isCurrent check naturally
 * returns false, giving the shifted period's real full end date rather
 * than truncating at today.
 */
export function getPriorPeriodRange(period, referenceDate = new Date()) {
  const shifted = new Date(referenceDate);
  if (period === 'Monthly') shifted.setMonth(shifted.getMonth() - 1);
  else if (period === 'Quarterly') shifted.setMonth(shifted.getMonth() - 3);
  else shifted.setFullYear(shifted.getFullYear() - 1);
  return getPeriodRange(period, shifted);
}

// Named fragment, not duplicated inline — was copy-pasted in two places
// before filters existed (Lead Source table, and now the source filter
// itself would have been a third copy to keep in sync by hand).
function originExprFor(alias) {
  return `CASE
    WHEN ${alias}.linkedEventId IS NOT NULL THEN 'Event'
    WHEN ${alias}.linkedSubscriptionId IS NOT NULL THEN 'Medical Subscription'
    WHEN ${alias}.csvImportBatchId IS NOT NULL THEN 'Import'
    ELSE 'Manual'
  END`;
}

/**
 * Filter/scope clause + params for a LEAD-level query (alias `l`, default).
 * portfolio -> LeadPortfolio; source -> the origin CASE; Supervisor scope
 * (reportIds resolved once by the caller, not re-resolved per query) ->
 * assignedAgentId. Deliberately NO brokerId support here — a Lead has no
 * broker until an Appointment exists; a brokerId filter only means
 * something at the appointment level (apptFilterSql, below).
 */
function leadFilterSql({ portfolio, source, reportIds }, alias = 'l') {
  const clauses = [];
  const params = {};
  if (portfolio) {
    clauses.push(`EXISTS (SELECT 1 FROM LeadPortfolio flp JOIN Portfolio fpf ON fpf.id = flp.portfolioId WHERE flp.leadId = ${alias}.id AND fpf.name = @filterPortfolio)`);
    params.filterPortfolio = { type: sql.NVarChar(200), value: portfolio };
  }
  if (source) {
    clauses.push(`(${originExprFor(alias)}) = @filterSource`);
    params.filterSource = { type: sql.NVarChar(50), value: source };
  }
  if (reportIds) {
    clauses.push(`${alias}.assignedAgentId = ANY(@filterReportIds)`);
    params.filterReportIds = { type: sql.NVarChar(sql.MAX), value: reportIds };
  }
  return { sqlFragment: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
}

/**
 * Filter/scope clause + params for an APPOINTMENT-level query (alias `a`,
 * with Lead already joined as `leadAlias` — every call site below already
 * joins Lead for some other reason, e.g. avgDaysToClose needs l.createdAt,
 * so the source filter never forces a NEW join anywhere it wasn't already
 * present). Safe to merge this function's params with leadFilterSql's own
 * in the same query (e.g. the trend loop's UNION ALL, which has both a
 * Lead-only branch and Appointment branches) — both derive from the same
 * `filters` object, so a shared param name always carries an identical
 * value from either side; nothing to collide.
 */
function apptFilterSql({ brokerId, portfolio, source, reportIds }, alias = 'a', leadAlias = 'l') {
  const clauses = [];
  const params = {};
  if (brokerId) {
    clauses.push(`${alias}.brokerId = @filterBrokerId`);
    params.filterBrokerId = { type: sql.UniqueIdentifier, value: brokerId };
  }
  if (portfolio) {
    clauses.push(`EXISTS (SELECT 1 FROM AppointmentPortfolio fap JOIN Portfolio fpf2 ON fpf2.id = fap.portfolioId WHERE fap.appointmentId = ${alias}.id AND fpf2.name = @filterPortfolio)`);
    params.filterPortfolio = { type: sql.NVarChar(200), value: portfolio };
  }
  if (source) {
    clauses.push(`(${originExprFor(leadAlias)}) = @filterSource`);
    params.filterSource = { type: sql.NVarChar(50), value: source };
  }
  if (reportIds) {
    clauses.push(`${alias}.agentId = ANY(@filterReportIds)`);
    params.filterReportIds = { type: sql.NVarChar(sql.MAX), value: reportIds };
  }
  return { sqlFragment: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
}

/**
 * Core KPI totals for one date range, now filter/scope-aware — was
 * previously (start, end, organisationId) only; filters added 14 Aug
 * 2026 (§163) rather than left as a follow-up, since the executive
 * summary is the first thing on the page every filter needs to affect.
 */
async function getPeriodKpiTotals(start, end, organisationId, filters = {}) {
  const baseParams = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const leadF = leadFilterSql(filters);
  const apptF = apptFilterSql(filters);
  const [leadsRows, apptsRows, closedRows, policyRows, daysRows] = await Promise.all([
    executeQuery(`SELECT COUNT(*) AS count FROM Lead l WHERE l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId${leadF.sqlFragment}`, { ...baseParams, ...leadF.params }),
    executeQuery(`SELECT COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}`, { ...baseParams, ...apptF.params }),
    executeQuery(`SELECT COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}`, { ...baseParams, ...apptF.params }),
    executeQuery(`SELECT COALESCE(SUM(ap.policyValue), 0) AS total FROM AppointmentProduct ap JOIN Appointment a ON a.id = ap.appointmentId JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}`, { ...baseParams, ...apptF.params }),
    executeQuery(`SELECT AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays" FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}`, { ...baseParams, ...apptF.params }),
  ]);
  const leads = Number(leadsRows[0].count);
  const appts = Number(apptsRows[0].count);
  const closedWon = Number(closedRows[0].count);
  const totalPolicyValue = Number(policyRows[0].total);
  const avgDaysToCloseWon = daysRows[0].avgDays === null ? null : Number(daysRows[0].avgDays);
  const conversion = leads === 0 ? 0 : closedWon / leads;
  return { leads, appts, closedWon, totalPolicyValue, avgDaysToCloseWon, conversion };
}

/**
 * % change + direction between a current and prior value. `lowerIsBetter`
 * flips the colour semantics the frontend applies (a DROP in Avg Days to
 * Close is the good direction) without needing two separate delta
 * functions — the sign of the underlying number is unaffected, only how
 * the frontend colours it.
 */
export function computeDelta(current, prior) {
  if (current === null || prior === null || prior === undefined) return { deltaPct: null, direction: 'flat' };
  if (prior === 0) {
    if (current === 0) return { deltaPct: 0, direction: 'flat' };
    return { deltaPct: null, direction: 'up' }; // can't compute a % off a zero base — direction only
  }
  const deltaPct = Math.round(((current - prior) / prior) * 1000) / 10;
  return { deltaPct, direction: deltaPct > 0.05 ? 'up' : deltaPct < -0.05 ? 'down' : 'flat' };
}

/**
 * Rule-based insights — GENERATED FROM REAL DATA ONLY, per the brief's
 * explicit instruction not to fabricate a pattern that isn't really there.
 * Each rule has a minimum-sample-size gate so a 1-lead source can't produce
 * a misleading "100% conversion" headline. Returns [] (not a placeholder
 * insight) if nothing clears the bar — the frontend shows an honest
 * "not enough data yet" state rather than an empty gap.
 */
function generateInsights({ sourceTable, portfolioTable, kpis }) {
  const insights = [];
  const totalLeads = sourceTable.reduce((sum, r) => sum + r.leads, 0);
  const totalWon = sourceTable.reduce((sum, r) => sum + r.closedWon, 0);

  // Source share-of-volume vs share-of-wins, minimum 5 leads and 1 win in
  // that source so a single lucky deal doesn't read as a trend.
  if (totalLeads > 0 && totalWon > 0) {
    for (const row of sourceTable) {
      if (row.leads < 5 || row.closedWon < 1) continue;
      const volumeShare = row.leads / totalLeads;
      const winShare = row.closedWon / totalWon;
      if (winShare - volumeShare >= 0.15) {
        insights.push(`${row.source} leads are ${Math.round(volumeShare * 100)}% of volume but ${Math.round(winShare * 100)}% of policies won.`);
      } else if (volumeShare - winShare >= 0.20 && row.leads >= 10) {
        insights.push(`${row.source} leads are ${Math.round(volumeShare * 100)}% of volume but only ${Math.round(winShare * 100)}% of policies won.`);
      }
    }
  }

  // Same comparison, one level down, for Portfolio — same gates.
  const totalPortfolioAppts = portfolioTable.reduce((sum, r) => sum + r.booked, 0);
  const totalPortfolioWon = portfolioTable.reduce((sum, r) => sum + r.closedWon, 0);
  if (totalPortfolioAppts > 0 && totalPortfolioWon > 0) {
    for (const row of portfolioTable) {
      if (row.booked < 5 || row.closedWon < 1) continue;
      const volumeShare = row.booked / totalPortfolioAppts;
      const winShare = row.closedWon / totalPortfolioWon;
      if (winShare - volumeShare >= 0.15) {
        insights.push(`${row.portfolio} is ${Math.round(volumeShare * 100)}% of appointments but ${Math.round(winShare * 100)}% of policies won.`);
      }
    }
  }

  // Period-over-period conversion swing, only worth surfacing if the
  // underlying counts are large enough that the swing isn't just noise.
  const convKpi = kpis.find(k => k.key === 'conversion');
  if (convKpi && convKpi.deltaPct !== null && Math.abs(convKpi.deltaPct) >= 20) {
    const direction = convKpi.deltaPct > 0 ? 'up' : 'down';
    insights.push(`Conversion Ratio is ${direction} ${Math.abs(convKpi.deltaPct)}% on last period.`);
  }

  return insights;
}

/**
 * The single endpoint backing the rebuilt Reports page — GET
 * /api/reports/dashboard. Composes: executive-summary KPIs (current +
 * prior period, real deltas), an extended multi-series trend, pipeline
 * health with stage-to-stage conversion, the Lead Source and Portfolio
 * performance tables, a policy value breakdown, Won vs Lost (with loss
 * reasons where captured), appointment analysis, and generated insights.
 *
 * FILTERS + SCOPE added 14 Aug 2026 (§163), same session as the initial
 * build — Mark asked for all three previously-flagged gaps built
 * straight through. This REVERSES the earlier reuse-over-rebuild choice
 * for three of the previously-reused functions (getReportSummary,
 * getLeadsBySourceReport, getAppointmentsByPortfolioReport,
 * getAppointmentsByMeetingTypeReport all called here UNFILTERED before) —
 * none of those functions accept a filter/scope parameter, and adding one
 * would change behaviour for their own standalone /api/reports/* routes
 * too, which this rebuild's frontend no longer calls but which still
 * exist and still work unfiltered for whatever else might call them.
 * Filtered/scoped equivalents are inlined directly below instead — some
 * SQL is genuinely duplicated as a result (the pipeline cohort query in
 * particular mirrors getReportSummary's own), a real, considered
 * trade-off, not an oversight of the earlier "reuse, don't rebuild"
 * principle.
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {Date} [referenceDate]
 * @param {{role: string, userId: string}} [scope] - Supervisor gets
 *   scoped to their own direct reports (leads via assignedAgentId,
 *   appointments via agentId); Admin/GlobalAdmin/Agent/Broker are
 *   unaffected (Agent/Broker never reach this endpoint's org-wide view —
 *   the frontend skips the call entirely for self-view roles). Broker
 *   Performance (fetched separately by the frontend via the existing
 *   getBrokerReport) deliberately stays org-wide for Supervisor too,
 *   matching that function's own long-standing, deliberate behaviour —
 *   not a new inconsistency introduced here.
 * @param {{brokerId?: string, portfolio?: string, source?: string}} [filters]
 *   - the toolbar's three filters. portfolio/source are the same NAME-
 *   based values used everywhere else in this app (not IDs) — matches
 *   AppointmentListQuerySchema's own existing convention. brokerId is a
 *   UUID, same convention. All three optional; omitting all three
 *   reproduces the original unfiltered behaviour exactly.
 */
export async function getDashboardData(period, referenceDate = new Date(), scope = null, filters = {}) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);
  const { start: priorStart, end: priorEnd } = getPriorPeriodRange(period, referenceDate);

  // Resolved ONCE here, not per-query — every filter-aware query below
  // takes the already-resolved array via filters.reportIds, matching how
  // getAgentReport/getBrokerReport already receive a `scope` object
  // rather than re-deriving anything themselves.
  const reportIds = scope?.role === 'Supervisor' ? await getDirectReportIds(scope.userId) : null;
  const f = { ...filters, reportIds };

  const [current, prior, meetingTypeTable] = await Promise.all([
    getPeriodKpiTotals(start, end, organisationId, f),
    getPeriodKpiTotals(priorStart, priorEnd, organisationId, f),
    // Meeting Type has no portfolio/source dimension of its own worth
    // filtering by in addition to what's already page-level — reused
    // inline query below instead of the standalone function, same
    // reasoning as source/portfolio tables.
    (async () => {
      const apptF = apptFilterSql(f);
      const params = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
      const [bookedRows, closedCountRows, avgDaysRows] = await Promise.all([
        executeQuery(`SELECT a.meetingType AS "groupKey", COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment} GROUP BY a.meetingType`, { ...params, ...apptF.params }),
        executeQuery(`SELECT a.meetingType AS "groupKey", a.status, COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment} GROUP BY a.meetingType, a.status`, { ...params, ...apptF.params }),
        executeQuery(`SELECT a.meetingType AS "groupKey", a.status, AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays" FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment} GROUP BY a.meetingType, a.status`, { ...params, ...apptF.params }),
      ]);
      const booked = Object.fromEntries(bookedRows.map(r => [r.groupKey, Number(r.count)]));
      const closed = mergeClosedMetrics(closedCountRows, avgDaysRows);
      const allKeys = new Set([...Object.keys(booked), ...Object.keys(closed)]);
      return [...allKeys].sort().map(meetingType => {
        const b = booked[meetingType] ?? 0;
        const c = closed[meetingType] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
        return { meetingType, booked: b, closedWon: c.closedWon, closedLost: c.closedLost, conversion: b === 0 ? '0.0' : (c.closedWon / b).toFixed(1), avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost };
      });
    })(),
  ]);

  // ── Executive summary — 6 KPIs, not all 8+ possible ones, per the
  // brief's own "prioritise, don't show everything" instruction. Active
  // Brokers and Avg Days to Close (Lost) are still real numbers elsewhere
  // on the page (Broker table, Won vs Lost section) rather than dropped.
  const kpis = [
    { key: 'leads',             label: 'Total Leads',            format: 'count',    current: current.leads,             prior: prior.leads,             ...computeDelta(current.leads, prior.leads) },
    { key: 'appts',             label: 'Appointments Booked',    format: 'count',    current: current.appts,             prior: prior.appts,             ...computeDelta(current.appts, prior.appts) },
    { key: 'closedWon',         label: 'Closed Won',             format: 'count',    current: current.closedWon,         prior: prior.closedWon,         ...computeDelta(current.closedWon, prior.closedWon) },
    { key: 'conversion',        label: 'Conversion Ratio',       format: 'ratio',    current: current.conversion,        prior: prior.conversion,        ...computeDelta(current.conversion, prior.conversion) },
    { key: 'policyValue',       label: 'Total Policy Value',     format: 'currency', current: current.totalPolicyValue,  prior: prior.totalPolicyValue,  ...computeDelta(current.totalPolicyValue, prior.totalPolicyValue) },
    { key: 'avgDaysToCloseWon', label: 'Avg Days to Close (Won)', format: 'days',    current: current.avgDaysToCloseWon, prior: prior.avgDaysToCloseWon, lowerIsBetter: true, ...computeDelta(current.avgDaysToCloseWon, prior.avgDaysToCloseWon) },
  ];

  // ── Trend — two queries per bucket (four counts via UNION ALL, one
  // policy-value sum needing its own JOIN), same "simpler than dynamic
  // date-bucketing SQL at this scale" reasoning getTrendBuckets() itself
  // already documents. Filter/scope-aware — leadF and apptF params are
  // safely merged into one params object for the UNION ALL query (see
  // apptFilterSql's own doc comment on why that's safe).
  const buckets = getTrendBuckets(period, referenceDate);
  const trend = [];
  for (const b of buckets) {
    if (b.future) { trend.push({ label: b.label, leads: 0, appts: 0, won: 0, lost: 0, policyValue: 0 }); continue; }
    const params = { start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
    const leadF = leadFilterSql(f);
    const apptF = apptFilterSql(f);
    const [countRows, policyRows] = await Promise.all([
      executeQuery(
        `SELECT 'leads' AS metric, COUNT(*) AS count FROM Lead l WHERE l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId${leadF.sqlFragment}
         UNION ALL
         SELECT 'appts', COUNT(*) FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}
         UNION ALL
         SELECT 'won', COUNT(*) FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}
         UNION ALL
         SELECT 'lost', COUNT(*) FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedLost' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}`,
        { ...params, ...leadF.params, ...apptF.params }
      ),
      executeQuery(
        `SELECT COALESCE(SUM(ap.policyValue), 0) AS total FROM AppointmentProduct ap JOIN Appointment a ON a.id = ap.appointmentId JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF.sqlFragment}`,
        { ...params, ...apptF.params }
      ),
    ]);
    const byMetric = Object.fromEntries(countRows.map(r => [r.metric, Number(r.count)]));
    trend.push({
      label: b.label,
      leads: byMetric.leads ?? 0, appts: byMetric.appts ?? 0,
      won: byMetric.won ?? 0, lost: byMetric.lost ?? 0,
      policyValue: Number(policyRows[0].total),
    });
  }

  // ── Pipeline health — inlined, filter/scope-aware version of
  // getReportSummary()'s own §148 cohort+snapshot query (that function
  // itself stays unfiltered, unchanged, for its own standalone route).
  // The no-appointment 'Closed' path (a lead closed via call outcome,
  // never got an appointment) is SKIPPED ENTIRELY when brokerId is set —
  // by definition, a lead that never reached an appointment never
  // touched any broker, so it can't correctly match a broker filter;
  // including it unfiltered there would have been a real, silent
  // correctness bug, not just an inconsistency.
  const leadF2 = leadFilterSql(f);
  const apptF2 = apptFilterSql(f);
  const baseParams2 = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const noApptClosedBranch = f.brokerId ? '' : `
     UNION ALL
     SELECT 'ClosedLost' AS bucket, COUNT(*) AS count FROM Lead l
     WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end
       AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE ax.leadId = l.id)${leadF2.sqlFragment}`;
  const [cohortRows, closedRowsPipeline] = await Promise.all([
    executeQuery(
      `SELECT
         CASE
           WHEN l.pipelineStatus = 'Unassigned' THEN 'Unassigned'
           WHEN l.pipelineStatus = 'Assigned'   THEN 'Assigned'
           WHEN l.pipelineStatus = 'InProgress' THEN 'InProgress'
           WHEN l.pipelineStatus = 'AppointmentScheduled' AND ap.status NOT IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads')
             THEN 'AppointmentBooked'
           ELSE NULL
         END AS bucket,
         COUNT(*) AS count
       FROM Lead l
       LEFT JOIN LATERAL (
         SELECT status FROM Appointment WHERE leadId = l.id ORDER BY createdAt DESC LIMIT 1
       ) ap ON true
       WHERE l.createdAt >= @start AND l.createdAt <= @end
         AND l.deletedAt IS NULL AND l.organisationId = @organisationId${leadF2.sqlFragment}
       GROUP BY bucket`,
      { ...baseParams2, ...leadF2.params }
    ),
    executeQuery(
      `SELECT 'ClosedWon' AS bucket, COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId
       WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF2.sqlFragment}
       UNION ALL
       SELECT 'ClosedLost' AS bucket, COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId
       WHERE a.status = 'ClosedLost' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF2.sqlFragment}${noApptClosedBranch}`,
      { ...baseParams2, ...apptF2.params, ...leadF2.params }
    ),
  ]);
  const pipelineCounts = Object.fromEntries(cohortRows.filter(r => r.bucket).map(r => [r.bucket, Number(r.count)]));
  for (const row of closedRowsPipeline) {
    pipelineCounts[row.bucket] = (pipelineCounts[row.bucket] ?? 0) + Number(row.count);
  }
  const pipeline = [
    { status: 'Unassigned',          count: pipelineCounts.Unassigned ?? 0 },
    { status: 'Assigned',            count: pipelineCounts.Assigned ?? 0 },
    { status: 'In Progress',         count: pipelineCounts.InProgress ?? 0 },
    { status: 'Appointment Booked',  count: pipelineCounts.AppointmentBooked ?? 0 },
    { status: 'Closed Won',          count: pipelineCounts.ClosedWon ?? 0 },
    { status: 'Closed Lost',         count: pipelineCounts.ClosedLost ?? 0 },
  ];
  const stageConversion = [];
  for (let i = 0; i < 3; i++) {
    const from = pipeline[i], to = pipeline[i + 1];
    stageConversion.push({ from: from.status, to: to.status, ratio: from.count === 0 ? null : Math.round((to.count / from.count) * 100) / 100 });
  }

  // ── Lead Source table — inlined, filter/scope-aware (getLeadsBySourceReport
  // itself stays unfiltered for its own standalone route). Same shape as
  // that function's own output, plus the two extra columns (appointments,
  // policy value) the brief's table needs.
  const leadF3 = leadFilterSql(f);
  const apptF3 = apptFilterSql(f);
  const srcParams = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const originExprL = originExprFor('l');
  const [srcLeadsRows, srcClosedCountRows, srcNoApptClosedRows, srcAvgDaysRows, srcApptsRows, srcPolicyRows] = await Promise.all([
    executeQuery(`SELECT ${originExprL} AS "groupKey", COUNT(*) AS count FROM Lead l WHERE l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId${leadF3.sqlFragment} GROUP BY ${originExprL}`, { ...srcParams, ...leadF3.params }),
    executeQuery(`SELECT ${originExprL} AS "groupKey", a.status, COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF3.sqlFragment} GROUP BY ${originExprL}, a.status`, { ...srcParams, ...apptF3.params }),
    f.brokerId ? Promise.resolve([]) : executeQuery(`SELECT ${originExprL} AS "groupKey", COUNT(*) AS count FROM Lead l WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE ax.leadId = l.id)${leadF3.sqlFragment} GROUP BY ${originExprL}`, { ...srcParams, ...leadF3.params }),
    executeQuery(`SELECT ${originExprL} AS "groupKey", a.status, AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays" FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF3.sqlFragment} GROUP BY ${originExprL}, a.status`, { ...srcParams, ...apptF3.params }),
    executeQuery(`SELECT ${originExprL} AS "groupKey", COUNT(*) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId${apptF3.sqlFragment} GROUP BY ${originExprL}`, { ...srcParams, ...apptF3.params }),
    executeQuery(`SELECT ${originExprL} AS "groupKey", COALESCE(SUM(ap.policyValue), 0) AS total FROM AppointmentProduct ap JOIN Appointment a ON a.id = ap.appointmentId JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF3.sqlFragment} GROUP BY ${originExprL}`, { ...srcParams, ...apptF3.params }),
  ]);
  const srcLeadsByGroup = Object.fromEntries(srcLeadsRows.map(r => [r.groupKey, Number(r.count)]));
  const srcClosed = mergeClosedMetrics([...srcClosedCountRows, ...srcNoApptClosedRows.map(r => ({ groupKey: r.groupKey, status: 'ClosedLost', count: r.count }))], srcAvgDaysRows);
  const srcAppts = Object.fromEntries(srcApptsRows.map(r => [r.groupKey, Number(r.count)]));
  const srcPolicy = Object.fromEntries(srcPolicyRows.map(r => [r.groupKey, Number(r.total)]));
  const srcAllKeys = new Set([...Object.keys(srcLeadsByGroup), ...Object.keys(srcClosed), ...Object.keys(srcAppts)]);
  const sourceTable = [...srcAllKeys].sort().map(source => {
    const leads = srcLeadsByGroup[source] ?? 0;
    const c = srcClosed[source] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
    return {
      source, leads, appointments: srcAppts[source] ?? 0,
      closedWon: c.closedWon, closedLost: c.closedLost,
      conversion: leads === 0 ? '0.0' : (c.closedWon / leads).toFixed(1),
      policyValue: srcPolicy[source] ?? 0,
    };
  });

  // ── Portfolio Performance table — inlined, filter/scope-aware version
  // of getAppointmentsByPortfolioReport(). COUNT(DISTINCT ...) throughout,
  // same fan-out guard that function's own header comment documents (a
  // multi-portfolio appointment must not multiply its counts).
  const apptF4 = apptFilterSql(f);
  const portParams = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const [portBookedRows, portClosedCountRows, portAvgDaysRows, portAvgPolicyRows] = await Promise.all([
    executeQuery(`SELECT p.name AS "groupKey", COUNT(DISTINCT a.id) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId JOIN AppointmentPortfolio ap2 ON ap2.appointmentId = a.id JOIN Portfolio p ON p.id = ap2.portfolioId WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId${apptF4.sqlFragment} GROUP BY p.name`, { ...portParams, ...apptF4.params }),
    executeQuery(`SELECT p.name AS "groupKey", a.status, COUNT(DISTINCT a.id) AS count FROM Appointment a JOIN Lead l ON l.id = a.leadId JOIN AppointmentPortfolio ap2 ON ap2.appointmentId = a.id JOIN Portfolio p ON p.id = ap2.portfolioId WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF4.sqlFragment} GROUP BY p.name, a.status`, { ...portParams, ...apptF4.params }),
    executeQuery(`SELECT p.name AS "groupKey", a.status, AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays" FROM Appointment a JOIN Lead l ON l.id = a.leadId JOIN AppointmentPortfolio ap2 ON ap2.appointmentId = a.id JOIN Portfolio p ON p.id = ap2.portfolioId WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF4.sqlFragment} GROUP BY p.name, a.status`, { ...portParams, ...apptF4.params }),
    executeQuery(`SELECT p.name AS "groupKey", AVG(prodTotals.total) AS "avgValue" FROM Portfolio p JOIN AppointmentPortfolio ap2 ON ap2.portfolioId = p.id JOIN Appointment a ON a.id = ap2.appointmentId JOIN Lead l ON l.id = a.leadId JOIN LATERAL (SELECT COALESCE(SUM(ap3.policyValue), 0) AS total FROM AppointmentProduct ap3 WHERE ap3.appointmentId = a.id) prodTotals ON true WHERE a.status = 'ClosedWon' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF4.sqlFragment} GROUP BY p.name`, { ...portParams, ...apptF4.params }),
  ]);
  const portBooked = Object.fromEntries(portBookedRows.map(r => [r.groupKey, Number(r.count)]));
  // Bug found 21 Aug 2026 (Mark, live testing), same root cause and same
  // fix shape as regionNoApptRows above — see that comment for the full
  // account. Portfolio-specific design point: a Lead closed this way was
  // never linked to a portfolio via AppointmentPortfolio (there's no
  // Appointment), but may still carry portfolio INTEREST via LeadPortfolio
  // (captured at Lead creation, independent of ever booking anything).
  // LEFT JOIN so a Lead with zero LeadPortfolio rows falls into 'Not
  // captured' (p.name is NULL), same honest-labelling convention as
  // region; a Lead with MULTIPLE portfolio interests fans out to
  // contribute to each one's count. That fan-out is a deliberate
  // extension of the exact same behaviour portClosedCountRows above
  // already has for real closed appointments spanning multiple
  // portfolios (COUNT(DISTINCT a.id), GROUP BY p.name — the same
  // appointment legitimately appears in more than one portfolio's row) —
  // not a new inconsistency, matching an existing, accepted precedent in
  // this exact function.
  const leadF6 = leadFilterSql(f);
  const portNoApptRows = f.brokerId ? [] : await executeQuery(
    `SELECT COALESCE(p.name, 'Not captured') AS "groupKey", COUNT(DISTINCT l.id) AS count
     FROM Lead l
     LEFT JOIN LeadPortfolio lp ON lp.leadId = l.id
     LEFT JOIN Portfolio p ON p.id = lp.portfolioId
     WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end
       AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE ax.leadId = l.id)${leadF6.sqlFragment}
     GROUP BY p.name`,
    { ...portParams, ...leadF6.params }
  );
  const portClosed = mergeClosedMetrics(
    [...portClosedCountRows, ...portNoApptRows.map(r => ({ groupKey: r.groupKey, status: 'ClosedLost', count: r.count }))],
    portAvgDaysRows
  );
  const portAvgPolicy = Object.fromEntries(portAvgPolicyRows.map(r => [r.groupKey, r.avgValue === null ? null : Number(r.avgValue)]));
  const portAllKeys = new Set([...Object.keys(portBooked), ...Object.keys(portClosed)]);
  const portfolioTable = [...portAllKeys].sort().map(portfolioName => {
    const booked = portBooked[portfolioName] ?? 0;
    const c = portClosed[portfolioName] ?? { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null };
    return {
      portfolio: portfolioName, booked, closedWon: c.closedWon, closedLost: c.closedLost,
      conversion: booked === 0 ? '0.0' : (c.closedWon / booked).toFixed(1),
      avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost,
      avgPolicyValueWon: portAvgPolicy[portfolioName] ?? null,
    };
  });

  // ── Policy value breakdown — derived, not queried fresh.
  const policyValueBreakdown = {
    total: current.totalPolicyValue,
    avgPerDeal: current.closedWon === 0 ? null : current.totalPolicyValue / current.closedWon,
    perAppointment: current.appts === 0 ? null : current.totalPolicyValue / current.appts,
    perLead: current.leads === 0 ? null : current.totalPolicyValue / current.leads,
    trend: trend.map(t => ({ label: t.label, policyValue: t.policyValue })),
  };

  // ── Won vs Lost — counts from `pipeline`. Loss reasons — 14 Aug 2026
  // (§163, migration 030, Appointment.lostReason) — built now that Mark
  // has explicitly asked for it; the field genuinely didn't exist before
  // this. hasLossReasons is TRUE only when at least one closed-lost
  // appointment this period actually has a reason captured — a schema
  // that exists but is 0% populated yet (every lost appointment closed
  // before this feature shipped) should still show the honest "not
  // captured" state, not a technically-true-but-empty breakdown table.
  const closedWonCount = pipeline.find(p => p.status === 'Closed Won').count;
  const closedLostCount = pipeline.find(p => p.status === 'Closed Lost').count;
  const apptF5 = apptFilterSql(f);
  const lossReasonParams = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const lossReasonRows = await executeQuery(
    `SELECT COALESCE(a.lostReason, 'Not captured') AS reason, COUNT(*) AS count
     FROM Appointment a JOIN Lead l ON l.id = a.leadId
     WHERE a.status = 'ClosedLost' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF5.sqlFragment}
     GROUP BY reason ORDER BY count DESC`,
    { ...lossReasonParams, ...apptF5.params }
  );
  const lossReasons = lossReasonRows.map(r => ({ reason: r.reason, count: Number(r.count) }));
  const hasLossReasons = lossReasons.some(r => r.reason !== 'Not captured');
  // 16 Aug 2026 (§180) — Mark's explicit request, after the redundant
  // donut+bar-of-the-same-numbers pattern was fixed (§179): "different
  // data displayed like win/loss by region, win/loss by portfolio."
  // Region has no existing breakdown anywhere in this file — genuinely
  // new query, same apptFilterSql/scope pattern every other breakdown
  // here already uses. Portfolio needs no new query at all: portfolioTable
  // (computed below, this same function) already carries closedWon/
  // closedLost per portfolio — wonByPortfolio/lostByPortfolio are pure
  // derivations of it, not a second trip to the database for the same
  // rows. COALESCE to 'Not captured' for region — nullable since 14 Aug
  // 2026 (§166, migration 032), so any appointment booked before that
  // carries no region at all; same "count it, label it honestly" pattern
  // as loss/cancel reasons above rather than silently dropping the row.
  //
  // §181 fixed a real alias-collision bug here (GROUP BY on an alias
  // that also matched a real column from the Lead join). §183 then
  // "fixed" a second apparent bug by making this query MATCH
  // mergeClosedMetrics()'s then-current behaviour of folding
  // ReturnedToLeads into "lost" — reasoning that every other breakdown
  // in this file already did that, so this one should too. That
  // reasoning was backwards: mergeClosedMetrics() itself had the bug.
  // §185 (16 Aug 2026) is the actual fix, at the actual source — Mark
  // checked the raw appointment table directly, found zero ClosedLost
  // rows against a report showing "Lost: 1", and confirmed explicitly
  // that a ReturnedToLeads appointment must NOT count as Lost anywhere
  // in reporting (it's not a sales outcome — this exact principle was
  // already on record from when the status was first built, months
  // before §151 introduced the inconsistency). This query now matches
  // ClosedWon/ClosedLost only, same as every other corrected query in
  // this file — see mergeClosedMetrics()'s own header comment for the
  // full account and the complete list of what else changed alongside it.
  const regionRows = await executeQuery(
    `SELECT COALESCE(a.region, 'Not captured') AS "groupKey", a.status, COUNT(*) AS count
     FROM Appointment a JOIN Lead l ON l.id = a.leadId
     WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF5.sqlFragment}
     GROUP BY "groupKey", a.status`,
    { ...lossReasonParams, ...apptF5.params }
  );
  // Bug found 21 Aug 2026 (Mark, live testing): a Lead closed lost
  // directly — pipelineStatus = 'Closed' via a WrongNumber/NotInterested
  // call outcome (leadStatusService.computeLeadStatus), never having
  // reached AppointmentScheduled at all — is counted in the top-level
  // Overall Lost figure (via noApptClosedBranch further up this
  // function) but was invisible here, since this query only ever scanned
  // Appointment. Not a "missing region field" situation: the COALESCE
  // above already handles a captured Appointment with no region set,
  // which would show as its own "Not captured" bucket, not an empty
  // breakdown — the symptom Mark actually saw (a real Closed Lost count
  // with zero rows in this breakdown) only happens when the row isn't in
  // the Appointment table's result set at all. Same fix shape as
  // srcNoApptClosedRows (Leads-by-Source breakdown, above this function)
  // already uses for the identical situation — that breakdown got it
  // right when it was built; this one and the Portfolio one below it did
  // not. Confirmed no double-counting risk against regionRows above:
  // computeLeadStatus's own TERMINAL_STATUSES makes 'AppointmentScheduled'
  // and 'Closed' mutually exclusive — a Lead reaching 'Closed' this way
  // can never also have gone on to book (and later close) an Appointment.
  // pulled from Lead.region, not Appointment.region — there is no
  // Appointment row for this branch, and Lead.region is the field
  // Appointment.region is itself copied from at booking time anyway
  // (schema.postgres.sql's own comment on that column).
  const leadF5 = leadFilterSql(f);
  const regionNoApptRows = f.brokerId ? [] : await executeQuery(
    `SELECT COALESCE(l.region, 'Not captured') AS "groupKey", COUNT(*) AS count
     FROM Lead l
     WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end
       AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE ax.leadId = l.id)${leadF5.sqlFragment}
     GROUP BY "groupKey"`,
    { ...lossReasonParams, ...leadF5.params }
  );
  const regionClosed = mergeClosedMetrics(
    [...regionRows, ...regionNoApptRows.map(r => ({ groupKey: r.groupKey, status: 'ClosedLost', count: r.count }))],
    []
  );
  const wonByRegion  = Object.entries(regionClosed).filter(([, v]) => v.closedWon  > 0).map(([region, v]) => ({ region, count: v.closedWon }));
  const lostByRegion = Object.entries(regionClosed).filter(([, v]) => v.closedLost > 0).map(([region, v]) => ({ region, count: v.closedLost }));
  const wonVsLost = {
    won: closedWonCount, lost: closedLostCount,
    winRate: (closedWonCount + closedLostCount) === 0 ? null : Math.round((closedWonCount / (closedWonCount + closedLostCount)) * 1000) / 10,
    avgDaysToCloseWon: current.avgDaysToCloseWon,
    avgDaysToCloseLost: null, // computed below, alongside the rest of the lost-side detail this filtered/scoped rebuild needs fresh (getReportSummary's own avgDaysToClose.lost was org-wide/unfiltered)
    lossReasons, hasLossReasons,
    wonByRegion, lostByRegion,
    // 16 Aug 2026 (§180) — derived from portfolioTable, computed earlier
    // in this same function (well above this point) — not a second trip
    // to the database for rows already fetched.
    wonByPortfolio:  portfolioTable.filter(p => p.closedWon  > 0).map(p => ({ portfolio: p.portfolio, count: p.closedWon })),
    lostByPortfolio: portfolioTable.filter(p => p.closedLost > 0).map(p => ({ portfolio: p.portfolio, count: p.closedLost })),
  };
  {
    const lostDaysRows = await executeQuery(
      `SELECT AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays" FROM Appointment a JOIN Lead l ON l.id = a.leadId WHERE a.status = 'ClosedLost' AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId${apptF5.sqlFragment}`,
      { ...lossReasonParams, ...apptF5.params }
    );
    wonVsLost.avgDaysToCloseLost = lostDaysRows[0].avgDays === null ? null : Number(lostDaysRows[0].avgDays);
  }

  // ── Appointment analysis — booked/per-lead/appointment-to-won already
  // derivable from `current`; meeting-type table fetched filter/scope-
  // aware above. Cancelled/Missed breakdown — BUILT 15 Aug 2026 (§172,
  // migration 034). Was explicitly flagged as a gap the day before
  // (§164), deliberately not built then because the concept had no home
  // yet (§138's Meeting redesign hadn't decided where "cancelled"/
  // "missed" belonged); it now has one, MeetingAttempt.status, so this
  // is built rather than left flagged. Scoped by the ATTEMPT's own
  // createdAt (when the cancellation/no-show was actually logged), not
  // any Appointment-level date — matches the period selector's own
  // intent, "what happened in this period", same reasoning as every
  // other activity-scoped query in this function.
  const apptF6 = apptFilterSql(f);
  const cancelMissedParams = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const [cancelMissedCountRows, cancelReasonRows] = await Promise.all([
    executeQuery(
      `SELECT ma.status, COUNT(*) AS count FROM MeetingAttempt ma
       JOIN Appointment a ON a.id = ma.appointmentId JOIN Lead l ON l.id = a.leadId
       WHERE ma.status IN ('Cancelled', 'Missed') AND ma.createdAt >= @start AND ma.createdAt <= @end AND a.organisationId = @organisationId${apptF6.sqlFragment}
       GROUP BY ma.status`,
      { ...cancelMissedParams, ...apptF6.params }
    ),
    // Mirrors lossReasons (Won vs Lost, above) exactly — same
    // "COALESCE to 'Not captured' rather than dropping rows with a null
    // reason" pattern, so a Cancelled attempt someone forgot to give a
    // reason for still counts toward the total, honestly labelled.
    executeQuery(
      `SELECT COALESCE(ma.cancelReason, 'Not captured') AS reason, COUNT(*) AS count FROM MeetingAttempt ma
       JOIN Appointment a ON a.id = ma.appointmentId JOIN Lead l ON l.id = a.leadId
       WHERE ma.status = 'Cancelled' AND ma.createdAt >= @start AND ma.createdAt <= @end AND a.organisationId = @organisationId${apptF6.sqlFragment}
       GROUP BY reason ORDER BY count DESC`,
      { ...cancelMissedParams, ...apptF6.params }
    ),
  ]);
  const cancelMissedCounts = Object.fromEntries(cancelMissedCountRows.map(r => [r.status, Number(r.count)]));
  const cancelReasons = cancelReasonRows.map(r => ({ reason: r.reason, count: Number(r.count) }));

  const appointmentAnalysis = {
    booked: current.appts,
    perLead: current.leads === 0 ? null : Math.round((current.appts / current.leads) * 100) / 100,
    bookedToWonConversion: current.appts === 0 ? null : Math.round((current.closedWon / current.appts) * 1000) / 10,
    byMeetingType: meetingTypeTable,
    cancelled: cancelMissedCounts.Cancelled ?? 0,
    missed: cancelMissedCounts.Missed ?? 0,
    cancelReasons,
    hasCancelledMissedTracking: true,
  };

  const insights = generateInsights({ sourceTable, portfolioTable, kpis });

  return {
    period: { start, end, priorStart, priorEnd },
    appliedFilters: { brokerId: filters.brokerId ?? null, portfolio: filters.portfolio ?? null, source: filters.source ?? null, scoped: !!reportIds },
    kpis, trend,
    pipeline: { stages: pipeline, stageConversion },
    sourceTable, portfolioTable,
    policyValueBreakdown, wonVsLost, appointmentAnalysis,
    insights,
  };
}
