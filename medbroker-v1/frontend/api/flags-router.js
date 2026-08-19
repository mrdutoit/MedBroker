/**
 * api/flags-router.js
 * Replaces api/flags/[[...slug]].js — see api/auth-router.js header for
 * why. Reached via vercel.json rewrite `/api/flags/:slug*` ->
 * `/api/flags-router?slug=:slug*`.
 *
 * Routes:
 *   GET   /api/flags
 *   PATCH /api/flags/:key
 *   GET   /api/flags/audit-log  (§76 — not a natural domain fit, routed
 *                                 here for the same reason every other
 *                                 sub-route this build uses an existing
 *                                 router: zero headroom left at 12/12)
 *   GET   /api/flags/data-export (18 Aug 2026 — same reasoning as
 *                                 audit-log above; see
 *                                 dataExportHandlers.js's own header)
 */

import { handleFlagsList, handleFlagUpdate } from '../api-lib/handlers/flagHandlers.js';
import { handleAuditLogList } from '../api-lib/handlers/auditHandlers.js';
import { handleDataExport } from '../api-lib/handlers/dataExportHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleFlagsList(req, res);
  // Must come before the generic 1-segment PATCH-by-key branch below —
  // neither 'audit-log' nor 'data-export' is ever a valid flag key (flag
  // keys use dot-notation, e.g. 'tasks.enabled').
  if (segments.length === 1 && segments[0] === 'audit-log') return handleAuditLogList(req, res);
  if (segments.length === 1 && segments[0] === 'data-export') return handleDataExport(req, res);
  if (segments.length === 1) return handleFlagUpdate(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
