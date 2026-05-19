/**
 * services/leadService.js
 * Business logic and data access for the Lead entity.
 * All database operations for leads go through this service.
 *
 * POPIA notes:
 * - id_number is encrypted before insert and decrypted only when explicitly requested
 *   (i.e. Subject Access Requests handled by admin functions, not standard list/get)
 * - Standard GET and LIST responses never include the plaintext id_number
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { encrypt } from './encryption.js';
import { config } from '../config.js';

/**
 * List leads with optional filters and pagination.
 * @param {Object} filters - from LeadListQuerySchema
 * @returns {Promise<{ leads: Array, total: number, page: number, pageSize: number }>}
 */
export async function listLeads({ status, agentId, brokerId, eventId, search, page, pageSize }) {
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE l.deletedAt IS NULL';
  const params = {};

  if (status) {
    whereClause += ' AND l.pipelineStatus = @status';
    params.status = { type: sql.NVarChar(50), value: status };
  }
  if (agentId) {
    whereClause += ' AND l.assignedAgentId = @agentId';
    params.agentId = { type: sql.UniqueIdentifier, value: agentId };
  }
  if (brokerId) {
    whereClause += ' AND l.assignedBrokerId = @brokerId';
    params.brokerId = { type: sql.UniqueIdentifier, value: brokerId };
  }
  if (eventId) {
    whereClause += ' AND l.linkedEventId = @eventId';
    params.eventId = { type: sql.UniqueIdentifier, value: eventId };
  }
  if (search) {
    whereClause += ' AND (l.firstName LIKE @search OR l.lastName LIKE @search OR l.email LIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }

  // Total count for pagination
  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total FROM Lead l ${whereClause}`,
    params
  );
  const total = countResult[0]?.total ?? 0;

  // Paginated results — id_number intentionally excluded from list view
  const leads = await executeQuery(
    `SELECT
       l.id, l.firstName, l.lastName, l.email, l.mobileNumber,
       l.whatsappNumber, l.universityAttended, l.yearOfAttendance,
       l.degreeAttained, l.occupation, l.hospitalOrPractice,
       l.existingCover, l.policies, l.medicalAid, l.medicalAidProvider,
       l.leadSource, l.linkedEventId, l.pipelineStatus,
       l.assignedAgentId, l.assignedBrokerId,
       l.createdAt, l.updatedAt,
       a.displayName AS agentName,
       b.displayName AS brokerName
     FROM Lead l
     LEFT JOIN [User] a ON l.assignedAgentId = a.id
     LEFT JOIN [User] b ON l.assignedBrokerId = b.id
     ${whereClause}
     ORDER BY l.createdAt DESC
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    {
      ...params,
      offset:   { type: sql.Int, value: offset },
      pageSize: { type: sql.Int, value: pageSize },
    }
  );

  return { leads, total, page, pageSize };
}

/**
 * Get a single lead by ID.
 * Does not return id_number — use getLeadWithIdNumber() for POPIA SAR only.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getLeadById(id) {
  return executeQueryOne(
    `SELECT
       l.id, l.firstName, l.lastName, l.email, l.mobileNumber,
       l.whatsappNumber, l.universityAttended, l.yearOfAttendance,
       l.degreeAttained, l.occupation, l.hospitalOrPractice,
       l.existingCover, l.policies, l.medicalAid, l.medicalAidProvider,
       l.leadSource, l.linkedEventId, l.pipelineStatus,
       l.assignedAgentId, l.assignedBrokerId, l.createdAt, l.updatedAt
     FROM Lead l
     WHERE l.id = @id AND l.deletedAt IS NULL`,
    { id: { type: sql.UniqueIdentifier, value: id } }
  );
}

/**
 * Create a new lead. Encrypts id_number before storage.
 * @param {Object} data - validated CreateLeadSchema data
 * @param {string} createdById - user ID of the person creating the record
 * @returns {Promise<string>} the new lead ID
 */
export async function createLead(data, createdById) {
  const encryptedIdNumber = data.idNumber ? await encrypt(data.idNumber) : null;
  const newId = crypto.randomUUID();

  await executeQuery(
    `INSERT INTO Lead (
       id, firstName, lastName, idNumberEncrypted, email,
       mobileNumber, whatsappNumber, universityAttended, yearOfAttendance,
       degreeAttained, occupation, hospitalOrPractice, existingCover, policies,
       medicalAid, medicalAidProvider, leadSource, linkedEventId, pipelineStatus,
       createdById, createdAt, updatedAt
     ) VALUES (
       @id, @firstName, @lastName, @idNumberEncrypted, @email,
       @mobileNumber, @whatsappNumber, @universityAttended, @yearOfAttendance,
       @degreeAttained, @occupation, @hospitalOrPractice, @existingCover, @policies,
       @medicalAid, @medicalAidProvider, @leadSource, @linkedEventId, 'Unassigned',
       @createdById, GETUTCDATE(), GETUTCDATE()
     )`,
    {
      id:                   { type: sql.UniqueIdentifier,   value: newId },
      firstName:            { type: sql.NVarChar(100),      value: data.firstName },
      lastName:             { type: sql.NVarChar(100),      value: data.lastName },
      idNumberEncrypted:    { type: sql.NVarChar(sql.MAX),  value: encryptedIdNumber },
      email:                { type: sql.NVarChar(255),      value: data.email },
      mobileNumber:         { type: sql.NVarChar(20),       value: data.mobileNumber ?? null },
      whatsappNumber:       { type: sql.NVarChar(20),       value: data.whatsappNumber ?? null },
      universityAttended:   { type: sql.NVarChar(200),      value: data.universityAttended ?? null },
      yearOfAttendance:     { type: sql.Int,                value: data.yearOfAttendance ?? null },
      degreeAttained:       { type: sql.NVarChar(200),      value: data.degreeAttained ?? null },
      occupation:           { type: sql.NVarChar(200),      value: data.occupation ?? null },
      hospitalOrPractice:   { type: sql.NVarChar(300),      value: data.hospitalOrPractice ?? null },
      existingCover:        { type: sql.Bit,                value: data.existingCover ?? null },
      policies:             { type: sql.NVarChar(500),      value: data.policies ?? null },
      medicalAid:           { type: sql.Bit,                value: data.medicalAid ?? null },
      medicalAidProvider:   { type: sql.NVarChar(200),      value: data.medicalAidProvider ?? null },
      leadSource:           { type: sql.NVarChar(50),       value: data.leadSource },
      linkedEventId:        { type: sql.UniqueIdentifier,   value: data.linkedEventId ?? null },
      createdById:          { type: sql.UniqueIdentifier,   value: createdById },
    }
  );

  return newId;
}

/**
 * Assign a lead to an agent.
 * @param {string} leadId
 * @param {string} agentId
 */
export async function assignLead(leadId, agentId) {
  await executeQuery(
    `UPDATE Lead
     SET assignedAgentId = @agentId, pipelineStatus = 'Assigned', updatedAt = GETUTCDATE()
     WHERE id = @leadId AND deletedAt IS NULL`,
    {
      leadId:  { type: sql.UniqueIdentifier, value: leadId },
      agentId: { type: sql.UniqueIdentifier, value: agentId },
    }
  );
}

/**
 * Log a call attempt. Auto-flags lead as Uncontactable after max attempts.
 * @param {string} leadId
 * @param {string} agentId
 * @param {Object} attemptData - validated CallAttemptSchema data
 * @returns {Promise<{ flaggedUncontactable: boolean }>}
 */
export async function logCallAttempt(leadId, agentId, attemptData) {
  const attemptId = crypto.randomUUID();

  await executeQuery(
    `INSERT INTO CallAttempt (id, leadId, agentId, outcome, notes, callbackDateTime, attemptedAt)
     VALUES (@id, @leadId, @agentId, @outcome, @notes, @callbackDateTime, GETUTCDATE())`,
    {
      id:               { type: sql.UniqueIdentifier,    value: attemptId },
      leadId:           { type: sql.UniqueIdentifier,    value: leadId },
      agentId:          { type: sql.UniqueIdentifier,    value: agentId },
      outcome:          { type: sql.NVarChar(50),        value: attemptData.outcome },
      notes:            { type: sql.NVarChar(2000),      value: attemptData.notes ?? null },
      callbackDateTime: { type: sql.DateTimeOffset,      value: attemptData.callbackDateTime ?? null },
    }
  );

  // Count failed attempts (non-positive outcomes) and auto-flag if threshold reached
  const failedOutcomes = ['NoAnswer', 'Voicemail', 'WrongNumber'];
  const isFailedAttempt = failedOutcomes.includes(attemptData.outcome);

  let flaggedUncontactable = false;

  if (isFailedAttempt) {
    const countResult = await executeQuery(
      `SELECT COUNT(*) AS failedCount
       FROM CallAttempt
       WHERE leadId = @leadId AND outcome IN ('NoAnswer', 'Voicemail', 'WrongNumber')`,
      { leadId: { type: sql.UniqueIdentifier, value: leadId } }
    );

    const failedCount = countResult[0]?.failedCount ?? 0;

    if (failedCount >= config.app.maxCallAttempts) {
      await executeQuery(
        `UPDATE Lead
         SET pipelineStatus = 'Uncontactable', assignedAgentId = NULL, updatedAt = GETUTCDATE()
         WHERE id = @leadId`,
        { leadId: { type: sql.UniqueIdentifier, value: leadId } }
      );
      flaggedUncontactable = true;
    }
  }

  return { flaggedUncontactable };
}

/**
 * Soft-delete a lead (POPIA right to erasure).
 * Sets deletedAt timestamp — record is excluded from all queries but retained
 * for audit log purposes per FAIS record retention requirements.
 * @param {string} leadId
 */
export async function deleteLead(leadId) {
  await executeQuery(
    `UPDATE Lead SET deletedAt = GETUTCDATE(), updatedAt = GETUTCDATE()
     WHERE id = @leadId`,
    { leadId: { type: sql.UniqueIdentifier, value: leadId } }
  );
}

/**
 * Deduplicate check — returns existing lead ID if a lead with the same
 * SA ID number or email address already exists.
 * Used by mobile event registration to avoid creating duplicate leads.
 * @param {string} email
 * @param {string} [idNumber]
 * @returns {Promise<string|null>} existing lead ID or null
 */
export async function findDuplicate(email, idNumber) {
  if (idNumber) {
    // Note: We can't query encrypted ID numbers directly (no searchable encryption here).
    // For dedup, we rely on email as the primary dedup key.
    // Full dedup by ID number would require a deterministic encryption scheme — flagged
    // as a future enhancement. See FR-037 acceptance criteria.
  }

  const existing = await executeQueryOne(
    `SELECT id FROM Lead WHERE email = @email AND deletedAt IS NULL`,
    { email: { type: sql.NVarChar(255), value: email } }
  );

  return existing?.id ?? null;
}
