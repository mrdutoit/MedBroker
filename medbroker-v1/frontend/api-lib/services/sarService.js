/**
 * services/sarService.js — NEW (§79).
 * POPIA Subject Access Request processing. Two distinct concerns:
 *   - Tracking the request itself (who asked, when, status, due date)
 *   - Compiling everything MedBroker actually holds about that Lead into
 *     one structured export (compileSubjectData) — the part that
 *     actually fulfils the request
 */
import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { decrypt } from './encryption.js';
import { writeAuditLog } from './auditService.js';

const SAR_SELECT = `
  sar.id, sar.leadId AS "leadId", sar.requestorName AS "requestorName",
  sar.requestorEmail AS "requestorEmail", sar.receivedAt AS "receivedAt",
  sar.dueDate AS "dueDate", sar.status, sar.notes,
  sar.fulfilledAt AS "fulfilledAt", sar.fulfilledById AS "fulfilledById",
  sar.createdById AS "createdById", sar.createdAt AS "createdAt", sar.updatedAt AS "updatedAt",
  CONCAT_WS(' ', l.title, l.firstName, l.lastName) AS "leadName",
  cu.displayName AS "createdByName",
  fu.displayName AS "fulfilledByName"`;

const SAR_JOINS = `
  FROM SubjectAccessRequest sar
  LEFT JOIN Lead l    ON sar.leadId = l.id
  LEFT JOIN "User" cu ON sar.createdById = cu.id
  LEFT JOIN "User" fu ON sar.fulfilledById = fu.id`;

/**
 * @param {{page?: number, pageSize?: number, status?: string}} params
 */
export async function listSarRequests({ page = 1, pageSize = 25, status } = {}) {
  const organisationId = resolveOrganisationId();
  const offset = (page - 1) * pageSize;
  let whereClause = 'WHERE sar.organisationId = @organisationId';
  const params = { organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  if (status) {
    whereClause += ' AND sar.status = @status';
    params.status = { type: sql.NVarChar(20), value: status };
  }

  const [rows, [{ total }]] = await Promise.all([
    executeQuery(
      `SELECT ${SAR_SELECT} ${SAR_JOINS} ${whereClause}
       ORDER BY sar.receivedAt DESC, sar.createdAt DESC
       LIMIT @pageSize OFFSET @offset`,
      { ...params, pageSize: { type: sql.Int, value: pageSize }, offset: { type: sql.Int, value: offset } }
    ),
    executeQuery(`SELECT COUNT(*)::int AS total FROM SubjectAccessRequest sar ${whereClause}`, params),
  ]);

  return { requests: rows, total, page, pageSize };
}

/** @param {string} id */
export async function getSarRequestById(id) {
  return executeQueryOne(
    `SELECT ${SAR_SELECT} ${SAR_JOINS} WHERE sar.id = @id AND sar.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * @param {Object} data - CreateSarRequestSchema shape
 * @param {string} createdById
 */
export async function createSarRequest(data, createdById) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO SubjectAccessRequest (
       id, organisationId, leadId, requestorName, requestorEmail,
       receivedAt, dueDate, notes, createdById, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @leadId, @requestorName, @requestorEmail,
       @receivedAt, @dueDate, @notes, @createdById, NOW(), NOW()
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      leadId:         { type: sql.UniqueIdentifier, value: data.leadId },
      requestorName:  { type: sql.NVarChar(200),    value: data.requestorName },
      requestorEmail: { type: sql.NVarChar(255),    value: data.requestorEmail },
      receivedAt:     { type: sql.Date,             value: data.receivedAt },
      dueDate:        { type: sql.Date,             value: data.dueDate ?? null },
      notes:          { type: sql.NVarChar(2000),   value: data.notes ?? null },
      createdById:    { type: sql.UniqueIdentifier, value: createdById },
    }
  );

  await writeAuditLog({
    entityType: 'Lead', entityId: data.leadId, action: 'SarRequestCreated',
    performedById: createdById, changeDetail: JSON.stringify({ requestorEmail: data.requestorEmail }),
  });

  return newId;
}

/**
 * @param {string} id
 * @param {{status: string, notes?: string}} data
 * @param {string} performedById
 */
export async function updateSarStatus(id, data, performedById) {
  const isFulfilled = data.status === 'Fulfilled';
  await executeQuery(
    `UPDATE SubjectAccessRequest
     SET status = @status,
         notes = COALESCE(@notes, notes),
         fulfilledAt = CASE WHEN @isFulfilled THEN NOW() ELSE fulfilledAt END,
         fulfilledById = CASE WHEN @isFulfilled THEN @performedById ELSE fulfilledById END,
         updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    {
      id:            { type: sql.UniqueIdentifier, value: id },
      organisationId:{ type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      status:        { type: sql.NVarChar(20),     value: data.status },
      notes:         { type: sql.NVarChar(2000),   value: data.notes ?? null },
      isFulfilled:   { type: sql.Bit,               value: isFulfilled },
      performedById: { type: sql.UniqueIdentifier, value: performedById },
    }
  );

  const existing = await getSarRequestById(id);
  await writeAuditLog({
    entityType: 'Lead', entityId: existing?.leadId, action: 'SarStatusChanged',
    performedById, changeDetail: JSON.stringify({ sarId: id, newStatus: data.status }),
  });
}

/**
 * The actual fulfilment step — compiles everything MedBroker holds
 * about one Lead into a single structured object: the Lead record
 * itself (ID number DECRYPTED here specifically, since a subject
 * requesting their own data needs to actually see it, not the
 * ciphertext), every call attempt, every appointment with its meeting
 * history, every task linked to the lead, and the lead's own audit
 * trail (who accessed/changed their data — POPIA's accountability angle,
 * not just the raw data itself).
 * @param {string} leadId
 */
export async function compileSubjectData(leadId) {
  const organisationId = resolveOrganisationId();
  const orgParam = { organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const leadParam = { leadId: { type: sql.UniqueIdentifier, value: leadId } };

  const lead = await executeQueryOne(
    `SELECT id, title, firstName AS "firstName", lastName AS "lastName",
            dateOfBirth AS "dateOfBirth", idNumberEncrypted AS "idNumberEncrypted",
            email, mobileNumber AS "mobileNumber", whatsappNumber AS "whatsappNumber",
            universityAttended AS "universityAttended", yearOfAttendance AS "yearOfAttendance",
            degreeAttained AS "degreeAttained", occupation, hospitalOrPractice AS "hospitalOrPractice",
            existingCover AS "existingCover", currentInsurer AS "currentInsurer", policies,
            medicalAid AS "medicalAid", medicalAidProvider AS "medicalAidProvider",
            pipelineStatus AS "pipelineStatus", createdAt AS "createdAt"
     FROM Lead WHERE id = @leadId AND organisationId = @organisationId`,
    { ...leadParam, ...orgParam }
  );
  if (!lead) return null;

  // Decrypt the ID number specifically for this export — the one place
  // in the app where showing the plaintext to a staff member is exactly
  // the point, not a leak. Every other view of a Lead never does this.
  lead.idNumber = lead.idNumberEncrypted ? await decrypt(lead.idNumberEncrypted) : null;
  delete lead.idNumberEncrypted;

  const [callAttempts, appointments, tasks, auditTrail] = await Promise.all([
    executeQuery(
      `SELECT ca.id, ca.outcome, ca.callTime AS "callTime", ca.notes,
              ca.followUpDateTime AS "followUpDateTime", au.displayName AS "loggedBy"
       FROM CallAttempt ca LEFT JOIN "User" au ON ca.agentId = au.id
       WHERE ca.leadId = @leadId AND ca.organisationId = @organisationId
       ORDER BY ca.callTime ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT id, status, firstAppointmentDate AS "date", firstAppointmentTime AS "time",
              productsInterestedIn AS "productsInterestedIn", customerSigned AS "customerSigned",
              meeting1Status AS "meeting1Status", meeting1Feedback AS "meeting1Feedback",
              meeting2Status AS "meeting2Status", meeting2Feedback AS "meeting2Feedback",
              meeting3Status AS "meeting3Status", meeting3Feedback AS "meeting3Feedback",
              createdAt AS "createdAt"
       FROM Appointment WHERE leadId = @leadId AND organisationId = @organisationId
       ORDER BY createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT id, type, title, detail, isComplete AS "isComplete", createdAt AS "createdAt"
       FROM Task WHERE entityType = 'Lead' AND entityId = @leadId AND organisationId = @organisationId
       ORDER BY createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT al.action, al.performedAt AS "performedAt", pu.displayName AS "performedBy"
       FROM AuditLog al LEFT JOIN "User" pu ON al.performedById = pu.id
       WHERE al.entityType = 'Lead' AND al.entityId = @leadId AND al.organisationId = @organisationId
       ORDER BY al.performedAt ASC`,
      { ...leadParam, ...orgParam }
    ),
  ]);

  return { lead, callAttempts, appointments, tasks, auditTrail, compiledAt: new Date().toISOString() };
}
