/**
 * services/auditService.js
 * Writes to AuditLog — the tamper-evident record of who did what to which
 * record and when, called out as a go-live gate in the security review
 * (Project_Context.md §11) and in the AuditLog DB grant itself, which is
 * INSERT-only (see infra/schema.sql §17): this module is the only thing the
 * application is even permitted to do to this table.
 *
 * KNOWN LIMITATION: the audit write happens after the state-changing write,
 * as a separate statement — not in the same DB transaction (db.js does not
 * yet expose transactions). In the rare case where the process dies between
 * the two statements, a state change could land without its audit row. This
 * closes the "no audit trail at all" gap; closing the atomicity gap too needs
 * transaction support added to db.js — tracked separately, not done here.
 */

import { executeQuery, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';

/**
 * @param {Object} entry
 * @param {string} entry.entityType        e.g. 'Lead', 'Appointment'
 * @param {string} entry.entityId          the affected record's id
 * @param {string} entry.action            e.g. 'LeadAssigned', 'LeadDeleted'
 * @param {string|null} entry.performedById  the acting user's id (claims.oid), or null for public/system actions
 * @param {Object|null} [entry.changeDetail] JSON-serialisable detail (e.g. { previousAgentId, newAgentId })
 * @param {string|null} [entry.ipAddress]
 */
export async function writeAuditLog({ entityType, entityId, action, performedById, changeDetail = null, ipAddress = null }) {
  await executeQuery(
    `INSERT INTO AuditLog (id, organisationId, entityType, entityId, action, performedById, changeDetail, ipAddress, performedAt)
     VALUES (@id, @organisationId, @entityType, @entityId, @action, @performedById, @changeDetail, @ipAddress, GETUTCDATE())`,
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
 * Best-effort client IP extraction from the standard forwarded header.
 * Shared with eventRegistration.js's equivalent local helper — duplicated
 * intentionally for now rather than forcing an unrelated refactor of that
 * file in this pass.
 * @param {import('@azure/functions').HttpRequest} request
 * @returns {string|null}
 */
export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) ?? null;
}
