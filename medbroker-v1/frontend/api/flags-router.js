/**
 * api/flags-router.js
 * Replaces api/flags/[[...slug]].js — see api/auth-router.js header for
 * why. Reached via vercel.json rewrite `/api/flags/:slug*` ->
 * `/api/flags-router?slug=:slug*`.
 *
 * Routes:
 *   GET   /api/flags
 *   PATCH /api/flags/:key
 */

import { handleFlagsList, handleFlagUpdate } from '../api-lib/handlers/flagHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleFlagsList(req, res);
  if (segments.length === 1) return handleFlagUpdate(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
