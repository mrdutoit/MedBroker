/**
 * services/auditService.js
 * Ported from api/src/services/auditService.js. Only two changes from the
 * Azure original:
 *   - GETUTCDATE() -> NOW()
 *   - clientIp() reads a plain Node.js req.headers object (Vercel Functions)
 *     instead of the Azure Functions v4 Headers-with-.get() shape.
 * Same known limitation as the Azure version: the audit write is a separate
 * statement, not in the same transaction as the state change it records.
 */

import { executeQuery, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';

/**
 * @param {Object} entry
 * @param {string} entry.entityType
 * @param {string} entry.entityId
 * @param {string} entry.action
 * @param {string|null} entry.performedById
 * @param {Object|null} [entry.changeDetail]
 * @param {string|null} [entry.ipAddress]
 */
export async function writeAuditLog({ entityType, entityId, action, performedById, changeDetail = null, ipAddress = null }) {
  await executeQuery(
    `INSERT INTO AuditLog (id, organisationId, entityType, entityId, action, performedById, changeDetail, ipAddress, performedAt)
     VALUES (@id, @organisationId, @entityType, @entityId, @action, @performedById, @changeDetail, @ipAddress, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      entityType:     { type: sql.NVarChar(100),    value: entityType },
      entityId:       { type: sql.NVarChar(100),    value: entityId },
      action:         { type: sql.NVarChar(100),    value: action },
      performedById:  { type: sql.UniqueIdentifier, value: performedById ?? null },
      changeDetail:   { type: sql.NVarChar(sql.MAX), value: changeDetail ? JSON.stringify(changeDetail) : null },
      ipAddress:      { type: sql.NVarChar(50),     value: ipAddress },
    }
  );
}

/**
 * Change history for one entity, most recent first — backs the Audit Log /
 * Change Log panels on LeadDetail.jsx and AppointmentDetail.jsx (added
 * 23 Jul 2026, alongside the LeadUpdated write in leadHandlers.js). Same
 * table AppointmentCreated/Reassigned/OutcomeSaved etc. already write to —
 * entityType/entityId is already fully generic, nothing entity-specific
 * about this query.
 * @param {string} entityType - e.g. 'Lead', 'Appointment'
 * @param {string} entityId
 * @returns {Promise<Array>}
 */
export async function listAuditLog(entityType, entityId) {
  const rows = await executeQuery(
    `SELECT
       al.id, al.action, al.changeDetail AS "changeDetail",
       al.performedAt AS "performedAt", al.performedById AS "performedById",
       u.displayName AS "performedByName"
     FROM AuditLog al
     LEFT JOIN "User" u ON al.performedById = u.id
     WHERE al.entityType = @entityType AND al.entityId = @entityId
       AND al.organisationId = @organisationId
     ORDER BY al.performedAt DESC`,
    {
      entityType:     { type: sql.NVarChar(100), value: entityType },
      entityId:       { type: sql.NVarChar(100), value: entityId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  // changeDetail is stored as a JSON text column — parse it back for the
  // frontend rather than making every caller do it.
  return rows.map((r) => ({
    ...r,
    changeDetail: r.changeDetail ? JSON.parse(r.changeDetail) : null,
  }));
}

/**
 * Best-effort client IP extraction. Vercel Functions use a plain Node.js
 * `req` (http.IncomingMessage-style) — headers is an object, not a Headers
 * instance, so this differs from the Azure version's request.headers.get().
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (!fwd) return null;
  return Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0].trim();
}

/**
 * Org-wide audit log, paginated, most recent first — backs AppAdmin's
 * Audit Log tab (§76). Previously that tab showed ten hardcoded fake
 * entries unconditionally; this is what replaces them.
 *
 * entityType/entityId are polymorphic across everything that writes to
 * this table (Lead, Appointment, Event, EventAttendee, FeatureFlag,
 * Task, User — confirmed by grepping every entityType value actually
 * written anywhere in api-lib, not guessed). Resolving a human-readable
 * "what was this actually about" reference for ALL seven would need a
 * seven-way polymorphic join — scoped down deliberately to the three
 * that matter most for a real Admin reading this log (Lead, Appointment
 * via its Lead, User), via the same COALESCE-across-LEFT-JOINs pattern
 * already used for Task's own polymorphic Lead/Appointment resolution.
 * Everything else (Event, EventAttendee, FeatureFlag, Task) falls back
 * to entityType + entityId — FeatureFlag's entityId is already the
 * human-readable flag key itself (e.g. "tasks.enabled"), so that
 * fallback reads fine for that one specifically; Event/EventAttendee/
 * Task show a raw id, a real gap but not the one costing the most value
 * to close right now.
 *
 * IMPORTANT: the joins below compare entityId (VARCHAR) against each
 * table's id column CAST TO TEXT (l_direct.id::text), never the other
 * way around. Casting entityId TO uuid would throw a hard runtime error
 * on any row where it isn't a valid UUID — which FeatureFlag rows
 * genuinely aren't (their entityId is a flag key string like
 * "tasks.enabled"), and Postgres doesn't guarantee an AND condition
 * short-circuits away from evaluating a cast on non-matching rows.
 * Caught this before it shipped, not after a real FeatureFlag audit
 * entry made the query start throwing 500s.
 * @param {{page?: number, pageSize?: number}} params
 */
export async function listAllAuditLog({ page = 1, pageSize = 25 } = {}) {
  const organisationId = resolveOrganisationId();
  const offset = (page - 1) * pageSize;

  const [rows, [{ total }]] = await Promise.all([
    executeQuery(
      `SELECT
         al.id, al.action, al.entityType AS "entityType", al.entityId AS "entityId",
         al.changeDetail AS "changeDetail", al.performedAt AS "performedAt",
         al.performedById AS "performedById",
         COALESCE(pu.displayName, 'System') AS "performedByName",
         COALESCE(
           CASE WHEN al.entityType = 'Lead' THEN
             CONCAT_WS(' ', l_direct.title, l_direct.firstName, l_direct.lastName)
           END,
           CASE WHEN al.entityType = 'Appointment' THEN
             CONCAT_WS(' ', l_via_appt.title, l_via_appt.firstName, l_via_appt.lastName)
           END,
           CASE WHEN al.entityType = 'User' THEN eu.displayName END,
           CONCAT(al.entityType, ': ', al.entityId)
         ) AS "entityRef"
       FROM AuditLog al
       LEFT JOIN "User" pu       ON al.performedById = pu.id
       LEFT JOIN Lead l_direct   ON al.entityType = 'Lead' AND al.entityId = l_direct.id::text
       LEFT JOIN Appointment ap  ON al.entityType = 'Appointment' AND al.entityId = ap.id::text
       LEFT JOIN Lead l_via_appt ON ap.leadId = l_via_appt.id
       LEFT JOIN "User" eu       ON al.entityType = 'User' AND al.entityId = eu.id::text
       WHERE al.organisationId = @organisationId
       ORDER BY al.performedAt DESC
       LIMIT @pageSize OFFSET @offset`,
      {
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
        pageSize:        { type: sql.Int, value: pageSize },
        offset:          { type: sql.Int, value: offset },
      }
    ),
    executeQuery(
      `SELECT COUNT(*)::int AS total FROM AuditLog WHERE organisationId = @organisationId`,
      { organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
    ),
  ]);

  return {
    entries: rows.map(r => ({ ...r, changeDetail: r.changeDetail ? JSON.parse(r.changeDetail) : null })),
    total,
    page,
    pageSize,
  };
}
