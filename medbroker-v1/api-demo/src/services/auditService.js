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
