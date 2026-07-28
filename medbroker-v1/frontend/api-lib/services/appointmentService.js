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
 * Scope: the ASSIGN model only — see models/appointment.js header for why
 * the CLAIM model (broker self-serve + token economy) is deliberately not
 * built here.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { computeAppointmentStatus } from './appointmentStatusService.js';
import { getActiveUserById, resolvePortfolioIds } from './userService.js';
import { createTask, deleteTasksForEntity, reassignTasksForEntity } from './taskService.js';
import { createNotification } from './notificationService.js';
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
  a.firstAppointmentAddress AS "firstAppointmentAddress",
  a.productsInterestedIn AS "productsInterestedIn",
  a.currentInsurer AS "currentInsurer",
  a.meeting1Date AS "meeting1Date", a.meeting1Status AS "meeting1Status",
  a.meeting1Feedback AS "meeting1Feedback",
  a.meeting2Date AS "meeting2Date", a.meeting2Status AS "meeting2Status",
  a.meeting2Feedback AS "meeting2Feedback",
  a.meeting3Date AS "meeting3Date", a.meeting3Status AS "meeting3Status",
  a.meeting3Feedback AS "meeting3Feedback",
  a.customerSigned AS "customerSigned", a.isBrokerSwitch AS "isBrokerSwitch",
  a.createdAt AS "createdAt", a.updatedAt AS "updatedAt",
  l.id AS "leadId", l.title, l.firstName AS "firstName", l.lastName AS "lastName",
  l.email AS "leadEmail", l.mobileNumber AS "leadMobile", l.occupation,
  COALESCE(ev.name, ms.name, l.manualSourceName) AS "sourceLabel",
  ag.displayName AS "agentName",
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
  // Changed 23 Jul 2026 (§45, Mark's request) — data.portfolios is now an
  // array (min 1, enforced by CreateAppointmentSchema). portfolioId (the
  // Appointment column) becomes the PRIMARY portfolio — the first one
  // selected — while the full set goes into AppointmentPortfolio below.
  const portfolioIds = await resolvePortfolioIds(data.portfolios);
  if (portfolioIds.length === 0) throw { status: 400, message: `Unknown portfolio: ${data.portfolios.join(', ')}` };
  const portfolioId = portfolioIds[0];

  const lead = await executeQueryOne(
    `SELECT l.assignedAgentId AS "assignedAgentId", l.title, l.firstName AS "firstName", l.lastName AS "lastName",
            ag.supervisorId AS "agentSupervisorId"
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
       firstAppointmentDate, firstAppointmentTime, firstAppointmentAddress,
       productsInterestedIn, currentInsurer, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @leadId, @status, @agentId, @brokerId, @portfolioId,
       @firstAppointmentDate, @firstAppointmentTime, @firstAppointmentAddress,
       @productsInterestedIn, @currentInsurer, NOW(), NOW()
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
      firstAppointmentAddress: { type: sql.NVarChar(500),     value: data.firstAppointmentAddress ?? null },
      productsInterestedIn:    { type: sql.NVarChar(sql.MAX), value: data.productsInterestedIn ? JSON.stringify(data.productsInterestedIn) : null },
      currentInsurer:          { type: sql.NVarChar(200),     value: data.currentInsurer ?? null },
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

  // TASK GENERATION (§56), rules 2 and 5 of 5 — matches Tasks.jsx's own
  // header spec. Both are outcomes of this same booking call, split on the
  // same brokerId-present-or-absent branch that already decided `status`
  // above, not two separate touchpoints:
  //   "Appointment booked     -> Confirm appointment with [broker] — [date]"
  //   "Appointment unassigned -> Assign broker — [lead name]"
  const leadName = [lead.title, lead.firstName, lead.lastName].filter(Boolean).join(' ');
  if (status === 'Assigned') {
    await createTask({
      assignedToId: agentId,
      type:         'Appointment',
      entityType:   'Appointment',
      entityId:     newId,
      title:        `Confirm appointment with ${broker.displayName} — ${data.firstAppointmentDate}`,
      dueAt:        data.firstAppointmentDate,
    });
  } else {
    // No broker chosen at booking — routed to the agent's Supervisor
    // (assignBroker() is Supervisor/Admin/GlobalAdmin-only, see
    // appointmentHandlers.js — an Agent couldn't act on this task even if
    // it landed on them). Falls back to the agent themselves if they have
    // no supervisorId set, since Task.assignedToId is NOT NULL — never
    // left orphaned to nobody.
    await createTask({
      assignedToId: lead.agentSupervisorId ?? agentId,
      type:         'Appointment',
      entityType:   'Appointment',
      entityId:     newId,
      title:        `Assign broker — ${leadName}`,
      dueAt:        data.firstAppointmentDate,
    });
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
function shortDateLabel(dateValue) {
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
    `UPDATE Appointment SET status = 'ReturnedToLeads', updatedAt = NOW()
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

  // TASK GENERATION (§56), rules 3 and 4 of 5 — matches Tasks.jsx's own
  // header spec: "Meeting marked Rescheduled -> Reschedule [lead name]
  // [nth] meeting" / "Meeting marked Seen -> Record outcome — [lead name]".
  // Gated on a genuine TRANSITION into that status (compared against
  // current.meetingNStatus fetched above), not merely "the payload
  // contains this status" — otherwise re-saving an already-Rescheduled
  // meeting would spawn a fresh task every time. Assigned to the broker
  // (they're the one who was in the meeting) — skipped gracefully if this
  // appointment somehow has no brokerId yet, rather than crashing on a
  // NOT NULL violation.
  if (current.brokerId) {
    const leadName = [current.title, current.firstName, current.lastName].filter(Boolean).join(' ');
    const NTH = { 1: 'first', 2: 'second', 3: 'third' };
    for (const meeting of data.meetings ?? []) {
      const n = meeting.number;
      if (![1, 2, 3].includes(n)) continue;
      const previousStatus = current[`meeting${n}Status`];
      if (meeting.status === previousStatus) continue; // no real transition — nothing to generate

      if (meeting.status === 'Rescheduled') {
        await createTask({
          assignedToId: current.brokerId,
          type:         'Reschedule',
          entityType:   'Appointment',
          entityId:     id,
          title:        `Reschedule ${leadName} ${NTH[n]} meeting`,
          detail:       meeting.notes || null,
        });
      } else if (meeting.status === 'Seen') {
        await createTask({
          assignedToId: current.brokerId,
          type:         'Outcome',
          entityType:   'Appointment',
          entityId:     id,
          title:        `Record outcome — ${leadName}`,
          detail:       meeting.notes || null,
        });
      }
    }
  }

  if (data.productsSold !== undefined) {
    const idMap = await resolveProductIdMap(data.productsSold.map(p => p.product));
    const productsWithValues = data.productsSold
      .filter(p => idMap.has(p.product)) // silently drop any name that doesn't match a real Product — same tolerant behaviour the old resolveProductIds() had
      .map(p => ({ productId: idMap.get(p.product), value: p.value ?? null }));
    await syncAppointmentProducts(id, productsWithValues);
  }

  return { status: newStatus };
}
