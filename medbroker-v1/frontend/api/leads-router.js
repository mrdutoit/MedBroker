/**
 * api/leads-router.js
 * Replaces api/leads/[[...slug]].js — see api/auth-router.js header for
 * why. Reached via vercel.json rewrite `/api/leads/:slug*` ->
 * `/api/leads-router?slug=:slug*`.
 *
 * Routes:
 *   GET    /api/leads
 *   POST   /api/leads
 *   GET    /api/leads/sources           (literal, checked before treating
 *   POST   /api/leads/check-duplicates   the segment as an :id — §63)
 *   GET    /api/leads/sar-requests       (§79 — POPIA SAR processing)
 *   POST   /api/leads/sar-requests
 *   GET    /api/leads/:id
 *   PUT    /api/leads/:id
 *   DELETE /api/leads/:id
 *   PUT    /api/leads/:id/assign
 *   PUT    /api/leads/:id/reopen
 *   GET    /api/leads/:id/calls
 *   POST   /api/leads/:id/calls
 *   GET    /api/leads/:id/audit
 *   GET    /api/leads/sar-requests/:id
 *   PATCH  /api/leads/sar-requests/:id
 *   GET    /api/leads/sar-requests/:id/export
 */

import {
  handleLeadsCollection, handleLeadSources, handleLeadById,
  handleLeadAssign, handleLeadReopen, handleLeadCalls, handleLeadAudit,
  handleLeadCheckDuplicates,
} from '../api-lib/handlers/leadHandlers.js';
import {
  handleSarRequestsCollection, handleSarRequestById, handleSarRequestExport,
} from '../api-lib/handlers/sarHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) {
    return handleLeadsCollection(req, res);
  }

  if (segments.length === 1 && segments[0] === 'sources') {
    return handleLeadSources(req, res);
  }

  if (segments.length === 1 && segments[0] === 'check-duplicates') {
    return handleLeadCheckDuplicates(req, res);
  }

  // 'sar-requests' segment — checked before the generic 1/2-segment
  // :id branches below, same defensive-ordering convention every other
  // literal sub-route in this codebase uses. A Lead id is a UUID, so
  // 'sar-requests' can never collide with one, but the check still has
  // to come first in the branch order.
  if (segments[0] === 'sar-requests') {
    if (segments.length === 1) return handleSarRequestsCollection(req, res);
    if (segments.length === 2) return handleSarRequestById(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'export') return handleSarRequestExport(req, res, segments[1]);
    return res.status(404).json({ error: 'Not found' });
  }

  if (segments.length === 1) {
    return handleLeadById(req, res, segments[0]);
  }

  if (segments.length === 2 && segments[1] === 'assign') {
    return handleLeadAssign(req, res, segments[0]);
  }

  if (segments.length === 2 && segments[1] === 'reopen') {
    return handleLeadReopen(req, res, segments[0]);
  }

  if (segments.length === 2 && segments[1] === 'calls') {
    return handleLeadCalls(req, res, segments[0]);
  }

  if (segments.length === 2 && segments[1] === 'audit') {
    return handleLeadAudit(req, res, segments[0]);
  }

  return res.status(404).json({ error: 'Not found' });
}
