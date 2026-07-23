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
export function getPeriodRange(period, now = new Date()) {
  const start = new Date(now);
  if (period === 'Monthly') {
    start.setDate(1);
  } else if (period === 'Quarterly') {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start.setMonth(qStartMonth, 1);
  } else {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

// ─── Period → trend buckets ─────────────────────────────────────────────────
// Monthly: weeks within the current month. Quarterly/Yearly: months within
// the current quarter/year. Small N (<=12) — one pair of COUNT queries per
// bucket in getReportSummary() below is simpler and far more maintainable
// than dynamic SQL date-bucketing for a low-traffic internal report; not a
// performance concern at this scale.
function getTrendBuckets(period, now = new Date()) {
  const buckets = [];
  if (period === 'Monthly') {
    const { start } = getPeriodRange('Monthly', now);
    let weekStart = new Date(start);
    let weekNum = 1;
    while (weekStart.getMonth() === start.getMonth()) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const clampedEnd = weekEnd > now ? now : weekEnd;
      buckets.push({ label: `W${weekNum}`, start: new Date(weekStart), end: clampedEnd });
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
      weekNum += 1;
      if (weekNum > 5) break; // a month never spans more than 5 week-buckets this way
    }
  } else {
    const monthCount = period === 'Quarterly' ? 3 : 12;
    const { start } = getPeriodRange(period, now);
    for (let i = 0; i < monthCount; i++) {
      const monthStart = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 23, 59, 59, 999);
      const label = monthStart.toLocaleDateString('en-ZA', { month: 'short' });
      // Future months (haven't started yet) still get a bucket — zero
      // activity, same as the mock's "future month" rows — but no query
      // needed for them, they're always 0.
      buckets.push({ label, start: monthStart, end: monthEnd, future: monthStart > now });
    }
  }
  return buckets;
}

/**
 * Pipeline status breakdown + trend chart data for the current period.
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @returns {Promise<{pipeline: Array, trend: Array}>}
 */
export async function getReportSummary(period) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period);

  const pipelineRows = await executeQuery(
    `SELECT
       CASE
         WHEN l.pipelineStatus = 'Unassigned' THEN 'Unassigned'
         WHEN l.pipelineStatus = 'Assigned'   THEN 'Assigned'
         WHEN l.pipelineStatus = 'InProgress' THEN 'InProgress'
         WHEN l.pipelineStatus = 'Closed'     THEN 'ClosedLost'
         WHEN l.pipelineStatus = 'AppointmentScheduled' THEN
           CASE
             WHEN ap.status = 'ClosedWon' THEN 'ClosedWon'
             WHEN ap.status IN ('ClosedLost', 'ReturnedToLeads') THEN 'ClosedLost'
             ELSE 'AppointmentBooked'
           END
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
  );
  const pipelineCounts = Object.fromEntries(pipelineRows.map(r => [r.bucket, Number(r.count)]));
  const pipeline = [
    { status: 'Unassigned',          count: pipelineCounts.Unassigned ?? 0 },
    { status: 'Assigned',            count: pipelineCounts.Assigned ?? 0 },
    { status: 'In Progress',         count: pipelineCounts.InProgress ?? 0 },
    { status: 'Appointment Booked',  count: pipelineCounts.AppointmentBooked ?? 0 },
    { status: 'Closed Won',          count: pipelineCounts.ClosedWon ?? 0 },
    { status: 'Closed Lost',         count: pipelineCounts.ClosedLost ?? 0 },
  ];

  const buckets = getTrendBuckets(period);
  const trend = [];
  for (const b of buckets) {
    if (b.future) { trend.push({ label: b.label, leads: 0, won: 0 }); continue; }
    const [leadsRows, wonRows] = await Promise.all([
      executeQuery(
        `SELECT COUNT(*) AS count FROM Lead
         WHERE createdAt >= @start AND createdAt <= @end AND deletedAt IS NULL AND organisationId = @organisationId`,
        { start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
      ),
      executeQuery(
        `SELECT COUNT(*) AS count FROM Appointment
         WHERE status = 'ClosedWon' AND updatedAt >= @start AND updatedAt <= @end AND organisationId = @organisationId`,
        { start: { type: sql.DateTimeOffset, value: b.start }, end: { type: sql.DateTimeOffset, value: b.end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
      ),
    ]);
    trend.push({ label: b.label, leads: Number(leadsRows[0].count), won: Number(wonRows[0].count) });
  }

  return { pipeline, trend };
}

/**
 * Broker performance table. Scoped by role: Admin/GlobalAdmin/Supervisor see
 * all brokers (brokers aren't in a supervisor's direct-report line the way
 * agents are — matches the mock's own scoping, where Supervisor fell
 * through to the full list); Broker sees only themselves; Agent sees none.
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {{role: string, userId: string}} scope
 */
export async function getBrokerReport(period, scope) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period);

  if (scope.role === 'Agent') return [];

  const rows = await executeQuery(
    `SELECT
       u.id, u.displayName AS "name",
       COUNT(a.id) AS "appts",
       COUNT(a.id) FILTER (WHERE a.status = 'ClosedWon') AS "signed",
       COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS "portfolios"
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
export async function getAgentReport(period, scope) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period);

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
