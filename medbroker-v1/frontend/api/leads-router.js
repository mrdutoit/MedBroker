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
 *   GET    /api/leads/subscriptions      (§80 — Medical Subscription import)
 *   GET    /api/leads/portfolios         (§90 — Portfolio/Product management)
 *   POST   /api/leads/portfolios
 *   POST   /api/leads/portfolios/:id/products
 *   PUT    /api/leads/portfolios/:id                          (§91 — activate/deactivate)
 *   DELETE /api/leads/portfolios/:id                          (§91 — guarded delete)
 *   PUT    /api/leads/portfolios/:portfolioId/products/:productId
 *   DELETE /api/leads/portfolios/:portfolioId/products/:productId
 *   GET    /api/leads/sar-requests       (§79 — POPIA SAR processing)
 *   POST   /api/leads/sar-requests
 *   GET    /api/leads/sar-requests/assignable-users (§128)
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
 *   PATCH  /api/leads/sar-requests/:id/assign    (§125)
 *   GET    /api/leads/sar-requests/:id/comments  (§125)
 *   POST   /api/leads/sar-requests/:id/comments  (§125)
 *   GET    /api/leads/sar-requests/:id/audit     (§125)
 *   POST   /api/leads/sar-requests/:id/execute-deletion (§12a, 20 Aug 2026)
 */

import {
  handleLeadsCollection, handleLeadSources, handleLeadById,
  handleLeadAssign, handleLeadReopen, handleLeadCalls, handleLeadAudit,
  handleLeadCheckDuplicates, handleLeadMedicalSubscriptions,
} from '../api-lib/handlers/leadHandlers.js';
import {
  handleSarRequestsCollection, handleSarRequestById, handleSarRequestExport,
  handleSarAssign, handleSarComments, handleSarAuditLog, handleSarAssignableUsers,
  handleSarExecuteDeletion,
} from '../api-lib/handlers/sarHandlers.js';
import {
  handlePortfoliosCollection, handlePortfolioProducts, handlePortfolioById, handleProductById,
} from '../api-lib/handlers/portfolioHandlers.js';
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

  if (segments.length === 1 && segments[0] === 'subscriptions') {
    return handleLeadMedicalSubscriptions(req, res);
  }

  // 'portfolios' segment — checked before the generic 1/2-segment :id
  // branches below, same defensive-ordering convention as every other
  // literal sub-route here.
  if (segments[0] === 'portfolios') {
    if (segments.length === 1) return handlePortfoliosCollection(req, res);
    if (segments.length === 2) return handlePortfolioById(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'products') return handlePortfolioProducts(req, res, segments[1]);
    if (segments.length === 4 && segments[2] === 'products') return handleProductById(req, res, segments[1], segments[3]);
    return res.status(404).json({ error: 'Not found' });
  }

  // 'sar-requests' segment — checked before the generic 1/2-segment
  // :id branches below, same defensive-ordering convention every other
  // literal sub-route in this codebase uses. A Lead id is a UUID, so
  // 'sar-requests' can never collide with one, but the check still has
  // to come first in the branch order.
  if (segments[0] === 'sar-requests') {
    if (segments.length === 1) return handleSarRequestsCollection(req, res);
    // §128 — must come before the generic 2-segment :id branch below,
    // same "literal routes before UUID branches" convention this file's
    // own header comment already documents for /sources and
    // /check-duplicates.
    if (segments.length === 2 && segments[1] === 'assignable-users') return handleSarAssignableUsers(req, res);
    if (segments.length === 2) return handleSarRequestById(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'export') return handleSarRequestExport(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'assign') return handleSarAssign(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'comments') return handleSarComments(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'audit') return handleSarAuditLog(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'execute-deletion') return handleSarExecuteDeletion(req, res, segments[1]);
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
