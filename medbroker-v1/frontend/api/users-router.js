/**
 * api/users-router.js
 * Replaces api/users/[[...slug]].js — see api/auth-router.js header for
 * why. Reached via vercel.json rewrite `/api/users/:slug*` ->
 * `/api/users-router?slug=:slug*`.
 *
 * Routes:
 *   GET  /api/users
 *   POST /api/users
 *   GET  /api/users/:id
 *   PUT  /api/users/:id
 */

import { handleUsersCollection, handleUserById } from '../api-lib/handlers/userHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleUsersCollection(req, res);
  if (segments.length === 1) return handleUserById(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
