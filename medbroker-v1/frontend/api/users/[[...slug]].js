/**
 * api/users/[[...slug]].js
 * Consolidated dispatcher (was api/users/index.js + api/users/[id]/index.js).
 * Optional catch-all — bare /api/users (list/create) must still match.
 *
 * Routes:
 *   GET  /api/users
 *   POST /api/users
 *   GET  /api/users/:id
 *   PUT  /api/users/:id
 */

import { handleUsersCollection, handleUserById } from '../../api-lib/handlers/userHandlers.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const slug = req.query.slug ?? [];
  const segments = Array.isArray(slug) ? slug : [slug];

  if (segments.length === 0) return handleUsersCollection(req, res);
  if (segments.length === 1) return handleUserById(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
