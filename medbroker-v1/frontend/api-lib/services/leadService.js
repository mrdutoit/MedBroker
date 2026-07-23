/**
 * services/leadService.js
 * Ported from api/src/services/leadService.js (Azure SQL / mssql) to
 * Postgres/Neon. Business logic and data access for the Lead entity.
 *
 * Changes from the Azure original — see VERCEL_NOTES.md for full detail:
 *
 *  1. SQL dialect only (no behaviour change):
 *       GETUTCDATE() -> NOW()
 *       [User]       -> "User"
 *       OFFSET..FETCH NEXT..ROWS ONLY -> LIMIT..OFFSET
 *       LIKE -> ILIKE (Postgres LIKE is case-sensitive by default; ILIKE
 *         matches the case-insensitive behaviour SQL Server's default
 *         collation gives the original query for free)
 *
 *  2. Real fix, not a dialect change: removed `l.leadSource` and
 *     `l.assignedBrokerId` from SELECT/INSERT — neither column exists on
 *     Lead (assignedBrokerId is Appointment-only by design; leadSource was
 *     never a column at all). Replaced with a computed `sourceLabel`
 *     (COALESCE across the four real source columns, joined to Event /
 *     MedicalSubscription) and wired `manualSourceName` + the `source`
 *     list filter, both of which the frontend already sends/expects but
 *     the original service never implemented. See models/lead.js header.
 *
 *  3. New: optional `supervisorAgentIds` filter on listLeads(), and the
 *     target-agent isActive check in assignLead() — the A1/A2 patterns
 *     Status.md describes as already fixed on this file, which the
 *     hydrated GitHub source does not actually contain. Implemented here
 *     per the documented spec. Supervisor scoping is applied by the route
 *     handler (api/leads/index.js), mirroring how Agent scoping already
 *     works in the Azure original — leadService stays authorization-agnostic,
 *     just takes the scope as a parameter.
 *
 * POPIA notes (unchanged from the Azure original):
 * - id_number is encrypted before insert and decrypted only when explicitly
 *   requested (POPIA Subject Access Requests — admin only, not built yet)
 * - Standard GET and LIST responses never include the plaintext id_number
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { encrypt, blindIndex } from './encryption.js';
import { computeLeadStatus } from './leadStatusService.js';
import { getActiveUserById } from './userService.js';
import { resolvePortfolioId } from './appointmentService.js';
import { config } from '../config.js';
import { resolveOrganisationId } from '../context/tenant.js';

// Shared SELECT fragment — sourceLabel computed from whichever of the four
// source columns is populated. Event and subscription names win over the
// free-text manualSourceName when both would somehow be present.
const SOURCE_LABEL_SELECT = `COALESCE(ev.name, ms.name, l.manualSourceName)`;
const SOURCE_JOINS = `
     LEFT JOIN Event ev              ON l.linkedEventId = ev.id
     LEFT JOIN MedicalSubscription ms ON l.linkedSubscriptionId = ms.id`;

/**
 * List leads with optional filters and pagination.
 * @param {Object} filters - from LeadListQuerySchema, plus:
 * @param {string} [filters.excludeStatuses] - comma-separated pipelineStatus
 *   values to exclude (LeadList hides AppointmentScheduled leads, which
 *   belong in Appointments instead — not yet built, but the filter is
 *   ready for when it is).
 * @param {string} [filters.occupation]
 * @param {string[]} [filters.supervisorAgentIds] - when set, restricts results
 *   to leads assigned to one of these agent ids, OR unassigned. Set by the
 *   route handler for a Supervisor-without-Admin caller (A1).
 * @returns {Promise<{ leads: Array, total: number, page: number, pageSize: number }>}
 */
export async function listLeads({ status, excludeStatuses, agentId, brokerId, eventId, source, occupation, search, page, pageSize, supervisorAgentIds }) {
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE l.deletedAt IS NULL AND l.organisationId = @organisationId';
  const params = { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } };

  if (status) {
    whereClause += ' AND l.pipelineStatus = @status';
    params.status = { type: sql.NVarChar(50), value: status };
  }
  // excludeStatuses — comma-separated list from the client (e.g. LeadList
  // hides AppointmentScheduled leads, which belong in Appointments instead).
  if (excludeStatuses) {
    const statuses = String(excludeStatuses).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      const placeholders = statuses.map((_, i) => `@exclStatus${i}`).join(', ');
      whereClause += ` AND l.pipelineStatus NOT IN (${placeholders})`;
      statuses.forEach((st, i) => {
        params[`exclStatus${i}`] = { type: sql.NVarChar(50), value: st };
      });
    }
  }
  if (agentId) {
    whereClause += ' AND l.assignedAgentId = @agentId';
    params.agentId = { type: sql.UniqueIdentifier, value: agentId };
  }
  if (eventId) {
    whereClause += ' AND l.linkedEventId = @eventId';
    params.eventId = { type: sql.UniqueIdentifier, value: eventId };
  }
  if (occupation) {
    whereClause += ' AND l.occupation = @occupation';
    params.occupation = { type: sql.NVarChar(200), value: occupation };
  }
  if (search) {
    whereClause += ' AND (l.firstName ILIKE @search OR l.lastName ILIKE @search OR l.email ILIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }
  if (source) {
    whereClause += ` AND ${SOURCE_LABEL_SELECT} = @source`;
    params.source = { type: sql.NVarChar(300), value: source };
  }
  // Supervisor (without Admin) scoping — A1. Team's leads plus unassigned,
  // never unrestricted org-wide access. brokerId is currently unused (no
  // broker on Lead — see header note) and intentionally not filtered on.
  if (supervisorAgentIds && supervisorAgentIds.length > 0) {
    const placeholders = supervisorAgentIds.map((_, i) => `@supAgent${i}`).join(', ');
    whereClause += ` AND (l.assignedAgentId IN (${placeholders}) OR l.assignedAgentId IS NULL)`;
    supervisorAgentIds.forEach((id, i) => {
      params[`supAgent${i}`] = { type: sql.UniqueIdentifier, value: id };
    });
  } else if (supervisorAgentIds && supervisorAgentIds.length === 0) {
    // Supervisor with no direct reports yet — unassigned leads only.
    whereClause += ' AND l.assignedAgentId IS NULL';
  }
  void brokerId; // reserved — Lead has no broker column; kept in the signature for API stability

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total FROM Lead l ${SOURCE_JOINS} ${whereClause}`,
    params
  );
  const total = Number(countResult[0]?.total ?? 0);

  const leads = await executeQuery(
    `SELECT
       l.id, l.title, l.firstName AS "firstName", l.lastName AS "lastName",
       l.dateOfBirth AS "dateOfBirth", l.email,
       l.mobileNumber AS "mobileNumber", l.whatsappNumber AS "whatsappNumber",
       l.universityAttended AS "universityAttended", l.yearOfAttendance AS "yearOfAttendance",
       l.degreeAttained AS "degreeAttained", l.occupation, l.hospitalOrPractice AS "hospitalOrPractice",
       l.existingCover AS "existingCover", l.policies, l.medicalAid AS "medicalAid",
       l.medicalAidProvider AS "medicalAidProvider",
       ${SOURCE_LABEL_SELECT} AS "sourceLabel",
       l.linkedEventId AS "linkedEventId", l.pipelineStatus AS "pipelineStatus",
       l.assignedAgentId AS "assignedAgentId",
       l.createdAt AS "createdAt", l.updatedAt AS "updatedAt",
       a.displayName AS "agentName"
     FROM Lead l
     ${SOURCE_JOINS}
     LEFT JOIN "User" a ON l.assignedAgentId = a.id
     ${whereClause}
     ORDER BY l.createdAt DESC
     LIMIT @pageSize OFFSET @offset`,
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
 * Does not return id_number — use getLeadWithIdNumber() for POPIA SAR only (not yet built).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getLeadById(id) {
  return executeQueryOne(
    `SELECT
       l.id, l.title, l.firstName AS "firstName", l.lastName AS "lastName",
       l.dateOfBirth AS "dateOfBirth", l.email,
       l.mobileNumber AS "mobileNumber", l.whatsappNumber AS "whatsappNumber",
       l.universityAttended AS "universityAttended", l.yearOfAttendance AS "yearOfAttendance",
       l.degreeAttained AS "degreeAttained", l.occupation, l.hospitalOrPractice AS "hospitalOrPractice",
       l.existingCover AS "existingCover", l.policies, l.medicalAid AS "medicalAid",
       l.medicalAidProvider AS "medicalAidProvider",
       ${SOURCE_LABEL_SELECT} AS "sourceLabel",
       l.linkedEventId AS "linkedEventId", l.pipelineStatus AS "pipelineStatus",
       l.assignedAgentId AS "assignedAgentId", l.createdAt AS "createdAt", l.updatedAt AS "updatedAt",
       ap.id AS "appointmentId", ap.status AS "appointmentStatus", pf.name AS "portfolio"
     FROM Lead l
     ${SOURCE_JOINS}
     -- A Lead can now have several Appointments over its lifetime (see
     -- migration 005 — the old UNIQUE leadId constraint is gone). "The"
     -- appointment shown on Lead Detail / linked via View in Appointments
     -- is the most recent one by createdAt, not "the" one — LATERAL picks
     -- exactly one row per Lead so this stays a single-row result.
     LEFT JOIN LATERAL (
       SELECT id, status FROM Appointment
       WHERE leadId = l.id
       ORDER BY createdAt DESC
       LIMIT 1
     ) ap ON true
     LEFT JOIN Portfolio pf ON pf.id = l.portfolioId
     WHERE l.id = @id AND l.deletedAt IS NULL AND l.organisationId = @organisationId`,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Reopen a Lead after its most recent Appointment closed lost — manual
 * action, Admin/Supervisor only (Mark's explicit choice over an automatic
 * unlock: a person should decide to re-engage, not have it happen silently
 * the moment an outcome is saved). Reverts pipelineStatus from
 * AppointmentScheduled back to InProgress — same agent stays assigned,
 * Lead becomes editable again, and Book Appointment becomes available
 * again immediately (already gated on Assigned/InProgress, no separate
 * change needed there). Validated server-side, not just hidden client-side:
 * only actually reopenable if the Lead is genuinely Converted AND its most
 * recent Appointment is genuinely ClosedLost.
 * @param {string} leadId
 */
export async function reopenLead(leadId) {
  const organisationId = resolveOrganisationId();
  const lead = await executeQueryOne(
    `SELECT l.pipelineStatus AS "pipelineStatus", ap.status AS "appointmentStatus"
     FROM Lead l
     LEFT JOIN LATERAL (
       SELECT status FROM Appointment WHERE leadId = l.id ORDER BY createdAt DESC LIMIT 1
     ) ap ON true
     WHERE l.id = @leadId AND l.deletedAt IS NULL AND l.organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!lead) throw { status: 404, message: 'Lead not found' };
  if (lead.pipelineStatus !== 'AppointmentScheduled') {
    throw { status: 400, message: 'This lead is not in a converted state.' };
  }
  if (lead.appointmentStatus !== 'ClosedLost') {
    throw { status: 400, message: 'This lead\'s most recent appointment is not Closed Lost.' };
  }

  await executeQuery(
    `UPDATE Lead SET pipelineStatus = 'InProgress', updatedAt = NOW()
     WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
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
  const idNumberHash = data.idNumber ? blindIndex(data.idNumber) : null;
  const newId = crypto.randomUUID();
  // Optional — a Lead can exist long before anyone knows its portfolio.
  // Same resolvePortfolioId() Appointment booking uses; throws the same
  // "Unknown portfolio" error if a bad name somehow gets through (the
  // dropdown only offers valid names, so this is defence-in-depth, not
  // an expected path).
  const portfolioId = data.portfolio ? await resolvePortfolioId(data.portfolio) : null;
  if (data.portfolio && !portfolioId) throw { status: 400, message: `Unknown portfolio: ${data.portfolio}` };

  await executeQuery(
    `INSERT INTO Lead (
       id, organisationId, title, firstName, lastName, dateOfBirth, idNumberEncrypted, idNumberHash, email,
       mobileNumber, whatsappNumber, universityAttended, yearOfAttendance,
       degreeAttained, occupation, hospitalOrPractice, existingCover, policies,
       medicalAid, medicalAidProvider, linkedEventId, linkedSubscriptionId,
       csvImportBatchId, manualSourceName, portfolioId, pipelineStatus,
       createdById, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @title, @firstName, @lastName, @dateOfBirth, @idNumberEncrypted, @idNumberHash, @email,
       @mobileNumber, @whatsappNumber, @universityAttended, @yearOfAttendance,
       @degreeAttained, @occupation, @hospitalOrPractice, @existingCover, @policies,
       @medicalAid, @medicalAidProvider, @linkedEventId, @linkedSubscriptionId,
       @csvImportBatchId, @manualSourceName, @portfolioId, 'Unassigned',
       @createdById, NOW(), NOW()
     )`,
    {
      id:                   { type: sql.UniqueIdentifier,   value: newId },
      organisationId:       { type: sql.UniqueIdentifier,   value: resolveOrganisationId() },
      title:                { type: sql.NVarChar(10),       value: data.title },
      firstName:            { type: sql.NVarChar(100),      value: data.firstName },
      lastName:             { type: sql.NVarChar(100),      value: data.lastName },
      dateOfBirth:          { type: sql.Date,                value: data.dateOfBirth },
      idNumberEncrypted:    { type: sql.NVarChar(sql.MAX),  value: encryptedIdNumber },
      idNumberHash:         { type: sql.NVarChar(64),       value: idNumberHash },
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
      linkedEventId:        { type: sql.UniqueIdentifier,   value: data.linkedEventId ?? null },
      linkedSubscriptionId: { type: sql.UniqueIdentifier,   value: data.linkedSubscriptionId ?? null },
      csvImportBatchId:     { type: sql.UniqueIdentifier,   value: data.csvImportBatchId ?? null },
      manualSourceName:     { type: sql.NVarChar(300),      value: data.manualSourceName ?? null },
      portfolioId:          { type: sql.UniqueIdentifier,   value: portfolioId },
      createdById:          { type: sql.UniqueIdentifier,   value: createdById },
    }
  );

  return newId;
}

// Columns updateLead() is allowed to touch — deliberately the exact set
// LeadDetail.jsx renders as editable Field rows (Contact Details, Education,
// Insurance Information), not the full UpdateLeadSchema surface. title/
// firstName/lastName sit in the page header rather than a Field row and stay
// read-only for now; idNumber isn't displayed on this page at all. Both are
// already declared on UpdateLeadSchema so widening this later is additive,
// not a redesign — just add the column here and a field on the page.
const UPDATE_LEAD_COLUMNS = {
  dateOfBirth:        { col: 'dateOfBirth',        type: sql.Date },
  email:               { col: 'email',               type: sql.NVarChar(255) },
  mobileNumber:        { col: 'mobileNumber',        type: sql.NVarChar(20) },
  whatsappNumber:      { col: 'whatsappNumber',      type: sql.NVarChar(20) },
  universityAttended:  { col: 'universityAttended',  type: sql.NVarChar(200) },
  yearOfAttendance:    { col: 'yearOfAttendance',    type: sql.Int },
  degreeAttained:      { col: 'degreeAttained',      type: sql.NVarChar(200) },
  occupation:          { col: 'occupation',          type: sql.NVarChar(200) },
  hospitalOrPractice:  { col: 'hospitalOrPractice',  type: sql.NVarChar(300) },
  existingCover:       { col: 'existingCover',       type: sql.Bit },
  policies:            { col: 'policies',            type: sql.NVarChar(500) },
  medicalAid:          { col: 'medicalAid',          type: sql.Bit },
  medicalAidProvider:  { col: 'medicalAidProvider',  type: sql.NVarChar(200) },
};

/**
 * Update the editable fields on an existing lead. Only columns present as
 * keys on `data` are touched — a partial patch, not a full overwrite —
 * matching UpdateLeadSchema.partial() semantics on the caller side.
 * @param {string} leadId
 * @param {Object} data - validated (partial) UpdateLeadSchema data, restricted
 *   by the caller to UPDATE_LEAD_COLUMNS' keys
 * @returns {Promise<boolean>} false if nothing was provided to update
 */
export async function updateLead(leadId, data) {
  const setClauses = [];
  const params = {
    leadId:         { type: sql.UniqueIdentifier, value: leadId },
    organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
  };

  for (const [field, { col, type }] of Object.entries(UPDATE_LEAD_COLUMNS)) {
    if (data[field] === undefined) continue;
    setClauses.push(`${col} = @${field}`);
    params[field] = { type, value: data[field] };
  }

  // portfolio isn't in UPDATE_LEAD_COLUMNS — it's a name that needs
  // resolving to portfolioId, not a direct column value like the rest.
  // Added 23 Jul 2026 alongside portfolio capture on the Lead (see §35).
  if (data.portfolio !== undefined) {
    const portfolioId = await resolvePortfolioId(data.portfolio);
    if (!portfolioId) throw { status: 400, message: `Unknown portfolio: ${data.portfolio}` };
    setClauses.push('portfolioId = @portfolioId');
    params.portfolioId = { type: sql.UniqueIdentifier, value: portfolioId };
  }

  if (setClauses.length === 0) return false;

  await executeQuery(
    `UPDATE Lead SET ${setClauses.join(', ')}, updatedAt = NOW()
     WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    params
  );
  return true;
}

/**
 * Assign a lead to an agent.
 * A2: validates the target agent exists, is active, and belongs to this org
 * before assigning — was previously unchecked. Throws a structured error
 * (status/message) the route's existing catch-block pattern already handles.
 * @param {string} leadId
 * @param {string} agentId
 */
export async function assignLead(leadId, agentId) {
  const target = await getActiveUserById(agentId);
  if (!target) {
    throw { status: 400, message: 'assignLead: target agentId is not an active user in this organisation' };
  }

  await executeQuery(
    `UPDATE Lead
     SET assignedAgentId = @agentId, pipelineStatus = 'Assigned', updatedAt = NOW()
     WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      leadId:  { type: sql.UniqueIdentifier, value: leadId },
      agentId: { type: sql.UniqueIdentifier, value: agentId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Log a call attempt. Auto-flags lead as Closed after max attempts.
 * @param {string} leadId
 * @param {string} agentId
 * @param {Object} attemptData - validated CallAttemptSchema data
 * @returns {Promise<{ flaggedUncontactable: boolean, newPipelineStatus: string }>}
 */
export async function logCallAttempt(leadId, agentId, attemptData) {
  const attemptId = crypto.randomUUID();
  const organisationId = resolveOrganisationId();

  await executeQuery(
    `INSERT INTO CallAttempt (id, organisationId, leadId, agentId, outcome, notes, followUpDateTime, callTime)
     VALUES (@id, @organisationId, @leadId, @agentId, @outcome, @notes, @followUpDateTime, NOW())`,
    {
      id:               { type: sql.UniqueIdentifier, value: attemptId },
      organisationId:   { type: sql.UniqueIdentifier, value: organisationId },
      leadId:           { type: sql.UniqueIdentifier, value: leadId },
      agentId:          { type: sql.UniqueIdentifier, value: agentId },
      outcome:          { type: sql.NVarChar(50),     value: attemptData.outcome },
      notes:            { type: sql.NVarChar(2000),   value: attemptData.notes ?? null },
      followUpDateTime: { type: sql.DateTimeOffset,   value: attemptData.callbackDateTime ?? null },
    }
  );

  const current = await executeQueryOne(
    `SELECT pipelineStatus AS "pipelineStatus" FROM Lead WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      leadId: { type: sql.UniqueIdentifier, value: leadId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
    }
  );
  const currentStatus = current?.pipelineStatus ?? 'Unassigned';

  let newStatus = computeLeadStatus(currentStatus, attemptData.outcome);
  let flaggedUncontactable = false;

  const UNREACHABLE = ['NoAnswer', 'Voicemail', 'WrongNumber'];
  if (UNREACHABLE.includes(attemptData.outcome) && newStatus !== 'Closed') {
    const countResult = await executeQuery(
      `SELECT COUNT(*) AS "failedCount" FROM CallAttempt
       WHERE leadId = @leadId AND organisationId = @organisationId
         AND outcome IN ('NoAnswer', 'Voicemail', 'WrongNumber')`,
      {
        leadId: { type: sql.UniqueIdentifier, value: leadId },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      }
    );
    if (Number(countResult[0]?.failedCount ?? 0) >= config.app.maxCallAttempts) {
      newStatus = 'Closed';
      flaggedUncontactable = true;
    }
  }

  if (newStatus !== currentStatus) {
    const unassignClause = flaggedUncontactable ? 'assignedAgentId = NULL,' : '';
    await executeQuery(
      `UPDATE Lead
         SET pipelineStatus = @newStatus, ${unassignClause} updatedAt = NOW()
       WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
      {
        leadId:    { type: sql.UniqueIdentifier, value: leadId },
        newStatus: { type: sql.NVarChar(50),     value: newStatus },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      }
    );
  }

  return { newPipelineStatus: newStatus, flaggedUncontactable };
}

/**
 * Soft-delete a lead (POPIA right to erasure).
 * @param {string} leadId
 */
export async function deleteLead(leadId) {
  await executeQuery(
    `UPDATE Lead SET deletedAt = NOW(), updatedAt = NOW()
     WHERE id = @leadId AND organisationId = @organisationId`,
    {
      leadId: { type: sql.UniqueIdentifier, value: leadId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Deduplicate check — returns existing lead ID if a lead with the same
 * SA ID number or email address already exists.
 * @param {string} email
 * @param {string} [idNumber]
 * @returns {Promise<string|null>}
 */
export async function findDuplicate(email, idNumber) {
  const organisationId = resolveOrganisationId();

  if (idNumber) {
    const hash = blindIndex(idNumber);
    if (hash) {
      const byIdNumber = await executeQueryOne(
        `SELECT id FROM Lead WHERE idNumberHash = @hash AND deletedAt IS NULL AND organisationId = @organisationId`,
        {
          hash: { type: sql.NVarChar(64), value: hash },
          organisationId: { type: sql.UniqueIdentifier, value: organisationId },
        }
      );
      if (byIdNumber) return byIdNumber.id;
    }
  }

  const existing = await executeQueryOne(
    `SELECT id FROM Lead WHERE email = @email AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      email: { type: sql.NVarChar(255), value: email },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
    }
  );

  return existing?.id ?? null;
}

/**
 * Distinct source labels currently in use across all leads — backs the
 * Source filter dropdown on LeadList.jsx. leadsApi.sources() on the
 * frontend already expected this endpoint; it just didn't exist yet.
 * @returns {Promise<string[]>}
 */
export async function listSources() {
  const rows = await executeQuery(
    `SELECT DISTINCT ${SOURCE_LABEL_SELECT} AS "sourceLabel"
     FROM Lead l
     ${SOURCE_JOINS}
     WHERE l.deletedAt IS NULL AND l.organisationId = @organisationId
       AND ${SOURCE_LABEL_SELECT} IS NOT NULL
     ORDER BY ${SOURCE_LABEL_SELECT}`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  return rows.map((r) => r.sourceLabel);
}

/**
 * Call history for a lead, most recent first — backs LeadDetail.jsx's
 * "Recent Calls" section, which previously only reflected calls logged in
 * the current browser session (lost on refresh) since logCallAttempt()
 * writes to CallAttempt but nothing ever read it back.
 * @param {string} leadId
 * @returns {Promise<Array>}
 */
export async function listCallAttempts(leadId) {
  return executeQuery(
    `SELECT
       ca.id, ca.outcome, ca.notes,
       ca.followUpDateTime AS "callbackDateTime",
       ca.callTime AS "attemptedAt",
       a.displayName AS "agentName"
     FROM CallAttempt ca
     LEFT JOIN "User" a ON ca.agentId = a.id
     WHERE ca.leadId = @leadId AND ca.organisationId = @organisationId
     ORDER BY ca.callTime DESC`,
    {
      leadId: { type: sql.UniqueIdentifier, value: leadId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}
