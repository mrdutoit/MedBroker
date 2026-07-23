/**
 * services/appointmentService.js — NEW.
 * Business logic and data access for the Appointment entity — the "active
 * deal", 1:1 child of Lead (UNIQUE leadId), matching AppointmentDetail.jsx's
 * own header comment describing it as analogous to a Salesforce Opportunity.
 *
 * Scope: the ASSIGN model only — see models/appointment.js header for why
 * the CLAIM model (broker self-serve + token economy) is deliberately not
 * built here.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { computeAppointmentStatus } from './appointmentStatusService.js';
import { getActiveUserById } from './userService.js';
import { resolveOrganisationId } from '../context/tenant.js';

// ── Shared SELECT fragments ─────────────────────────────────────────────────

const APPOINTMENT_SELECT = `
  a.id, a.status, a.agentId AS "agentId", a.brokerId AS "brokerId",
  a.portfolioId AS "portfolioId", p.name AS "portfolio",
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

async function resolvePortfolioId(name) {
  const row = await executeQueryOne(`SELECT id FROM Portfolio WHERE name = @name`, {
    name: { type: sql.NVarChar(200), value: name },
  });
  return row?.id ?? null;
}

async function resolveProductIds(names) {
  if (!names || names.length === 0) return [];
  const rows = await executeQuery(`SELECT id FROM Product WHERE name = ANY(@names)`, {
    names: { type: sql.NVarChar(sql.MAX), value: names },
  });
  return rows.map((r) => r.id);
}

async function getProductNames(appointmentId) {
  const rows = await executeQuery(
    `SELECT p.name FROM AppointmentProduct ap JOIN Product p ON ap.productId = p.id WHERE ap.appointmentId = @appointmentId`,
    { appointmentId: { type: sql.UniqueIdentifier, value: appointmentId } }
  );
  return rows.map((r) => r.name);
}

async function syncAppointmentProducts(appointmentId, productIds) {
  await executeQuery(`DELETE FROM AppointmentProduct WHERE appointmentId = @appointmentId`, {
    appointmentId: { type: sql.UniqueIdentifier, value: appointmentId },
  });
  for (const productId of productIds) {
    await executeQuery(
      `INSERT INTO AppointmentProduct (id, appointmentId, productId) VALUES (@id, @appointmentId, @productId)`,
      {
        id:            { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        appointmentId: { type: sql.UniqueIdentifier, value: appointmentId },
        productId:     { type: sql.UniqueIdentifier, value: productId },
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
export async function listAppointments({ status, brokerId, agentId, portfolio, source, search, page, pageSize, supervisorAgentIds }) {
  const offset = (page - 1) * pageSize;
  let whereClause = 'WHERE a.organisationId = @organisationId';
  const params = { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } };

  if (status) {
    whereClause += ' AND a.status = @status';
    params.status = { type: sql.NVarChar(50), value: status };
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
  appt.productsSold = await getProductNames(id);
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
export async function createAppointment(data) {
  const organisationId = resolveOrganisationId();
  const portfolioId = await resolvePortfolioId(data.portfolio);
  if (!portfolioId) throw { status: 400, message: `Unknown portfolio: ${data.portfolio}` };

  const lead = await executeQueryOne(
    `SELECT assignedAgentId AS "assignedAgentId" FROM Lead
     WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: data.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!lead) throw { status: 404, message: 'Lead not found' };
  if (!lead.assignedAgentId) throw { status: 400, message: 'This lead has no assigned agent — assign it to an agent before booking an appointment' };
  const agentId = lead.assignedAgentId;

  if (data.brokerId) {
    const broker = await getActiveUserById(data.brokerId);
    if (!broker) throw { status: 400, message: 'brokerId is not an active user in this organisation' };
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

  // Side effect matching the documented design: the Lead is now "in" an
  // appointment, so it moves out of the Leads list (LeadList.jsx explicitly
  // excludes AppointmentScheduled leads) and into Appointments.
  await executeQuery(
    `UPDATE Lead SET pipelineStatus = 'AppointmentScheduled', updatedAt = NOW()
     WHERE id = @leadId AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: data.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );

  return newId;
}

/**
 * First-time broker assignment on an Unassigned appointment. Mirrors
 * leadService.assignLead()'s A2 pattern — validates the target is a real,
 * active user before assigning.
 * @param {string} id
 * @param {string} brokerId
 */
export async function assignBroker(id, brokerId) {
  const broker = await getActiveUserById(brokerId);
  if (!broker) throw { status: 400, message: 'assignBroker: brokerId is not an active user in this organisation' };

  await executeQuery(
    `UPDATE Appointment SET brokerId = @brokerId, status = 'Assigned', updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    {
      id:       { type: sql.UniqueIdentifier, value: id },
      brokerId: { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Reassign broker and/or agent on an already-assigned appointment.
 * Admin/Supervisor correction — keeps existing status (unlike
 * assignBroker(), which moves Unassigned -> Assigned).
 * @param {string} id
 * @param {{brokerId?: string, agentId?: string}} data
 */
export async function reassignAppointment(id, data) {
  const setClauses = [];
  const params = { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } };

  if (data.brokerId !== undefined) {
    if (data.brokerId) {
      const broker = await getActiveUserById(data.brokerId);
      if (!broker) throw { status: 400, message: 'reassign: brokerId is not an active user in this organisation' };
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
}

/**
 * Admin/Supervisor returns an appointment to the unassigned leads queue —
 * refuses if the deal is already won (customerSigned = true), matching the
 * comment already in services/api.js. The schema has no archive/soft-delete
 * column for Appointment (and the UNIQUE leadId constraint means the Lead
 * can't get a new appointment while an old row still exists), so this is a
 * genuine delete, not an "archive" despite the frontend comment's wording —
 * confirmed against the actual schema, not assumed.
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

  await executeQuery(`DELETE FROM AppointmentProduct WHERE appointmentId = @id`, { id: { type: sql.UniqueIdentifier, value: id } });
  await executeQuery(`DELETE FROM Appointment WHERE id = @id AND organisationId = @organisationId`, {
    id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId },
  });
  await executeQuery(
    `UPDATE Lead SET pipelineStatus = 'Unassigned', assignedAgentId = NULL, updatedAt = NOW()
     WHERE id = @leadId AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: appt.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
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
 * LOCKING (added 23 Jul 2026, Mark's request):
 *   - Once status is ClosedWon/ClosedLost, the whole appointment is locked —
 *     the entire call is rejected rather than silently no-op'd, so the UI
 *     gets a clear error instead of a save that looked like it worked.
 *   - Individually, once a given meeting's persisted status is 'Seen' (held),
 *     that meeting is locked — any incoming changes to its date/status/notes
 *     are silently dropped rather than erroring, so a single saveOutcome call
 *     can still legitimately touch a signed decision or a still-open later
 *     meeting alongside an already-held one without failing the whole request.
 *     Mirrors the "Mark Meeting Held" button on AppointmentDetail.jsx, which
 *     is the only client-side path that sets a meeting to Seen in the first
 *     place — this is defence-in-depth against a stale form re-submitting.
 * @param {string} id
 * @param {Object} data - validated SaveOutcomeSchema data
 * @returns {Promise<{status: string}>}
 */
export async function saveOutcome(id, data) {
  const organisationId = resolveOrganisationId();
  const current = await executeQueryOne(
    `SELECT status, meeting1Status AS "meeting1Status", meeting2Status AS "meeting2Status", meeting3Status AS "meeting3Status"
     FROM Appointment WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!current) throw { status: 404, message: 'Appointment not found' };
  if (current.status === 'ClosedWon' || current.status === 'ClosedLost') {
    throw { status: 400, message: 'This appointment is closed and can no longer be edited.' };
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
    if (current[`meeting${n}Status`] === 'Seen') continue; // locked — already held, drop the edit
    setClauses.push(`meeting${n}Date = @meeting${n}Date`, `meeting${n}Status = @meeting${n}Status`, `meeting${n}Feedback = @meeting${n}Feedback`);
    params[`meeting${n}Date`]     = { type: sql.Date,            value: meeting.date || null };
    params[`meeting${n}Status`]   = { type: sql.NVarChar(50),    value: meeting.status || null };
    params[`meeting${n}Feedback`] = { type: sql.NVarChar(2000),  value: meeting.notes || null };
  }

  await executeQuery(`UPDATE Appointment SET ${setClauses.join(', ')} WHERE id = @id AND organisationId = @organisationId`, params);

  if (data.productsSold !== undefined) {
    const productIds = await resolveProductIds(data.productsSold);
    await syncAppointmentProducts(id, productIds);
  }

  return { status: newStatus };
}
