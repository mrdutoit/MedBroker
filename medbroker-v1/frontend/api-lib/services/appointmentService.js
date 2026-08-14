/**
 * services/appointmentService.js — NEW.
 * Business logic and data access for the Appointment entity — the "active
 * deal", analogous to a Salesforce Opportunity. One-to-many child of Lead
 * (UQ_Appointment_LeadId dropped in 005_drop_appointment_lead_unique.sql —
 * see Status.md §35): a Lead may accumulate multiple Appointment rows over
 * time (e.g. a Closed Lost attempt followed by a Reopen and a second
 * booking), all preserved for history rather than overwritten. leadService.
 * getLeadById() surfaces only the MOST RECENT one (LATERAL join) for the
 * Lead Detail conversion banner; listAppointments's leadId filter (below)
 * is how the full set for one Lead is retrieved — see LeadDetail.jsx's
 * "Appointment History" card.
 *
 * UPDATED §117 (4 Aug 2026) — the CLAIM model (appointments.claimModel =
 * 'claim') is now real: claimAppointment() and listAvailableToClaim()
 * below. See tokenService.js for the token-debit side of claiming, and
 * models/appointment.js's header for the current staging (Stripe payment
 * is still deferred — this entry only covers the 'none' provider path).
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { computeAppointmentStatus } from './appointmentStatusService.js';
import { getActiveUserById, resolvePortfolioIds, findLeastLoadedSupervisorForRegion } from './userService.js';
import { createTask, deleteTasksForEntity, reassignTasksForEntity } from './taskService.js';
import { createNotification } from './notificationService.js';
import { debitTokensForClaim, refundTokens } from './tokenService.js';
import { getFlagMeta } from './flagService.js';
import { getSystemConfig } from './systemConfigService.js';
import { resolveOrganisationId } from '../context/tenant.js';

// ── Shared SELECT fragments ─────────────────────────────────────────────────

const APPOINTMENT_SELECT = `
  a.id, a.status, a.agentId AS "agentId", a.brokerId AS "brokerId",
  a.portfolioId AS "portfolioId", p.name AS "portfolio",
  -- Full portfolio set (§45) — always includes the primary above, kept in
  -- sync by syncAppointmentPortfolios() at write time so this is always
  -- the complete answer, not a partial list needing a union with
  -- "portfolio" separately.
  (SELECT COALESCE(array_agg(p2.name ORDER BY p2.name), ARRAY[]::text[])
   FROM AppointmentPortfolio ap2 JOIN Portfolio p2 ON p2.id = ap2.portfolioId
   WHERE ap2.appointmentId = a.id) AS "portfolios",
  a.firstAppointmentDate AS "firstAppointmentDate",
  a.firstAppointmentTime AS "firstAppointmentTime",
  a.meetingType AS "meetingType",
  a.firstAppointmentAddress AS "firstAppointmentAddress",
  a.virtualMeetingLink AS "virtualMeetingLink",
  a.productsInterestedIn AS "productsInterestedIn",
  a.currentInsurer AS "currentInsurer",
  a.meeting1Date AS "meeting1Date", a.meeting1Status AS "meeting1Status",
  a.meeting1Feedback AS "meeting1Feedback",
  a.meeting2Date AS "meeting2Date", a.meeting2Status AS "meeting2Status",
  a.meeting2Feedback AS "meeting2Feedback",
  a.meeting3Date AS "meeting3Date", a.meeting3Status AS "meeting3Status",
  a.meeting3Feedback AS "meeting3Feedback",
  a.customerSigned AS "customerSigned", a.isBrokerSwitch AS "isBrokerSwitch",
  a.claimTokenCost AS "claimTokenCost", a.claimedAt AS "claimedAt",
  a.createdAt AS "createdAt", a.updatedAt AS "updatedAt",
  l.id AS "leadId", l.title, l.firstName AS "firstName", l.lastName AS "lastName",
  l.email AS "leadEmail", l.mobileNumber AS "leadMobile", l.occupation,
  COALESCE(ev.name, ms.name, l.manualSourceName) AS "sourceLabel",
  ag.displayName AS "agentName",
  -- §117 — the claim pool's own listing already filters on this (agent's
  -- region matching the requesting broker's own BrokerRegion rows, see
  -- listAvailableToClaim() below) but didn't SELECT it for display until
  -- now; every other consumer of this shared SELECT just ignores the
  -- extra column, same reasoning as adding entraObjectId to
  -- USER_LIST_SELECT (userService.js, §114).
  ag.region AS "agentRegion",
  br.displayName AS "brokerName"`;

const APPOINTMENT_JOINS = `
  FROM Appointment a
  JOIN Lead l                      ON a.leadId = l.id
  JOIN Portfolio p                  ON a.portfolioId = p.id
  LEFT JOIN "User" ag               ON a.agentId = ag.id
  LEFT JOIN "User" br               ON a.brokerId = br.id
  LEFT JOIN Event ev                ON l.linkedEventId = ev.id
  LEFT JOIN MedicalSubscription ms  ON l.linkedSubscriptionId = ms.id`;

/**
 * True if brokerId already has ANOTHER Appointment at the exact same
 * date+time — Mark's request, 24 Jul 2026: prevent double-booking a
 * broker. Checked regardless of the existing appointment's status
 * (including closed ones) — a slot that broker was in a meeting for is
 * a genuine conflict at that exact date+time regardless of how that
 * earlier meeting turned out. excludeAppointmentId lets reassignment
 * check against everything EXCEPT the appointment being modified itself.
 * @param {string} brokerId
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} time - 'HH:mm' or 'HH:mm:ss'
 * @param {string} [excludeAppointmentId]
 * @returns {Promise<boolean>}
 */
export async function hasBrokerConflict(brokerId, date, time, excludeAppointmentId = null) {
  const row = await executeQueryOne(
    `SELECT id FROM Appointment
     WHERE brokerId = @brokerId AND firstAppointmentDate = @date AND firstAppointmentTime = @time
       AND organisationId = @organisationId
       ${excludeAppointmentId ? 'AND id != @excludeId' : ''}
     LIMIT 1`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      date:           { type: sql.Date, value: date },
      time:           { type: sql.NVarChar(8), value: time },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      ...(excludeAppointmentId ? { excludeId: { type: sql.UniqueIdentifier, value: excludeAppointmentId } } : {}),
    }
  );
  return !!row;
}

export async function resolvePortfolioId(name) {
  const row = await executeQueryOne(`SELECT id FROM Portfolio WHERE name = @name`, {
    name: { type: sql.NVarChar(200), value: name },
  });
  return row?.id ?? null;
}

// Changed 23 Jul 2026 (§44) — returns a name->id Map instead of a bare id
// array, so a per-product value can stay attached to its product through
// the resolve step (an array would lose the association once names and
// ids are two separate parallel arrays, which is fragile the moment order
// isn't guaranteed to match — a Map sidesteps that entirely).
async function resolveProductIdMap(names) {
  if (!names || names.length === 0) return new Map();
  const rows = await executeQuery(`SELECT id, name FROM Product WHERE name = ANY(@names)`, {
    names: { type: sql.NVarChar(sql.MAX), value: names },
  });
  return new Map(rows.map((r) => [r.name, r.id]));
}

// Changed 23 Jul 2026 (§44) — was getProductNames(), returned bare names.
// Now returns {name, value} pairs so the frontend can display a
// previously-captured policy value when reloading an appointment, not
// just which products were checked.
async function getProductsSold(appointmentId) {
  const rows = await executeQuery(
    `SELECT p.name, ap.policyValue AS "value" FROM AppointmentProduct ap
     JOIN Product p ON ap.productId = p.id WHERE ap.appointmentId = @appointmentId`,
    { appointmentId: { type: sql.UniqueIdentifier, value: appointmentId } }
  );
  return rows.map((r) => ({ name: r.name, value: r.value === null ? null : Number(r.value) }));
}

// Changed 23 Jul 2026 (§44) — takes [{productId, value}] instead of a bare
// productId array, writing the new policyValue column alongside each row.
async function syncAppointmentProducts(appointmentId, productsWithValues) {
  await executeQuery(`DELETE FROM AppointmentProduct WHERE appointmentId = @appointmentId`, {
    appointmentId: { type: sql.UniqueIdentifier, value: appointmentId },
  });
  for (const { productId, value } of productsWithValues) {
    await executeQuery(
      `INSERT INTO AppointmentProduct (id, appointmentId, productId, policyValue) VALUES (@id, @appointmentId, @productId, @value)`,
      {
        id:            { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        appointmentId: { type: sql.UniqueIdentifier, value: appointmentId },
        productId:     { type: sql.UniqueIdentifier, value: productId },
        value:         { type: sql.Decimal(12, 2), value: value ?? null },
      }
    );
  }
}

/**
 * List appointments with optional filters and pagination.
 * @param {Object} filters - from AppointmentListQuerySchema, plus:
 * @param {string[]} [filters.supervisorAgentIds] - A1-style Supervisor scoping,
 *   set by the route handler, same pattern as leadService.listLeads().
 */
export async function listAppointments({ status, brokerId, agentId, leadId, portfolio, source, search, page, pageSize, supervisorAgentIds }) {
  const offset = (page - 1) * pageSize;
  let whereClause = 'WHERE a.organisationId = @organisationId';
  const params = { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } };

  if (status) {
    whereClause += ' AND a.status = @status';
    params.status = { type: sql.NVarChar(50), value: status };
  }
  if (leadId) {
    // Every Appointment for one Lead — the one-to-many history view
    // (LeadDetail.jsx's "Appointment History" card), not a single-row
    // lookup. Composes with the role-scoping filters below exactly like
    // every other filter here (ANDed), so an Agent/Broker/Supervisor still
    // only sees the leadId's appointments that are also theirs to see.
    whereClause += ' AND a.leadId = @leadId';
    params.leadId = { type: sql.UniqueIdentifier, value: leadId };
  }
  if (brokerId) {
    whereClause += ' AND a.brokerId = @brokerId';
    params.brokerId = { type: sql.UniqueIdentifier, value: brokerId };
  }
  if (agentId) {
    whereClause += ' AND a.agentId = @agentId';
    params.agentId = { type: sql.UniqueIdentifier, value: agentId };
  }
  if (portfolio) {
    whereClause += ' AND p.name = @portfolio';
    params.portfolio = { type: sql.NVarChar(200), value: portfolio };
  }
  if (search) {
    whereClause += ' AND (l.firstName ILIKE @search OR l.lastName ILIKE @search OR l.email ILIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }
  if (source) {
    whereClause += ' AND COALESCE(ev.name, ms.name, l.manualSourceName) = @source';
    params.source = { type: sql.NVarChar(300), value: source };
  }
  if (supervisorAgentIds && supervisorAgentIds.length > 0) {
    const placeholders = supervisorAgentIds.map((_, i) => `@supAgent${i}`).join(', ');
    whereClause += ` AND a.agentId IN (${placeholders})`;
    supervisorAgentIds.forEach((id, i) => {
      params[`supAgent${i}`] = { type: sql.UniqueIdentifier, value: id };
    });
  } else if (supervisorAgentIds && supervisorAgentIds.length === 0) {
    whereClause += ' AND 1 = 0'; // no direct reports yet — no rows
  }

  const countResult = await executeQuery(`SELECT COUNT(*) AS total ${APPOINTMENT_JOINS} ${whereClause}`, params);
  const total = Number(countResult[0]?.total ?? 0);

  const appointments = await executeQuery(
    `SELECT ${APPOINTMENT_SELECT} ${APPOINTMENT_JOINS} ${whereClause}
     ORDER BY a.firstAppointmentDate ASC, a.firstAppointmentTime ASC
     LIMIT @pageSize OFFSET @offset`,
    { ...params, offset: { type: sql.Int, value: offset }, pageSize: { type: sql.Int, value: pageSize } }
  );

  return { appointments, total, page, pageSize };
}

/**
 * Single appointment with full detail, including products interested/sold.
 * @param {string} id
 */
export async function getAppointmentById(id) {
  const appt = await executeQueryOne(
    `SELECT ${APPOINTMENT_SELECT} ${APPOINTMENT_JOINS}
     WHERE a.id = @id AND a.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  if (!appt) return null;

  appt.productsInterestedIn = appt.productsInterestedIn ? JSON.parse(appt.productsInterestedIn) : [];
  appt.productsSold = await getProductsSold(id);
  return appt;
}

/**
 * Book a new appointment from Lead Detail. Sets Lead.pipelineStatus =
 * 'AppointmentScheduled' as a side effect — matches the comment already in
 * LeadDetail.jsx's Book Appointment modal ("Production: POST
 * /api/appointments -> Creates Appointment child record -> Sets
 * Lead.pipelineStatus = 'AppointmentScheduled'").
 *
 * agentId is deliberately NOT a parameter here (changed 23 Jul 2026, Mark's
 * request) — it's resolved from the Lead's own assignedAgentId, not the
 * authenticated booking user. Previously this took the booking user's JWT
 * claim directly, which meant a Supervisor or Admin booking on an agent's
 * behalf put the appointment under their own name instead of the agent who
 * actually owns the lead — wrong outcome, even though the code matched what
 * was documented at the time. See models/appointment.js's updated header.
 * @param {Object} data - validated CreateAppointmentSchema data
 * @returns {Promise<string>} new appointment id
 */
// Replace-all pattern — simplest correct match for a checkbox UI where the
// full desired set is sent on every save. Mirrors syncLeadPortfolios()/
// syncUserPortfolios() exactly.
async function syncAppointmentPortfolios(appointmentId, portfolioIds) {
  await executeQuery(`DELETE FROM AppointmentPortfolio WHERE appointmentId = @appointmentId`, {
    appointmentId: { type: sql.UniqueIdentifier, value: appointmentId },
  });
  for (const portfolioId of portfolioIds) {
    await executeQuery(
      `INSERT INTO AppointmentPortfolio (id, appointmentId, portfolioId) VALUES (@id, @appointmentId, @portfolioId)`,
      {
        id:            { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        appointmentId: { type: sql.UniqueIdentifier, value: appointmentId },
        portfolioId:   { type: sql.UniqueIdentifier, value: portfolioId },
      }
    );
  }
}

export async function createAppointment(data) {
  const organisationId = resolveOrganisationId();

  // §140, 12 Aug 2026 — Mark's explicit decision: when claim model is
  // active, every appointment goes out Unassigned, no exceptions — an
  // agent choosing a broker directly at booking would let that specific
  // appointment skip the claim queue and its token economy entirely.
  // LeadDetail.jsx's booking form already hides the broker-selection UI
  // when this flag is active, but that's frontend-only; this is the
  // actual enforcement, matching the same principle the Assign-action
  // handler now applies (see appointmentHandlers.handleAppointmentAssign).
  // Fetched once, reused below for the Assign-broker task skip too.
  const claimModelMeta = await getFlagMeta('appointments.claimModel');
  const isClaimModelActive = claimModelMeta?.value === 'claim';
  if (data.brokerId && isClaimModelActive) {
    throw { status: 400, message: 'Claim model is active — appointments cannot be booked with a broker chosen directly; they must be claimed from the pool' };
  }

  // §140c, 12 Aug 2026 — root cause of the token balance never moving on a
  // claim: claimTokenCost has always existed on this table but nothing
  // ever set it to a nonzero value — CreateAppointmentSchema previously
  // let a caller supply it directly, but no frontend ever did, so every
  // appointment was created with cost 0 regardless of mode. Mark's
  // explicit choice: a single flat org-wide cost, not caller-supplied —
  // stamped from SystemConfig.defaultClaimTokenCost, fetched only when
  // actually needed (claim mode active), not on every booking regardless
  // of mode.
  const claimTokenCost = isClaimModelActive ? (await getSystemConfig()).defaultClaimTokenCost : 0;

  // Changed 23 Jul 2026 (§45, Mark's request) — data.portfolios is now an
  // array (min 1, enforced by CreateAppointmentSchema). portfolioId (the
  // Appointment column) becomes the PRIMARY portfolio — the first one
  // selected — while the full set goes into AppointmentPortfolio below.
  const portfolioIds = await resolvePortfolioIds(data.portfolios);
  if (portfolioIds.length === 0) throw { status: 400, message: `Unknown portfolio: ${data.portfolios.join(', ')}` };
  const portfolioId = portfolioIds[0];

  const lead = await executeQueryOne(
    `SELECT l.assignedAgentId AS "assignedAgentId", l.title, l.firstName AS "firstName", l.lastName AS "lastName",
            ag.supervisorId AS "agentSupervisorId", ag.region AS "agentRegion"
     FROM Lead l
     LEFT JOIN "User" ag ON l.assignedAgentId = ag.id
     WHERE l.id = @leadId AND l.deletedAt IS NULL AND l.organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: data.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!lead) throw { status: 404, message: 'Lead not found' };
  if (!lead.assignedAgentId) throw { status: 400, message: 'This lead has no assigned agent — assign it to an agent before booking an appointment' };
  const agentId = lead.assignedAgentId;

  // Hoisted out of the if-block below (not just declared inside it) — the
  // Confirm-appointment task rule further down needs broker.displayName
  // when a broker was provided at booking time.
  let broker = null;
  if (data.brokerId) {
    broker = await getActiveUserById(data.brokerId);
    if (!broker) throw { status: 400, message: 'brokerId is not an active user in this organisation' };

    // Mark's request, 24 Jul 2026 — reject a booking that would
    // double-book this broker at the exact same date+time as an
    // existing appointment.
    const conflict = await hasBrokerConflict(data.brokerId, data.firstAppointmentDate, data.firstAppointmentTime);
    if (conflict) {
      throw { status: 409, message: 'This broker already has an appointment booked at that date and time. Choose a different time or broker.' };
    }
  }

  const newId = crypto.randomUUID();
  const status = data.brokerId ? 'Assigned' : 'Unassigned';

  await executeQuery(
    `INSERT INTO Appointment (
       id, organisationId, leadId, status, agentId, brokerId, portfolioId,
       firstAppointmentDate, firstAppointmentTime, meetingType, firstAppointmentAddress, virtualMeetingLink,
       productsInterestedIn, currentInsurer, claimTokenCost, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @leadId, @status, @agentId, @brokerId, @portfolioId,
       @firstAppointmentDate, @firstAppointmentTime, @meetingType, @firstAppointmentAddress, @virtualMeetingLink,
       @productsInterestedIn, @currentInsurer, @claimTokenCost, NOW(), NOW()
     )`,
    {
      id:                      { type: sql.UniqueIdentifier, value: newId },
      organisationId:          { type: sql.UniqueIdentifier, value: organisationId },
      leadId:                  { type: sql.UniqueIdentifier, value: data.leadId },
      status:                  { type: sql.NVarChar(50),     value: status },
      agentId:                 { type: sql.UniqueIdentifier, value: agentId },
      brokerId:                { type: sql.UniqueIdentifier, value: data.brokerId ?? null },
      portfolioId:             { type: sql.UniqueIdentifier, value: portfolioId },
      firstAppointmentDate:    { type: sql.Date,              value: data.firstAppointmentDate },
      firstAppointmentTime:    { type: sql.NVarChar(8),       value: data.firstAppointmentTime },
      meetingType:             { type: sql.NVarChar(20),      value: data.meetingType },
      firstAppointmentAddress: { type: sql.NVarChar(500),     value: data.firstAppointmentAddress ?? null },
      virtualMeetingLink:      { type: sql.NVarChar(500),     value: data.virtualMeetingLink ?? null },
      productsInterestedIn:    { type: sql.NVarChar(sql.MAX), value: data.productsInterestedIn ? JSON.stringify(data.productsInterestedIn) : null },
      currentInsurer:          { type: sql.NVarChar(200),     value: data.currentInsurer ?? null },
      // §117 — only meaningful for an Unassigned appointment (data.brokerId
      // omitted), but stored regardless of status; a directly-booked
      // appointment (status Assigned) never reads this field since it
      // never enters the claim pool.
      claimTokenCost:          { type: sql.Int,                value: claimTokenCost },
    }
  );

  // Full portfolio set — always includes the primary set above, kept in
  // sync deliberately rather than left as a partial list that needs
  // unioning with portfolioId at read time.
  await syncAppointmentPortfolios(newId, portfolioIds);

  // Side effect matching the documented design: the Lead is now "in" an
  // appointment, so it moves out of the Leads list (LeadList.jsx explicitly
  // excludes AppointmentScheduled leads) and into Appointments.
  await executeQuery(
    `UPDATE Lead SET pipelineStatus = 'AppointmentScheduled', updatedAt = NOW()
     WHERE id = @leadId AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: data.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );

  // §138, 12 Aug 2026 — both branches rewired from the original §56 rules.
  // Split on the same brokerId-present-or-absent branch that already
  // decided `status` above.
  if (status === 'Assigned') {
    // "Confirm appointment with [broker]" Task dropped entirely — it never
    // had a real closing action (no confirm button, nothing in the
    // Appointment flow represents an agent "confirming" anything; the
    // appointment just moves forward on its own once the broker starts
    // working the meeting). Replaced with a Notification instead — today
    // AppointmentAssigned only fires on a LATER assignment
    // (assignBroker()/self-claim below); booking WITH a broker chosen
    // upfront previously notified nobody at all.
    const leadName = [lead.title, lead.firstName, lead.lastName].filter(Boolean).join(' ');
    const dateLabel = shortDateLabel(data.firstAppointmentDate);
    const whenLabel = [dateLabel, data.firstAppointmentTime].filter(Boolean).join(', ');
    await createNotification({
      recipientId: broker.id,
      type:        'AppointmentAssigned',
      title:       `New appointment assigned — ${leadName}`,
      body:        `You have been assigned as broker for this appointment.${whenLabel ? ` First meeting: ${whenLabel}.` : ''}`,
      entityType:  'Appointment',
      entityId:    newId,
    });
  } else {
    // No broker chosen at booking.
    if (isClaimModelActive) {
      // §140 — no Assign-broker task in claim mode: the Supervisor Assign
      // action this task would prompt is now itself blocked (see
      // appointmentHandlers.handleAppointmentAssign), so creating a task
      // telling someone to do something they're blocked from doing would
      // be actively broken, not just redundant. The appointment sitting
      // Unassigned, visible in the claim pool, already IS the mechanism —
      // same "already visible elsewhere, no Task needed" reasoning this
      // app uses for Reschedule/Held-outcome-pending (see §138).
    } else {
      // Routed by REGION, not by the agent's own line management
      // (lead.agentSupervisorId, still used elsewhere in this app for
      // unrelated purposes) — an agent's manager has nothing to do with
      // broker capacity. See userService.findLeastLoadedSupervisorForRegion
      // for the full reasoning; falls back to the agent themselves if no
      // active Supervisor has a matching region set, same "never orphan a
      // task" pattern this app already uses elsewhere.
      const leadName = [lead.title, lead.firstName, lead.lastName].filter(Boolean).join(' ');
      const regionSupervisorId = await findLeastLoadedSupervisorForRegion(lead.agentRegion);
      await createTask({
        assignedToId: regionSupervisorId ?? agentId,
        type:         'Appointment',
        entityType:   'Appointment',
        entityId:     newId,
        title:        `Assign broker — ${leadName}`,
        dueAt:        data.firstAppointmentDate,
      });
    }
  }

  return newId;
}

/**
 * First-time broker assignment on an Unassigned appointment. Mirrors
 * leadService.assignLead()'s A2 pattern — validates the target is a real,
 * active user before assigning.
 * @param {string} id
 * @param {string} brokerId
 */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A short "21 May" style label for a notification body — deliberately not
 * String(dateValue), which was exactly the bug in §59 (a raw pg Date
 * object's .toString() has no year and derails downstream parsing).
 * There's no downstream re-parsing here — this is plain display text —
 * but .getUTCDate()/.getUTCMonth() is used anyway rather than risk the
 * same landmine a second time. UTC methods specifically: this is a
 * DATE-only column, and a DATE shouldn't shift by a day depending on the
 * server process's local timezone.
 */
// Exported 14 Aug 2026 (§160) — schedulerService.js's new
// sendUnassignedAppointmentWarnings() reuses this for the same
// "3 Aug" date-label formatting AppointmentAssigned's own notification
// body already uses, rather than a second, possibly-inconsistent scheme.
export function shortDateLabel(dateValue) {
  if (!dateValue) return null;
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

export async function assignBroker(id, brokerId) {
  const broker = await getActiveUserById(brokerId);
  if (!broker) throw { status: 400, message: 'assignBroker: brokerId is not an active user in this organisation' };

  // Fetched before the update — needed for the AppointmentAssigned
  // notification body below (§61), which doesn't need a performer name
  // (unlike LeadAssigned's notification — see leadHandlers.js's assign
  // handler) so it can live entirely in this service function, matching
  // where Task's generation rules already live for the same reason.
  const appt = await executeQueryOne(
    `SELECT a.firstAppointmentDate AS "firstAppointmentDate", a.firstAppointmentTime AS "firstAppointmentTime",
            l.title, l.firstName AS "firstName", l.lastName AS "lastName"
     FROM Appointment a
     LEFT JOIN Lead l ON a.leadId = l.id
     WHERE a.id = @id AND a.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );

  await executeQuery(
    `UPDATE Appointment SET brokerId = @brokerId, status = 'Assigned', updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    {
      id:       { type: sql.UniqueIdentifier, value: id },
      brokerId: { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );

  if (appt) {
    const leadName = [appt.title, appt.firstName, appt.lastName].filter(Boolean).join(' ');
    const dateLabel = shortDateLabel(appt.firstAppointmentDate);
    const whenLabel = [dateLabel, appt.firstAppointmentTime].filter(Boolean).join(', ');
    await createNotification({
      recipientId: brokerId,
      type:        'AppointmentAssigned',
      title:       `New appointment assigned — ${leadName}`,
      body:        `You have been assigned as broker for this appointment.${whenLabel ? ` First meeting: ${whenLabel}.` : ''}`,
      entityType:  'Appointment',
      entityId:    id,
    });
  }
}

/**
 * §117 — brokers self-serving from the Unassigned appointment pool, when
 * appointments.claimModel = 'claim'. Broker-only at the route layer
 * (appointmentHandlers.js) — this is explicitly the SELF-service action
 * the claim model is for, not an Admin/Supervisor action on someone's
 * behalf (that's assignBroker()/reassignAppointment() above, unchanged
 * and still exactly what the assign model uses).
 *
 * ORDERING, DELIBERATE: debits tokens FIRST, then attempts the atomic
 * claim (guarded UPDATE ... WHERE status = 'Unassigned'), and refunds if
 * the claim lost the race (someone else claimed it between this broker
 * loading the list and clicking Claim). Debit-then-claim rather than
 * claim-then-debit specifically so a broker who can't afford an
 * appointment never sees it flash to "claimed" and then revert — they
 * just get the insufficient-tokens error immediately, appointment
 * untouched. See tokenService.js's header for why both steps are each a
 * single guarded UPDATE rather than a multi-statement transaction (none
 * available in this stack).
 * @param {string} id - appointment id
 * @param {string} brokerId
 */
export async function claimAppointment(id, brokerId) {
  const organisationId = resolveOrganisationId();

  const appt = await executeQueryOne(
    `SELECT a.status, a.claimTokenCost AS "claimTokenCost", a.agentId AS "agentId",
            a.firstAppointmentDate AS "firstAppointmentDate", a.firstAppointmentTime AS "firstAppointmentTime",
            l.title, l.firstName AS "firstName", l.lastName AS "lastName"
     FROM Appointment a LEFT JOIN Lead l ON a.leadId = l.id
     WHERE a.id = @id AND a.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!appt) throw { status: 404, message: 'Appointment not found' };
  if (appt.status !== 'Unassigned') {
    throw { status: 409, message: 'This appointment is no longer available to claim' };
  }

  const cost = appt.claimTokenCost ?? 0;
  if (cost > 0) {
    await debitTokensForClaim(brokerId, id, cost); // throws 400 if insufficient tokens
  }

  const claimed = await executeQueryOne(
    `UPDATE Appointment
     SET brokerId = @brokerId, status = 'Claimed', claimedByBrokerId = @brokerId, claimedAt = NOW(), updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId AND status = 'Unassigned'
     RETURNING id`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
    }
  );

  if (!claimed) {
    if (cost > 0) await refundTokens(brokerId, id, cost);
    throw { status: 409, message: 'This appointment is no longer available to claim' };
  }

  const leadName = [appt.title, appt.firstName, appt.lastName].filter(Boolean).join(' ');
  const dateLabel = shortDateLabel(appt.firstAppointmentDate);
  const whenLabel = [dateLabel, appt.firstAppointmentTime].filter(Boolean).join(', ');
  await createNotification({
    recipientId: appt.agentId,
    type:        'AppointmentAssigned', // same notification type assignBroker() uses — this IS an assignment from the agent's point of view, just self-served rather than admin-picked
    title:       `Appointment claimed — ${leadName}`,
    body:        `A broker has claimed this appointment.${whenLabel ? ` First meeting: ${whenLabel}.` : ''}`,
    entityType:  'Appointment',
    entityId:    id,
  });
}

/**
 * The claim pool a broker actually sees — Unassigned appointments
 * (claimModel = 'claim' is enforced at the route layer, not here) whose
 * agent's region matches one of THIS broker's own regions (BrokerRegion)
 * and whose productsInterestedIn overlaps this broker's own product
 * specialisation (BrokerProduct) — mirrors brokerMatchingService.
 * findMatchingBrokers()'s own region+product eligibility rule exactly,
 * just inverted (a broker looking up their own matches, rather than a
 * lead being matched against all brokers). An appointment with no
 * productsInterestedIn recorded is shown to every region-matched broker
 * rather than excluded — treating "no product recorded" as "no product
 * filter" is the safer default; the alternative (hide it from everyone)
 * would make an appointment permanently unclaimable over a data-entry gap.
 *
 * Product matching happens in JS, not SQL — productsInterestedIn is a
 * JSON-text column (see getAppointmentById's own JSON.parse), and
 * matching it against a Postgres TEXT column would mean fragile JSON-in-
 * SQL string matching for no real benefit; fetching this broker's own
 * product names once and intersecting in JS is simpler and exactly as
 * correct.
 * @param {string} brokerId
 */
export async function listAvailableToClaim(brokerId) {
  const organisationId = resolveOrganisationId();

  const brokerProducts = await executeQuery(
    `SELECT prod.name FROM BrokerProduct bp JOIN Product prod ON prod.id = bp.productId WHERE bp.brokerId = @brokerId`,
    { brokerId: { type: sql.UniqueIdentifier, value: brokerId } }
  );
  const brokerProductNames = new Set(brokerProducts.map(p => p.name));

  const candidates = await executeQuery(
    `SELECT ${APPOINTMENT_SELECT} ${APPOINTMENT_JOINS}
     WHERE a.status = 'Unassigned' AND a.organisationId = @organisationId
       AND EXISTS (
         SELECT 1 FROM BrokerRegion br WHERE br.brokerId = @brokerId AND br.region = ag.region
       )
     ORDER BY a.firstAppointmentDate ASC, a.firstAppointmentTime ASC`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
    }
  );

  return candidates.filter((appt) => {
    const interested = appt.productsInterestedIn ? JSON.parse(appt.productsInterestedIn) : [];
    if (interested.length === 0) return true; // no product recorded — show to every region-matched broker, see header comment
    return interested.some((name) => brokerProductNames.has(name));
  }).map((appt) => ({
    ...appt,
    productsInterestedIn: appt.productsInterestedIn ? JSON.parse(appt.productsInterestedIn) : [],
  }));
}

/**
 * Reassign broker and/or agent on an already-assigned appointment.
 * Admin/Supervisor correction — keeps existing status (unlike
 * assignBroker(), which moves Unassigned -> Assigned).
 * @param {string} id
 * @param {{brokerId?: string, agentId?: string}} data
 */
export async function reassignAppointment(id, data) {
  const organisationId = resolveOrganisationId();

  // Fetched once, upfront — both for the broker-conflict check below (was
  // its own narrower query) and, new in §58, so old brokerId/agentId are
  // known before they're overwritten, to move any of their open tasks for
  // this appointment onto whoever takes over.
  const before = await executeQueryOne(
    `SELECT brokerId AS "brokerId", agentId AS "agentId",
            firstAppointmentDate AS "firstAppointmentDate", firstAppointmentTime AS "firstAppointmentTime"
     FROM Appointment WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!before) throw { status: 404, message: 'Appointment not found' };

  const setClauses = [];
  const params = { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  if (data.brokerId !== undefined) {
    if (data.brokerId) {
      const broker = await getActiveUserById(data.brokerId);
      if (!broker) throw { status: 400, message: 'reassign: brokerId is not an active user in this organisation' };

      // Same conflict check as createAppointment() — the appointment's
      // own date/time doesn't change on a broker reassignment, so check
      // the NEW broker's schedule against the EXISTING slot, excluding
      // this appointment itself (it will legitimately hold that slot
      // for the incoming broker once this update lands).
      const conflict = await hasBrokerConflict(data.brokerId, before.firstAppointmentDate, before.firstAppointmentTime, id);
      if (conflict) {
        throw { status: 409, message: 'This broker already has another appointment at this date and time.' };
      }
    }
    setClauses.push('brokerId = @brokerId');
    params.brokerId = { type: sql.UniqueIdentifier, value: data.brokerId };
  }
  if (data.agentId) {
    const agent = await getActiveUserById(data.agentId);
    if (!agent) throw { status: 400, message: 'reassign: agentId is not an active user in this organisation' };
    setClauses.push('agentId = @agentId');
    params.agentId = { type: sql.UniqueIdentifier, value: data.agentId };
  }
  if (setClauses.length === 0) return;

  await executeQuery(
    `UPDATE Appointment SET ${setClauses.join(', ')}, updatedAt = NOW() WHERE id = @id AND organisationId = @organisationId`,
    params
  );

  // TASK CLEANUP (§58) — a Reschedule/Outcome task assigned to the old
  // broker, or a Confirm-appointment task assigned to the old agent, is
  // still real; it just needs to follow whoever took over. Only fires when
  // the field is being SET to a real person, not cleared — reassign()
  // clearing a broker back to null is a rarer edge left alone rather than
  // guessed at here.
  if (data.brokerId) {
    await reassignTasksForEntity({ entityType: 'Appointment', entityId: id, oldAssigneeId: before.brokerId, newAssigneeId: data.brokerId });
  }
  if (data.agentId) {
    await reassignTasksForEntity({ entityType: 'Appointment', entityId: id, oldAssigneeId: before.agentId, newAssigneeId: data.agentId });
  }
}

/**
 * Admin/Supervisor returns an appointment to the unassigned leads queue.
 * Refuses if the deal is already won (customerSigned = true), matching the
 * comment already in services/api.js.
 *
 * CHANGED 23 Jul 2026 (Mark's request, §36) — previously deleted the
 * Appointment row outright (justified at the time by there being no
 * archive column, and by the now-removed UNIQUE leadId constraint meaning
 * the Lead couldn't get a new Appointment while an old row existed). Mark's
 * point: that loses history that matters for metrics — how many
 * appointments get returned, by whom, why — and the audit log entry this
 * function's caller writes became practically unreachable once the row it
 * referenced was gone. Now: the Appointment is LOCKED via a new terminal
 * status (ReturnedToLeads) instead of deleted. Same UI lock treatment as
 * ClosedWon/ClosedLost on AppointmentDetail.jsx (see isLocked there), just
 * not counted as a sales outcome — it's its own status, not lumped into
 * Closed Won/Lost, so win/loss metrics aren't skewed by administrative
 * returns.
 * @param {string} id
 */
export async function returnToLeads(id) {
  const organisationId = resolveOrganisationId();
  const appt = await executeQueryOne(
    `SELECT id, leadId AS "leadId", customerSigned AS "customerSigned" FROM Appointment WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!appt) throw { status: 404, message: 'Appointment not found' };
  if (appt.customerSigned === true) throw { status: 400, message: 'Cannot return a signed (ClosedWon) appointment to the leads queue' };

  await executeQuery(
    `UPDATE Appointment SET status = 'ReturnedToLeads', closedAt = NOW(), updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  await executeQuery(
    `UPDATE Lead SET pipelineStatus = 'Unassigned', assignedAgentId = NULL, updatedAt = NOW()
     WHERE id = @leadId AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: appt.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );

  // TASK CLEANUP (§58) — the appointment is now locked/terminal, so any
  // Confirm/Assign-broker/Reschedule/Outcome task tied to it has nothing
  // left to confirm/reschedule/record. The Lead also loses its agent
  // (assignedAgentId cleared above), so a Callback task tied to the Lead
  // directly is equally moot — nobody currently owns this lead to act on
  // it. Both deleted, not reassigned — unlike a reassignment, there's no
  // "new owner" to hand these off to; the need itself is gone.
  await deleteTasksForEntity({ entityType: 'Appointment', entityId: id });
  await deleteTasksForEntity({ entityType: 'Lead', entityId: appt.leadId });
}

/**
 * Save the appointment outcome — meetings, products sold, signed decision.
 * Computes the resulting status server-side via appointmentStatusService.js;
 * the client never sends status directly.
 * @param {string} id
 * @param {Object} data - validated SaveOutcomeSchema data
 * @returns {Promise<{status: string}>}
 */
/**
 * Save the appointment outcome — meetings, products sold, signed decision.
 * Computes the resulting status server-side via appointmentStatusService.js;
 * the client never sends status directly.
 *
 * LOCKING (added 23 Jul 2026, revised same day, Mark's request):
 *   - Once status is ClosedWon/ClosedLost/ReturnedToLeads, the whole
 *     appointment is locked — the entire call is rejected rather than
 *     silently no-op'd, so the UI gets a clear error instead of a save
 *     that looked like it worked.
 *   - Individual meetings are NOT separately locked server-side (this was
 *     tried and then reverted the same day). The original version silently
 *     dropped any edit to a meeting whose persisted status was already
 *     'Seen' — reasonable-sounding defence-in-depth, but it directly
 *     conflicted with Mark's very next request: selecting "Seen" must not
 *     itself lock anything, only an explicit Save should, and even after
 *     that save, the meeting should be re-editable via "Unlock to Edit" on
 *     AppointmentDetail.jsx. That's a purely client-side concept now —
 *     heldMeetingNums/unlockedMeetingNums in the frontend component, no
 *     equivalent here. The appointment-level check above is the only real
 *     boundary left; whatever the client sends for an individual meeting
 *     is trusted and written as-is, same as any other field on this call.
 * @param {string} id
 * @param {Object} data - validated SaveOutcomeSchema data
 * @returns {Promise<{status: string}>}
 */
export async function saveOutcome(id, data) {
  const organisationId = resolveOrganisationId();
  const current = await executeQueryOne(
    `SELECT a.status, a.brokerId AS "brokerId", a.leadId AS "leadId",
            a.meeting1Status AS "meeting1Status", a.meeting2Status AS "meeting2Status", a.meeting3Status AS "meeting3Status",
            l.title, l.firstName AS "firstName", l.lastName AS "lastName"
     FROM Appointment a
     LEFT JOIN Lead l ON a.leadId = l.id
     WHERE a.id = @id AND a.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!current) throw { status: 404, message: 'Appointment not found' };
  if (['ClosedWon', 'ClosedLost', 'ReturnedToLeads'].includes(current.status)) {
    throw { status: 400, message: 'This appointment is locked and can no longer be edited.' };
  }

  const newStatus = computeAppointmentStatus(current.status, {
    customerSigned: data.customerSigned,
    meetings: data.meetings,
  });

  const setClauses = ['status = @status', 'updatedAt = NOW()'];
  const params = {
    id:     { type: sql.UniqueIdentifier, value: id },
    status: { type: sql.NVarChar(50),     value: newStatus },
    organisationId: { type: sql.UniqueIdentifier, value: organisationId },
  };

  // §148 (13 Aug 2026, migration 027) — set exactly once, the moment this
  // save is the one that actually closes the deal. current.status is
  // checked (not newStatus) so a save that merely re-confirms an
  // already-closed status can't happen at all (the guard above already
  // throws for that), and so a save that transitions through an
  // intermediate state on the way to closed still gets the real close
  // timestamp from the save that actually got it there, not an earlier one.
  if (['ClosedWon', 'ClosedLost'].includes(newStatus) && !['ClosedWon', 'ClosedLost'].includes(current.status)) {
    setClauses.push('closedAt = NOW()');
  }

  if (data.customerSigned !== undefined) {
    setClauses.push('customerSigned = @customerSigned');
    params.customerSigned = { type: sql.Bit, value: data.customerSigned };
  }

  for (const meeting of data.meetings ?? []) {
    const n = meeting.number;
    if (![1, 2, 3].includes(n)) continue;
    setClauses.push(`meeting${n}Date = @meeting${n}Date`, `meeting${n}Status = @meeting${n}Status`, `meeting${n}Feedback = @meeting${n}Feedback`);
    params[`meeting${n}Date`]     = { type: sql.Date,            value: meeting.date || null };
    params[`meeting${n}Status`]   = { type: sql.NVarChar(50),    value: meeting.status || null };
    params[`meeting${n}Feedback`] = { type: sql.NVarChar(2000),  value: meeting.notes || null };
  }

  await executeQuery(`UPDATE Appointment SET ${setClauses.join(', ')} WHERE id = @id AND organisationId = @organisationId`, params);

  // TASK GENERATION REMOVED HERE (§138, 12 Aug 2026) — this used to create
  // Reschedule and Outcome tasks on a meeting-status transition. Mark's own
  // test for a Task (concrete action + a real due date) doesn't hold for
  // either: a Reschedule IS the action, captured live on the call, nothing
  // left to chase; a meeting sitting Held with no outcome saved is already
  // visible via Appointments list filtering, so a dedicated Task duplicated
  // a state the entity itself already carries. Both now generate zero
  // events — not moved to Notification, genuinely nothing fires. See
  // Status_Vercel.md §138 for the full reasoning.

  if (data.productsSold !== undefined) {
    const idMap = await resolveProductIdMap(data.productsSold.map(p => p.product));
    const productsWithValues = data.productsSold
      .filter(p => idMap.has(p.product)) // silently drop any name that doesn't match a real Product — same tolerant behaviour the old resolveProductIds() had
      .map(p => ({ productId: idMap.get(p.product), value: p.value ?? null }));
    await syncAppointmentProducts(id, productsWithValues);
  }

  return { status: newStatus };
}
