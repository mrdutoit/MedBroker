/**
 * api/flags/[[...slug]].js
 * Consolidated dispatcher (was api/flags/index.js + api/flags/[key].js).
 * Optional catch-all ([[...]], double brackets) rather than required
 * ([...]) — the bare /api/flags path (GET, no key) must still match, not
 * just /api/flags/:key.
 *
 * Routes:
 *   GET   /api/flags
 *   PATCH /api/flags/:key
 */

import { handleFlagsList, handleFlagUpdate } from '../../api-lib/handlers/flagHandlers.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const slug = req.query.slug ?? [];
  const segments = Array.isArray(slug) ? slug : [slug];

  if (segments.length === 0) return handleFlagsList(req, res);
  if (segments.length === 1) return handleFlagUpdate(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
