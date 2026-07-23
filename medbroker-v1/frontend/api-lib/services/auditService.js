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
