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
 * -> ClosedWon, ClosedLost/ReturnedToLeads -> ClosedLost. Leads that closed
 * via a call outcome without ever getting an appointment
 * (pipelineStatus = 'Closed') are folded into ClosedLost too — both
 * represent "didn't convert", no reason to split into a 7th/8th bucket.
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
    // so this one sub-case still approximates via Lead.updatedAt, same
    // imprecision as before this fix, not silently resolved — flagged
    // to Mark, not decided unilaterally.
    executeQuery(
      `SELECT 'ClosedWon' AS bucket, COUNT(*) AS count FROM Appointment
       WHERE status = 'ClosedWon' AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId
       UNION ALL
       SELECT 'ClosedLost' AS bucket, COUNT(*) AS count FROM Appointment
       WHERE status IN ('ClosedLost', 'ReturnedToLeads') AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId
       UNION ALL
       SELECT 'ClosedLost' AS bucket, COUNT(*) AS count FROM Lead
       WHERE pipelineStatus = 'Closed' AND updatedAt >= @start AND updatedAt <= @end
         AND deletedAt IS NULL AND organisationId = @organisationId`,
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
  const kpi = {
    leads, calls: Number(k.calls), callbacks: Number(k.callbacks), noAnswer: Number(k.noAnswer), appts,
    conversion: leads === 0 ? '0%' : `${Math.round((appts / leads) * 100)}%`,
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
       COUNT(a.id) FILTER (WHERE a.status = 'ClosedWon') AS "signed",
       COUNT(a.id) FILTER (WHERE a.isBrokerSwitch = true) AS "switches",
       COUNT(a.id) FILTER (WHERE a.meeting1Status = 'Seen') +
       COUNT(a.id) FILTER (WHERE a.meeting2Status = 'Seen') +
       COUNT(a.id) FILTER (WHERE a.meeting3Status = 'Seen') AS "meetingsHeld"
     FROM Appointment a
     WHERE a.brokerId = @brokerId AND a.createdAt >= @start AND a.createdAt <= @end`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const k = kpiRows[0] ?? { appts: 0, signed: 0, switches: 0, meetingsHeld: 0 };
  const appts = Number(k.appts), signed = Number(k.signed);

  // Products sold — real, via AppointmentProduct (already fully wired by
  // the outcome-save flow; nothing new needed there). policyValue added
  // 23 Jul 2026, §44 — per-product Rand value, now tracked and summed.
  const productRows = await executeQuery(
    `SELECT p.name, COUNT(*) AS count, COALESCE(SUM(ap.policyValue), 0) AS "totalValue"
     FROM AppointmentProduct ap
     JOIN Appointment a ON a.id = ap.appointmentId
     JOIN Product p ON p.id = ap.productId
     WHERE a.brokerId = @brokerId AND a.createdAt >= @start AND a.createdAt <= @end
     GROUP BY p.name
     ORDER BY "totalValue" DESC`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const productsSold = productRows.map(r => ({ name: r.name, count: Number(r.count), value: Number(r.totalValue) }));
  const totalPolicyValue = productsSold.reduce((sum, p) => sum + p.value, 0);

  const kpi = {
    appts, signed, switches: Number(k.switches), meetingsHeld: Number(k.meetingsHeld),
    policyValue: totalPolicyValue,
    conversion: appts === 0 ? '0%' : `${Math.round((signed / appts) * 100)}%`,
  };

  // Meeting outcome summary — real counts per meeting number/status, plus
  // an overall signed-vs-appointments-with-a-held-meeting ratio. Simpler
  // than the mock's exact "signed after 2nd meeting" framing (which
  // implied a stricter causal link this data doesn't actually establish),
  // but every number in it is real.
  const meetingRows = await executeQuery(
    `SELECT
       COUNT(*) FILTER (WHERE meeting1Status = 'Seen') AS "m1Seen",
       COUNT(*) FILTER (WHERE meeting1Status = 'Rescheduled') AS "m1Resched",
       COUNT(*) FILTER (WHERE meeting1Status = 'Cancelled') AS "m1Cancelled",
       COUNT(*) FILTER (WHERE meeting1Date IS NOT NULL) AS "m1Total",
       COUNT(*) FILTER (WHERE meeting2Status = 'Seen') AS "m2Seen",
       COUNT(*) FILTER (WHERE meeting2Status = 'Rescheduled') AS "m2Resched",
       COUNT(*) FILTER (WHERE meeting2Status = 'Cancelled') AS "m2Cancelled",
       COUNT(*) FILTER (WHERE meeting2Date IS NOT NULL) AS "m2Total"
     FROM Appointment
     WHERE brokerId = @brokerId AND createdAt >= @start AND createdAt <= @end`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId }, start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end } }
  );
  const m = meetingRows[0] ?? {};
  const meetingSummary = [
    { label: '1st meeting — Seen',        value: `${Number(m.m1Seen ?? 0)} / ${Number(m.m1Total ?? 0)}` },
    { label: '1st meeting — Rescheduled', value: `${Number(m.m1Resched ?? 0)} / ${Number(m.m1Total ?? 0)}` },
    { label: '1st meeting — Cancelled',   value: `${Number(m.m1Cancelled ?? 0)} / ${Number(m.m1Total ?? 0)}` },
    { label: '2nd meeting — Seen',        value: `${Number(m.m2Seen ?? 0)} / ${Number(m.m2Total ?? 0)}` },
    { label: '2nd meeting — Rescheduled', value: `${Number(m.m2Resched ?? 0)} / ${Number(m.m2Total ?? 0)}` },
    { label: '2nd meeting — Cancelled',   value: `${Number(m.m2Cancelled ?? 0)} / ${Number(m.m2Total ?? 0)}` },
    { label: 'Signed (of all appointments)', value: `${signed} / ${appts}${appts > 0 ? ` (${Math.round(signed / appts * 100)}%)` : ''}`, bold: true },
  ];

  // Recent appointments — last 5, with lead name, portfolio, meeting
  // statuses, signed decision, and products sold (joined names).
  const recentRows = await executeQuery(
    `SELECT
       a.id, l.firstName AS "firstName", l.lastName AS "lastName", pf.name AS "portfolio",
       -- Full portfolio set (§45) — was only the primary via the JOIN
       -- above, same gap AppointmentList.jsx's filter had before this fix.
       (SELECT COALESCE(array_agg(p4.name ORDER BY p4.name), ARRAY[]::text[])
        FROM AppointmentPortfolio ap4 JOIN Portfolio p4 ON p4.id = ap4.portfolioId
        WHERE ap4.appointmentId = a.id) AS "portfolios",
       a.meeting1Status AS "m1", a.meeting2Status AS "m2", a.customerSigned AS "signed",
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
       COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ClosedWon') AS "signed",
       COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS "portfolios",
       -- Scalar subquery, not a direct JOIN to AppointmentProduct — a
       -- direct join would fan out one row per product sold, silently
       -- inflating the appts/signed counts above (an appointment with 3
       -- products sold would count as 3 appointments). This keeps the
       -- appointment-level aggregates correct regardless of how many
       -- products any given appointment has.
       COALESCE((
         SELECT SUM(ap2.policyValue) FROM AppointmentProduct ap2
         JOIN Appointment a2 ON a2.id = ap2.appointmentId
         WHERE a2.brokerId = u.id AND a2.createdAt >= @start AND a2.createdAt <= @end
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
    return {
      id: r.id, name: r.name, leads, calls: Number(r.calls),
      appts, callbacks: Number(r.callbacks),
      conversion: leads === 0 ? '0%' : `${Math.round((appts / leads) * 100)}%`,
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
function mergeClosedMetrics(countRows, avgDaysRows) {
  const map = {};
  const ensure = (key) => (map[key] ??= { closedWon: 0, closedLost: 0, avgDaysWon: null, avgDaysLost: null });
  for (const row of countRows) {
    const g = ensure(row.groupKey);
    if (row.status === 'ClosedWon') g.closedWon += Number(row.count);
    else g.closedLost += Number(row.count); // ClosedLost + ReturnedToLeads + the no-appointment 'Closed' path all fold in here
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
 * Leads by Source — §151. Cohort (leads created in period) crossed with
 * closed-date metrics (appointments that closed in period, joined back
 * to their lead's source), plus the no-appointment 'Closed' path
 * (approximated via Lead.updatedAt, same imprecision already accepted
 * in getReportSummary — not newly introduced here).
 *
 * IMPORTANT, found while building this (13 Aug 2026) — Lead.leadSource
 * is NOT a real column. leadService.js's own header comment documents
 * this directly: the CreateLeadSchema enum value (EventAttendance/
 * CSVImport/ManualEntry/Referral/WebForm) is accepted by the API for
 * validation but never actually inserted anywhere — createLead()'s
 * INSERT doesn't reference it at all. The only real source data is
 * linkedEventId/linkedSubscriptionId/csvImportBatchId/manualSourceName,
 * and the rest of the app (listSources(), LeadList.jsx's own source
 * filter dropdown, the sourceLabel shown in "Recent Lead Activity"
 * tables) already treats a COALESCE across those four as "the source" —
 * a free-text label (an event's name, a subscription's name, or
 * whatever manualSourceName/csvSource string was typed in), not the
 * 5-category enum. This report groups by that same sourceLabel, to
 * match the one definition of "source" already used everywhere else in
 * this app, rather than inventing a second, inconsistent one. Practical
 * effect: this can be more than 5 rows — one per distinct event,
 * subscription, or manual source string that actually exists, not a
 * clean Event/CSV/Manual/Referral/WebForm five-way split, since that
 * split was never actually captured in the data to begin with.
 */
export async function getLeadsBySourceReport(period, referenceDate) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period, referenceDate);
  const params = { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const sourceJoins = `LEFT JOIN Event ev ON l.linkedEventId = ev.id LEFT JOIN MedicalSubscription ms ON l.linkedSubscriptionId = ms.id`;
  const sourceLabelExpr = `COALESCE(ev.name, ms.name, l.manualSourceName, 'Unknown')`;

  const [leadsRows, closedCountRows, noApptClosedRows, avgDaysRows] = await Promise.all([
    executeQuery(
      `SELECT ${sourceLabelExpr} AS "groupKey", COUNT(*) AS count FROM Lead l
       ${sourceJoins}
       WHERE l.createdAt >= @start AND l.createdAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       GROUP BY ${sourceLabelExpr}`, params
    ),
    executeQuery(
      `SELECT ${sourceLabelExpr} AS "groupKey", a.status, COUNT(*) AS count
       FROM Appointment a JOIN Lead l ON l.id = a.leadId
       ${sourceJoins}
       WHERE a.status IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY ${sourceLabelExpr}, a.status`, params
    ),
    executeQuery(
      `SELECT ${sourceLabelExpr} AS "groupKey", COUNT(*) AS count FROM Lead l
       ${sourceJoins}
       WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
       GROUP BY ${sourceLabelExpr}`, params
    ),
    executeQuery(
      `SELECT ${sourceLabelExpr} AS "groupKey", a.status,
         AVG(EXTRACT(EPOCH FROM (a.closedAt - l.createdAt)) / 86400.0) AS "avgDays"
       FROM Appointment a JOIN Lead l ON l.id = a.leadId
       ${sourceJoins}
       WHERE a.status IN ('ClosedWon', 'ClosedLost') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY ${sourceLabelExpr}, a.status`, params
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
      conversion: leads === 0 ? '0%' : `${Math.round((c.closedWon / leads) * 100)}%`,
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
       WHERE a.status IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
       GROUP BY p.name, a.status`, params
    ),
    executeQuery(
      `SELECT p.name AS "groupKey", COUNT(DISTINCT l.id) AS count
       FROM Lead l JOIN LeadPortfolio lp ON lp.leadId = l.id JOIN Portfolio p ON p.id = lp.portfolioId
       WHERE l.pipelineStatus = 'Closed' AND l.updatedAt >= @start AND l.updatedAt <= @end AND l.deletedAt IS NULL AND l.organisationId = @organisationId
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
      conversion: leads === 0 ? '0%' : `${Math.round((c.closedWon / leads) * 100)}%`,
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
       WHERE a.status IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads') AND a.closedAt >= @start AND a.closedAt <= @end AND a.organisationId = @organisationId
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
      conversion: booked === 0 ? '0%' : `${Math.round((c.closedWon / booked) * 100)}%`,
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
       WHERE status IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads') AND closedAt >= @start AND closedAt <= @end AND organisationId = @organisationId
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
      conversion: booked === 0 ? '0%' : `${Math.round((c.closedWon / booked) * 100)}%`,
      avgDaysToCloseWon: c.avgDaysWon, avgDaysToCloseLost: c.avgDaysLost,
      avgPolicyValueWon: avgPolicyByGroup[meetingType] ?? null,
    };
  });
}
