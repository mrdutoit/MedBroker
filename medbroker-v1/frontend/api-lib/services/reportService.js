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

  // Org-wide total policy value — added 23 Jul 2026, §44. Its own
  // standalone query, not folded into the pipeline/trend queries above,
  // to avoid any fan-out risk from joining AppointmentProduct alongside
  // Lead/Appointment aggregates that weren't designed around it.
  const policyValueRows = await executeQuery(
    `SELECT COALESCE(SUM(ap.policyValue), 0) AS "total" FROM AppointmentProduct ap
     JOIN Appointment a ON a.id = ap.appointmentId
     WHERE a.createdAt >= @start AND a.createdAt <= @end AND a.organisationId = @organisationId`,
    { start: { type: sql.DateTimeOffset, value: start }, end: { type: sql.DateTimeOffset, value: end }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  const totalPolicyValue = Number(policyValueRows[0].total);

  return { pipeline, trend, totalPolicyValue };
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
export async function getAgentDetailReport(agentId, period, scope) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period);

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
  const buckets = getTrendBuckets(period);
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

  return {
    meta: { name: meta.name, region: meta.region, portfolios: meta.portfolios },
    kpi, callOutcomes, activity,
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
export async function getBrokerDetailReport(brokerId, period, scope) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period);

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

  return {
    meta: { name: meta.name, region: meta.region, portfolios: meta.portfolios },
    kpi, productsSold, meetingSummary,
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
export async function getBrokerReport(period, scope) {
  const organisationId = resolveOrganisationId();
  const { start, end } = getPeriodRange(period);

  if (scope.role === 'Agent') return [];

  const rows = await executeQuery(
    `SELECT
       u.id, u.displayName AS "name",
       COUNT(a.id) AS "appts",
       COUNT(a.id) FILTER (WHERE a.status = 'ClosedWon') AS "signed",
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
