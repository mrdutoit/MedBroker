/**
 * handlers/auditHandlers.js — NEW (§76), filters + export added (§77).
 * Backs AppAdmin's Audit Log tab, which showed ten hardcoded fake
 * entries unconditionally before §76 — not even gated behind demo mode
 * like the rest of this app. Routed through the already-existing
 * flags-router.js as a literal sub-route (GET /api/flags/audit-log) —
 * not a natural domain fit, but this app is sitting at exactly 12/12
 * Vercel functions with zero headroom, so a new top-level file wasn't
 * an option; AppAdmin's own routes (Flags, System Settings, now Audit
 * Log) already live scattered across a couple of existing routers for
 * the same reason.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listAllAuditLog, exportAuditLog } from '../services/auditService.js';
import { toCsv } from '../http/helpers.js';

const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5000;

// Fixed, known lists — validated against, not trusted blindly from the
// query string. entityType values confirmed by grepping every literal
// written anywhere in api-lib (see auditService.js's own comment);
// action values are the full set of literal action strings currently
// written anywhere in this codebase, same way.
//
// §127 (5 Aug 2026) — CORRECTED: SubjectAccessRequest (entity type) and
// SarAssigned (action, §125) were both missing from these two lists —
// added when §125 introduced them elsewhere but not here, meaning
// filtering the Audit Log by either would have silently returned zero
// rows (not an error, just nothing — the exact kind of "looks broken,
// isn't obviously why" bug this file's own parseFilters() comment
// warns about). ALSO found while fixing this: UserSessionsRevoked was
// already missing from AppAdmin.jsx's frontend filter list (unrelated
// to SAR, pre-existing) — fixed there too, same category of bug.
//
// §134 (6 Aug 2026) — SAME GAP FOUND AGAIN, THIS TIME FOR §117: TokenLedger
// (entity type, used by handleTokenTopUp's own writeAuditLog call) and
// AppointmentClaimed/TokenManualTopUp (actions, §117) were never added
// here when §117 shipped — same silent-empty-filter bug, just a
// different feature. Also SystemConfig (entity type, system-config.js's
// own audit write, predates even §117). Backfilled all four while adding
// this session's own new entries (IntegrationCredential entity type,
// IntegrationCredentialUpdated/TokenStripeCredited actions) rather than
// repeating the exact mistake a third time — see PERMANENT PATTERNS in
// Project_Context_Vercel.md: "add new types to both lists simultaneously."
//
// §135 (7 Aug 2026) — TokenPaystackCredited added alongside
// TokenStripeCredited when Paystack was added as a second payment
// provider. No new entity type needed — IntegrationCredential and
// TokenLedger already cover both providers generically.
const VALID_ENTITY_TYPES = [
  'Appointment', 'Lead', 'Event', 'EventAttendee', 'FeatureFlag', 'Task', 'User',
  'Portfolio', 'Product', 'SubjectAccessRequest', 'TokenLedger', 'SystemConfig',
  'IntegrationCredential',
];
const VALID_ACTIONS = [
  'AppointmentBrokerAssigned', 'AppointmentCreated', 'AppointmentOutcomeSaved',
  'AppointmentReassigned', 'AppointmentReturnedToLeads', 'AttendeeAdded',
  'AttendeeRemoved', 'EventCreated', 'EventStatusChanged', 'FeatureFlagUpdated',
  'LeadCreated', 'LeadDeleted', 'LeadReopened', 'LeadUpdated',
  'PortalAccountActivated', 'PortalProfileUpdated', 'PortalRegistration',
  'PortalWalkInCheckedIn', 'ProfileUpdated', 'TaskCreated', 'TaskDeleted', 'UserCreated',
  'SarRequestCreated', 'SarStatusChanged', 'SarDataExported', 'SarAssigned', 'UserUnlocked', 'UserSessionsRevoked',
  'PortfolioCreated', 'PortfolioStatusChanged', 'PortfolioDeleted',
  'ProductCreated', 'ProductStatusChanged', 'ProductDeleted',
  'AppointmentClaimed', 'TokenManualTopUp', 'SystemConfigUpdated',
  'IntegrationCredentialUpdated', 'TokenStripeCredited', 'TokenPaystackCredited',
];

/**
 * Pulls filter params off the query string, validating entityType/action
 * against the known lists above rather than passing anything through —
 * an invalid value here would just silently return zero rows either
 * way, but validating explicitly is cheap and catches a typo'd filter
 * before it looks like "there's nothing in the log" rather than "you
 * asked for something that doesn't exist".
 */
function parseFilters(query) {
  const filters = {};
  if (query.dateFrom) filters.dateFrom = query.dateFrom;
  if (query.dateTo) filters.dateTo = query.dateTo;
  if (query.entityType && VALID_ENTITY_TYPES.includes(query.entityType)) filters.entityType = query.entityType;
  if (query.action && VALID_ACTIONS.includes(query.action)) filters.action = query.action;
  if (query.performedById) filters.performedById = query.performedById;
  return filters;
}

const CSV_COLUMNS = [
  { key: 'performedAt',     label: 'Timestamp' },
  { key: 'action',          label: 'Action' },
  { key: 'entityType',      label: 'Entity Type' },
  { key: 'entityRef',       label: 'Entity' },
  { key: 'performedByName', label: 'Performed By' },
  { key: 'changeDetail',    label: 'Detail' },
];

/** GET /api/flags/audit-log */
export async function handleAuditLogList(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    const filters = parseFilters(req.query);

    // Export mode (§77) — same filters, no pagination, capped, returned
    // as a downloadable file rather than a normal JSON API response.
    if (req.query.export === 'csv' || req.query.export === 'json') {
      const entries = await exportAuditLog(filters, MAX_EXPORT_ROWS);
      const filename = `medbroker-audit-log-${new Date().toISOString().slice(0, 10)}.${req.query.export}`;

      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.statusCode = 200;
        return res.end(toCsv(entries, CSV_COLUMNS));
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.statusCode = 200;
      return res.end(JSON.stringify(entries, null, 2));
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 25));

    const result = await listAllAuditLog({ page, pageSize, ...filters });
    return res.status(200).json(result);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('flags/audit-log error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
