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
 * Shared SELECT/JOIN base for the org-wide audit log — see
 * listAllAuditLog's own comment for the full reasoning on entityRef
 * resolution and why the joins compare entityId AGAINST id::text, never
 * the other way around (a real cast-failure bug, caught before it
 * shipped — see that comment for the full story). Both listAllAuditLog
 * and exportAuditLog build on this exact same base, so there's exactly
 * one place this logic lives, not two that can drift apart.
 *
 * EXTENDED 3 Aug 2026 (§103) — Task/Event/EventAttendee added to the
 * COALESCE, closing the gap this comment used to describe as
 * deprioritized ("not the one costing the most value to close right
 * now"). Mark found it costing real value in testing, so all three now
 * resolve same as Lead/Appointment/User do: Task -> its title,
 * Event -> its name, EventAttendee -> the attendee's own Lead name (an
 * attendee IS a lead; there's no separate "attendee name" to show).
 * FeatureFlag/Portfolio/Product/MedicalSubscription still fall through
 * to the generic "EntityType: id" string — all three already read fine
 * that way (a flag's entityId is its own human-readable key; Portfolio/
 * Product/MedicalSubscription entries' changeDetail already carries the
 * name directly, per formatChangeDetail() in AppAdmin.jsx), so extending
 * the join further wasn't worth the extra JOINs for no visible gain.
 */
const AUDIT_SELECT_BASE = `
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
         CASE WHEN al.entityType = 'Task' THEN tk.title END,
         CASE WHEN al.entityType = 'Event' THEN ev.name END,
         CASE WHEN al.entityType = 'EventAttendee' THEN
           CONCAT_WS(' ', l_via_attendee.title, l_via_attendee.firstName, l_via_attendee.lastName)
         END,
         -- §127 (5 Aug 2026) — Mark found this: a SubjectAccessRequest-
         -- scoped entry (§125) fell straight through to the generic
         -- fallback below, showing "SubjectAccessRequest: <raw SAR
         -- id>" with no indication of which Lead the request was even
         -- about. Same indirect-join shape Appointment/EventAttendee
         -- already use above (resolve through a foreign key to the Lead
         -- who's actually the point of interest), not a new pattern.
         CASE WHEN al.entityType = 'SubjectAccessRequest' THEN
           CONCAT_WS(' ', l_via_sar.title, l_via_sar.firstName, l_via_sar.lastName)
         END,
         CONCAT(al.entityType, ': ', al.entityId)
       ) AS "entityRef"
     FROM AuditLog al
     LEFT JOIN "User" pu           ON al.performedById = pu.id
     LEFT JOIN Lead l_direct       ON al.entityType = 'Lead' AND al.entityId = l_direct.id::text
     LEFT JOIN Appointment ap      ON al.entityType = 'Appointment' AND al.entityId = ap.id::text
     LEFT JOIN Lead l_via_appt     ON ap.leadId = l_via_appt.id
     LEFT JOIN "User" eu           ON al.entityType = 'User' AND al.entityId = eu.id::text
     LEFT JOIN Task tk             ON al.entityType = 'Task' AND al.entityId = tk.id::text
     LEFT JOIN Event ev            ON al.entityType = 'Event' AND al.entityId = ev.id::text
     LEFT JOIN EventAttendee eatt  ON al.entityType = 'EventAttendee' AND al.entityId = eatt.id::text
     LEFT JOIN Lead l_via_attendee ON eatt.leadId = l_via_attendee.id
     LEFT JOIN SubjectAccessRequest sar_ref ON al.entityType = 'SubjectAccessRequest' AND al.entityId = sar_ref.id::text
     LEFT JOIN Lead l_via_sar      ON sar_ref.leadId = l_via_sar.id`;

/**
 * Builds the WHERE clause + params shared by listAllAuditLog and
 * exportAuditLog — filters must behave identically in both, or an
 * export could silently include/exclude different rows than what's on
 * screen, which would be a genuinely bad bug for a compliance feature
 * specifically (an export that doesn't match what was reviewed on
 * screen before exporting it).
 * @param {{dateFrom?: string, dateTo?: string, entityType?: string, action?: string, performedById?: string}} filters
 */
function buildAuditFilters(filters = {}) {
  const organisationId = resolveOrganisationId();
  const conditions = ['al.organisationId = @organisationId'];
  const params = { organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  if (filters.dateFrom) {
    conditions.push('al.performedAt >= @dateFrom');
    params.dateFrom = { type: sql.DateTimeOffset, value: new Date(`${filters.dateFrom}T00:00:00Z`) };
  }
  if (filters.dateTo) {
    conditions.push('al.performedAt <= @dateTo');
    params.dateTo = { type: sql.DateTimeOffset, value: new Date(`${filters.dateTo}T23:59:59Z`) };
  }
  if (filters.entityType) {
    conditions.push('al.entityType = @entityType');
    params.entityType = { type: sql.NVarChar(100), value: filters.entityType };
  }
  if (filters.action) {
    conditions.push('al.action = @action');
    params.action = { type: sql.NVarChar(100), value: filters.action };
  }
  if (filters.performedById) {
    conditions.push('al.performedById = @performedById');
    params.performedById = { type: sql.UniqueIdentifier, value: filters.performedById };
  }

  return { whereClause: `WHERE ${conditions.join(' AND ')}`, params };
}

/**
 * Org-wide audit log, paginated, most recent first — backs AppAdmin's
 * Audit Log tab (§76, filters added §77). Previously that tab showed ten
 * hardcoded fake entries unconditionally; this is what replaces them.
 *
 * entityType/entityId are polymorphic across everything that writes to
 * this table (Lead, Appointment, Event, EventAttendee, FeatureFlag,
 * Task, User — confirmed by grepping every entityType value actually
 * written anywhere in api-lib, not guessed). Resolving a human-readable
 * "what was this actually about" reference for ALL seven would need a
 * seven-way polymorphic join — scoped down deliberately to the three
 * that matter most for a real Admin reading this log (Lead, Appointment
 * via its Lead, User). Everything else falls back to entityType +
 * entityId — FeatureFlag's entityId is already the human-readable flag
 * key itself (e.g. "tasks.enabled"), so that fallback reads fine for
 * that one specifically; Event/EventAttendee/Task show a raw id, a real
 * gap but not the one costing the most value to close right now.
 * @param {{page?: number, pageSize?: number, dateFrom?: string, dateTo?: string, entityType?: string, action?: string, performedById?: string}} params
 */
export async function listAllAuditLog({ page = 1, pageSize = 25, ...filters } = {}) {
  const offset = (page - 1) * pageSize;
  const { whereClause, params } = buildAuditFilters(filters);

  const [rows, [{ total }]] = await Promise.all([
    executeQuery(
      `SELECT ${AUDIT_SELECT_BASE}
       ${whereClause}
       ORDER BY al.performedAt DESC
       LIMIT @pageSize OFFSET @offset`,
      { ...params, pageSize: { type: sql.Int, value: pageSize }, offset: { type: sql.Int, value: offset } }
    ),
    executeQuery(
      `SELECT COUNT(*)::int AS total FROM AuditLog al ${whereClause}`,
      params
    ),
  ]);

  return {
    entries: rows.map(r => ({ ...r, changeDetail: r.changeDetail ? JSON.parse(r.changeDetail) : null })),
    total,
    page,
    pageSize,
  };
}

/**
 * Every row matching the same filters as listAllAuditLog, no pagination
 * — backs CSV/JSON export (§77). Capped at maxRows as a safety limit
 * against an unbounded export on a very large, unfiltered log; the
 * handler is responsible for telling the caller if the cap was hit
 * (checked via whether the returned count === maxRows, a reasonable
 * signal even though technically ambiguous if the true count happens to
 * match exactly — acceptable tradeoff for not running a second COUNT
 * query just for this).
 * @param {Object} filters - same shape as listAllAuditLog, minus page/pageSize
 * @param {number} [maxRows]
 */
export async function exportAuditLog(filters = {}, maxRows = 5000) {
  const { whereClause, params } = buildAuditFilters(filters);
  const rows = await executeQuery(
    `SELECT ${AUDIT_SELECT_BASE}
     ${whereClause}
     ORDER BY al.performedAt DESC
     LIMIT @maxRows`,
    { ...params, maxRows: { type: sql.Int, value: maxRows } }
  );
  return rows.map(r => ({ ...r, changeDetail: r.changeDetail ? JSON.parse(r.changeDetail) : null }));
}
