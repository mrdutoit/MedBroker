/**
 * api/leads/[[...slug]].js
 * Consolidated dispatcher (was 5 separate files: index.js, sources.js,
 * [id]/index.js, [id]/assign.js, [id]/calls.js).
 *
 * Routes:
 *   GET    /api/leads
 *   POST   /api/leads
 *   GET    /api/leads/sources          (literal, checked before treating
 *                                        the segment as an :id)
 *   GET    /api/leads/:id
 *   DELETE /api/leads/:id
 *   PUT    /api/leads/:id/assign
 *   GET    /api/leads/:id/calls
 *   POST   /api/leads/:id/calls
 */

import {
  handleLeadsCollection, handleLeadSources, handleLeadById,
  handleLeadAssign, handleLeadCalls,
} from '../../api-lib/handlers/leadHandlers.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const slug = req.query.slug ?? [];
  const segments = Array.isArray(slug) ? slug : [slug];

  if (segments.length === 0) {
    return handleLeadsCollection(req, res);
  }

  if (segments.length === 1 && segments[0] === 'sources') {
    return handleLeadSources(req, res);
  }

  if (segments.length === 1) {
    return handleLeadById(req, res, segments[0]);
  }

  if (segments.length === 2 && segments[1] === 'assign') {
    return handleLeadAssign(req, res, segments[0]);
  }

  if (segments.length === 2 && segments[1] === 'calls') {
    return handleLeadCalls(req, res, segments[0]);
  }

  return res.status(404).json({ error: 'Not found' });
}
