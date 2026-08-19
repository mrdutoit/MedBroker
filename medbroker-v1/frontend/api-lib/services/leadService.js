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
import { encrypt, decrypt, blindIndex } from './encryption.js';
import { computeLeadStatus } from './leadStatusService.js';
import { getActiveUserById, resolvePortfolioIds, resolveProductIds } from './userService.js';
import { createTask, deleteTasksForEntity, reassignTasksForEntity, completeOpenCallbackTasksForLead } from './taskService.js';
import { writeAuditLog } from './auditService.js';
import { config } from '../config.js';
import { resolveOrganisationId } from '../context/tenant.js';

// FORMULA_INJECTION_PREFIXES / neutralizeFormulaInjection (§63) — closes a
// gap Project_Context.md's own security checklist had flagged (CSV import
// hardening) before this session and nothing had addressed. A CSV/Excel
// cell value starting with =, +, -, or @ is interpreted as a formula by
// Excel/Sheets/LibreOffice when the file is opened — meaning a lead's
// name/occupation/etc, sourced from an externally supplied spreadsheet
// (LeadImport.jsx's bulk channel), could carry a formula payload that
// executes the moment this data is ever exported back out and opened
// again (this app has no Lead export feature today, but fixing it at the
// point of storage means any future export inherits the protection
// automatically, rather than every future export feature needing to
// remember to escape this itself). Prefixing with a straight quote is
// the standard mitigation (Excel/Sheets both then treat the whole value
// as inert text) — applied to every free-text field a bulk import can
// populate, not just the ones LeadImport.jsx currently collects, since
// manual entry and future intake channels write through this same
// function.
const FORMULA_INJECTION_PREFIXES = ['=', '+', '-', '@'];

function neutralizeFormulaInjection(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  return FORMULA_INJECTION_PREFIXES.includes(value[0]) ? `'${value}` : value;
}

const FREE_TEXT_LEAD_FIELDS = [
  'title', 'firstName', 'lastName', 'occupation', 'hospitalOrPractice',
  'universityAttended', 'degreeAttained', 'policies', 'medicalAidProvider',
  'manualSourceName',
];

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
export async function listLeads({ status, excludeStatuses, agentId, brokerId, eventId, source, occupation, search, page, pageSize, sortKey, sortDir, supervisorAgentIds }) {
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

  // 16 Aug 2026 — real column expressions, keyed by the same enum
  // LeadListQuerySchema (models/lead.js) already validates sortKey
  // against — that Zod enum is the actual injection defence; this
  // object never receives anything the schema hasn't already approved,
  // but stays a fixed whitelist regardless rather than trusting that
  // single upstream check alone. name/agentName sort NULLS LAST in both
  // directions — an unassigned lead's agentName is NULL, and NULLS
  // FIRST (Postgres's default for ASC) would otherwise cluster every
  // unassigned lead at the top of an alphabetical sort someone asked
  // for, not because they're meaningfully "first".
  const SORT_COLUMN = {
    name:       'l.firstName, l.lastName',
    occupation: 'l.occupation NULLS LAST',
    source:     `${SOURCE_LABEL_SELECT} NULLS LAST`,
    status:     'l.pipelineStatus',
    agentName:  'a.displayName NULLS LAST',
    createdAt:  'l.createdAt',
  };
  const orderClause = sortKey
    ? `ORDER BY ${SORT_COLUMN[sortKey]} ${sortDir === 'desc' ? 'DESC' : 'ASC'}`
    : 'ORDER BY l.createdAt DESC'; // unchanged default — no sort requested

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
       l.region, l.createdAt AS "createdAt", l.updatedAt AS "updatedAt",
       a.displayName AS "agentName"
     FROM Lead l
     ${SOURCE_JOINS}
     LEFT JOIN "User" a ON l.assignedAgentId = a.id
     ${whereClause}
     ${orderClause}
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
  const lead = await executeQueryOne(
    `SELECT
       l.id, l.title, l.firstName AS "firstName", l.lastName AS "lastName",
       l.dateOfBirth AS "dateOfBirth", l.idNumberEncrypted AS "idNumberEncrypted", l.email,
       l.mobileNumber AS "mobileNumber", l.whatsappNumber AS "whatsappNumber",
       l.universityAttended AS "universityAttended", l.yearOfAttendance AS "yearOfAttendance",
       l.degreeAttained AS "degreeAttained", l.occupation, l.hospitalOrPractice AS "hospitalOrPractice",
       l.existingCover AS "existingCover", l.policies, l.medicalAid AS "medicalAid",
       l.medicalAidProvider AS "medicalAidProvider",
       ${SOURCE_LABEL_SELECT} AS "sourceLabel",
       l.linkedEventId AS "linkedEventId", l.pipelineStatus AS "pipelineStatus",
       l.assignedAgentId AS "assignedAgentId", a.displayName AS "agentName",
       l.region, l.createdAt AS "createdAt", l.updatedAt AS "updatedAt",
       ap.id AS "appointmentId", ap.status AS "appointmentStatus",
       -- Changed 23 Jul 2026 from a single LEFT JOIN Portfolio to this
       -- (Mark's request, see §41 — a lead can now be tagged with more
       -- than one portfolio, mirroring UserPortfolio). Scalar subquery
       -- rather than restructuring this whole query around GROUP BY the
       -- way userService.js's USER_LIST_SELECT does — simpler for a
       -- single-row-by-id fetch, and doesn't interact with the other
       -- LEFT JOINs/LATERAL below.
       (SELECT COALESCE(array_agg(p2.name ORDER BY p2.name), ARRAY[]::text[])
        FROM LeadPortfolio lp2 JOIN Portfolio p2 ON p2.id = lp2.portfolioId
        WHERE lp2.leadId = l.id) AS "portfolios",
       -- 14 Aug 2026 (§157/§158) — mirrors the portfolios subquery
       -- immediately above, exactly.
       (SELECT COALESCE(array_agg(pr2.name ORDER BY pr2.name), ARRAY[]::text[])
        FROM LeadProduct lpr2 JOIN Product pr2 ON pr2.id = lpr2.productId
        WHERE lpr2.leadId = l.id) AS "products"
     FROM Lead l
     ${SOURCE_JOINS}
     -- Added 23 Jul 2026 — missing entirely before. listLeads() already
     -- joined "User" for agentName on the list view; this detail query
     -- never did, so the Agent field on LeadDetail.jsx showed '—' for
     -- every lead, assigned or not, since this page was first built.
     LEFT JOIN "User" a ON l.assignedAgentId = a.id
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
     WHERE l.id = @id AND l.deletedAt IS NULL AND l.organisationId = @organisationId`,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  if (!lead) return null;

  // Decrypt for display — 18 Aug 2026, Mark's explicit request to make
  // this visible on LeadDetail. Reverses sarService.getSarExportData()'s
  // earlier framing of itself as "the one place in the app where showing
  // the plaintext to a staff member is exactly the point" — that was
  // true only because nothing else ever displayed it; now something
  // else does, deliberately, per Mark's own instruction, not a
  // regression of that earlier reasoning.
  lead.idNumber = lead.idNumberEncrypted ? await decrypt(lead.idNumberEncrypted) : null;
  delete lead.idNumberEncrypted;
  return lead;
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

// Replace-all pattern — simplest correct match for a checkbox UI where the
// full desired set is sent on every save, not an incremental diff. Mirrors
// userService.js's syncUserPortfolios() exactly.
async function syncLeadPortfolios(leadId, portfolioIds) {
  await executeQuery(`DELETE FROM LeadPortfolio WHERE leadId = @leadId`, {
    leadId: { type: sql.UniqueIdentifier, value: leadId },
  });
  for (const portfolioId of portfolioIds) {
    await executeQuery(
      `INSERT INTO LeadPortfolio (id, leadId, portfolioId) VALUES (@id, @leadId, @portfolioId)`,
      {
        id:          { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        leadId:      { type: sql.UniqueIdentifier, value: leadId },
        portfolioId: { type: sql.UniqueIdentifier, value: portfolioId },
      }
    );
  }
}

// 14 Aug 2026 (§157/§158) — mirrors syncLeadPortfolios() exactly, same
// replace-all pattern, same reasoning.
async function syncLeadProducts(leadId, productIds) {
  await executeQuery(`DELETE FROM LeadProduct WHERE leadId = @leadId`, {
    leadId: { type: sql.UniqueIdentifier, value: leadId },
  });
  for (const productId of productIds) {
    await executeQuery(
      `INSERT INTO LeadProduct (id, leadId, productId) VALUES (@id, @leadId, @productId)`,
      {
        id:        { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        leadId:    { type: sql.UniqueIdentifier, value: leadId },
        productId: { type: sql.UniqueIdentifier, value: productId },
      }
    );
  }
}

/**
 * Create a new lead. Encrypts id_number before storage.
 * @param {Object} data - validated CreateLeadSchema data
 * @param {string} createdById - user ID of the person creating the record
 * @returns {Promise<string>} the new lead ID
 */
export async function createLead(data, createdById) {
  // §63 — neutralize any formula-injection payload before it ever
  // reaches storage. Applied unconditionally, not just for bulk-import
  // callers — this function has no way to know which caller a given
  // invocation came from, and manual entry deserves the same protection.
  for (const field of FREE_TEXT_LEAD_FIELDS) {
    if (data[field] !== undefined) data[field] = neutralizeFormulaInjection(data[field]);
  }

  const encryptedIdNumber = data.idNumber ? await encrypt(data.idNumber) : null;
  const idNumberHash = data.idNumber ? blindIndex(data.idNumber) : null;
  const newId = crypto.randomUUID();

  await executeQuery(
    `INSERT INTO Lead (
       id, organisationId, title, firstName, lastName, dateOfBirth, idNumberEncrypted, idNumberHash, email,
       mobileNumber, whatsappNumber, universityAttended, yearOfAttendance,
       degreeAttained, occupation, hospitalOrPractice, existingCover, policies,
       medicalAid, medicalAidProvider, linkedEventId, linkedSubscriptionId,
       csvImportBatchId, manualSourceName, pipelineStatus,
       region, createdById, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @title, @firstName, @lastName, @dateOfBirth, @idNumberEncrypted, @idNumberHash, @email,
       @mobileNumber, @whatsappNumber, @universityAttended, @yearOfAttendance,
       @degreeAttained, @occupation, @hospitalOrPractice, @existingCover, @policies,
       @medicalAid, @medicalAidProvider, @linkedEventId, @linkedSubscriptionId,
       @csvImportBatchId, @manualSourceName, 'Unassigned',
       @region, @createdById, NOW(), NOW()
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
      region:               { type: sql.NVarChar(50),       value: data.region ?? null },
      createdById:          { type: sql.UniqueIdentifier,   value: createdById },
    }
  );

  // Optional at the DB/service layer — the ManualEntry-only mandatory
  // rule lives in models/lead.js's superRefine(), same split as
  // portfolios. resolveProductIds() silently ignores any name that
  // doesn't match a real Product, same tolerant behaviour as
  // resolvePortfolioIds() above.
  if (data.portfolios?.length) {
    const portfolioIds = await resolvePortfolioIds(data.portfolios);
    await syncLeadPortfolios(newId, portfolioIds);
  }
  // 14 Aug 2026 (§157/§158) — mirrors the portfolios block immediately
  // above, exactly.
  if (data.products?.length) {
    const productIds = await resolveProductIds(data.products);
    await syncLeadProducts(newId, productIds);
  }

  return newId;
}

// Columns updateLead() is allowed to touch — deliberately the exact set
// LeadDetail.jsx renders as editable Field rows (Contact Details, Education,
// Insurance Information). title/firstName/lastName sit in the page header
// rather than a Field row and stay read-only for now.
// idNumber added 18 Aug 2026, at Mark's explicit request — handled outside
// this map (see updateLead() below), not as a normal column entry: unlike
// everything else here, one input field maps to two stored columns
// (idNumberEncrypted + idNumberHash), the same encrypt()/blindIndex() pair
// createLead() already uses, not something the generic col/type loop below
// can express.
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
  // 14 Aug 2026 (§166) — editable after creation, same as every other
  // field in this list; mandatory-on-ManualEntry only applies to the
  // Zod layer at CREATE time (models/lead.js), not to later edits.
  region:              { col: 'region',              type: sql.NVarChar(50) },
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

  // idNumber — outside the generic loop above for the reason given in
  // UPDATE_LEAD_COLUMNS's own comment: one input field, two stored
  // columns. An explicit empty string clears both, same "undefined
  // means don't touch it, anything else is a real value including
  // empty" rule the rest of this function already follows.
  if (data.idNumber !== undefined) {
    setClauses.push('idNumberEncrypted = @idNumberEncrypted', 'idNumberHash = @idNumberHash');
    params.idNumberEncrypted = { type: sql.NVarChar(sql.MAX), value: data.idNumber ? await encrypt(data.idNumber) : null };
    params.idNumberHash = { type: sql.NVarChar(64), value: data.idNumber ? blindIndex(data.idNumber) : null };
  }

  let changed = false;
  if (setClauses.length > 0) {
    await executeQuery(
      `UPDATE Lead SET ${setClauses.join(', ')}, updatedAt = NOW()
       WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
      params
    );
    changed = true;
  }

  // portfolios isn't in UPDATE_LEAD_COLUMNS — it's a many-to-many sync
  // (LeadPortfolio), not a direct column value like the rest. Changed 23
  // Jul 2026 from a single portfolioId column to this (Mark's request,
  // see §41) — a lead can now be tagged with more than one portfolio.
  // An explicit empty array is a real, intentional "clear all portfolios"
  // and is synced the same as any other value — only a genuinely absent
  // key (undefined) means "don't touch this".
  if (data.portfolios !== undefined) {
    const portfolioIds = await resolvePortfolioIds(data.portfolios);
    await syncLeadPortfolios(leadId, portfolioIds);
    changed = true;
  }

  // 14 Aug 2026 (§157/§158) — mirrors the portfolios block immediately
  // above, exactly, including the "explicit empty array clears it"
  // semantics.
  if (data.products !== undefined) {
    const productIds = await resolveProductIds(data.products);
    await syncLeadProducts(leadId, productIds);
    changed = true;
  }

  return changed;
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

  // Fetched before the UPDATE below — the old value is needed to move any
  // of this agent's open tasks for this lead over to the new one (§58).
  // region added 14 Aug 2026 (§166) — Mark's explicit request: "a Lead
  // should not be assignable to someone that is out of that region."
  const before = await executeQueryOne(
    `SELECT assignedAgentId AS "assignedAgentId", region FROM Lead WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: leadId }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  if (!before) throw { status: 404, message: 'Lead not found' };

  // Lenient by design, not strict: only rejects when BOTH sides actually
  // have a region set and they genuinely differ. Neither Lead.region nor
  // User.region is retroactively backfilled for existing data (§166's own
  // migration comment) — a hard "both must be set" rule would have
  // blocked assigning every lead and agent that predates this feature,
  // which is worse than the gap this closes. Revisit once region is
  // reliably populated across the board, if stricter enforcement is
  // wanted then.
  if (before.region && target.region && before.region !== target.region) {
    throw { status: 400, message: `This lead is in ${before.region}; ${target.displayName} is registered in ${target.region}. Assign to an agent in the same region, or update the lead's region if that's wrong.` };
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

  // TASK CLEANUP (§58) — a callback task assigned to the old agent for
  // this lead is still a real, valid task; it just needs a new owner.
  await reassignTasksForEntity({
    entityType: 'Lead', entityId: leadId,
    oldAssigneeId: before?.assignedAgentId, newAssigneeId: agentId,
  });
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

  // §138, 12 Aug 2026 — Mark asked directly why logged calls never showed
  // up in a Lead's Change Log: this write genuinely never existed before,
  // not a query bug. entityType 'Lead' matches listAuditLogForLead()'s own
  // base UNION branch exactly, so this needs no other change to surface —
  // confirmed by reading that function before adding this, not assumed.
  await writeAuditLog({
    entityType: 'Lead',
    entityId: leadId,
    action: 'CallLogged',
    performedById: agentId,
    changeDetail: { callAttemptId: attemptId, outcome: attemptData.outcome, notes: attemptData.notes ?? null },
  });

  // §138 — Mark's explicit design: any new call attempt closes an open
  // Callback task for this lead, regardless of this attempt's own outcome.
  // Runs before the CallbackRequested task-creation rule further down, so
  // if THIS attempt is itself another CallbackRequested, the old task is
  // already closed by the time the new one is created — no window where
  // both are open at once.
  await completeOpenCallbackTasksForLead(leadId, attemptId);

  const current = await executeQueryOne(
    `SELECT pipelineStatus AS "pipelineStatus", title, firstName AS "firstName", lastName AS "lastName"
     FROM Lead WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
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

  // TASK GENERATION — matches Tasks.jsx's own header spec:
  // "CallbackRequested outcome -> Call back [lead name] by [callbackDateTime]".
  // Assigned to `agentId` — the CALLER of this function (claims.oid from
  // the handler), not a lookup of lead.assignedAgentId. In normal use
  // these are almost always the same person (an agent calling their own
  // leads), but they are NOT guaranteed to be — see Status_Vercel.md
  // §138's "SESSION-ISOLATION FOOTGUN" entry before changing this to
  // route by lead.assignedAgentId instead; that entry documents an open
  // question about whether this needs to change at all, still pending
  // Mark confirming a clean re-test. DELIBERATELY UNCHANGED this session.
  if (current && attemptData.outcome === 'CallbackRequested') {
    const leadName = [current.title, current.firstName, current.lastName].filter(Boolean).join(' ');
    await createTask({
      assignedToId: agentId,
      type:         'Callback',
      entityType:   'Lead',
      entityId:     leadId,
      title:        `Call back ${leadName}`,
      detail:       attemptData.notes || null,
      dueAt:        attemptData.callbackDateTime ?? null,
    });
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

  // TASK CLEANUP (§58) — nothing needs calling this lead back once it's
  // gone. Only incomplete tasks; a completed one is just history.
  await deleteTasksForEntity({ entityType: 'Lead', entityId: leadId });
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
/**
 * Every MedicalSubscription (active and inactive), with real import
 * stats — backs both the "Medical subscription" import dropdown
 * (LeadImport.jsx filters to isActive client-side) and App Admin's
 * management table (§80 — that table previously showed hardcoded fake
 * stats; this is what replaces them).
 */
export async function listMedicalSubscriptions() {
  return executeQuery(
    `SELECT ms.id, ms.name, ms.providerName AS "providerName", ms.notes,
            ms.isActive AS "isActive",
            COUNT(l.id)::int AS "leadsImported",
            MAX(l.createdAt) AS "lastImportAt"
     FROM MedicalSubscription ms
     LEFT JOIN Lead l ON l.linkedSubscriptionId = ms.id AND l.deletedAt IS NULL
     WHERE ms.organisationId = @organisationId
     GROUP BY ms.id, ms.name, ms.providerName, ms.notes, ms.isActive
     ORDER BY ms.name`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * @param {{name: string, providerName?: string, notes?: string}} data
 */
export async function createMedicalSubscription(data) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO MedicalSubscription (id, organisationId, name, providerName, notes, isActive, createdAt, updatedAt)
     VALUES (@id, @organisationId, @name, @providerName, @notes, TRUE, NOW(), NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      name:           { type: sql.NVarChar(300),    value: data.name },
      providerName:   { type: sql.NVarChar(300),    value: data.providerName ?? null },
      notes:          { type: sql.NVarChar(1000),   value: data.notes ?? null },
    }
  );
  return newId;
}

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

/**
 * Resolve a lead's display name for writing into an AuditLog changeDetail
 * blob — mirrors userService.js's getUserDisplayNameById() (same 24 Jul
 * 2026 pattern), added 3 Aug 2026 to close the raw-leadId gap Mark found
 * in Task/Appointment/Event audit entries. Deliberately NOT filtered by
 * any active/deleted flag — an audit entry is a historical record, and a
 * since-deleted lead should still show its real name rather than going
 * blank. Concatenation order matches every other lead-name build in this
 * codebase (title, firstName, lastName via CONCAT_WS so a missing title
 * doesn't leave a stray leading space).
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function getLeadDisplayNameById(id) {
  const row = await executeQueryOne(
    `SELECT CONCAT_WS(' ', title, firstName, lastName) AS "displayName" FROM Lead
     WHERE id = @id AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return row?.displayName ?? null;
}
