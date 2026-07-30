/**
 * api/tasks-router.js — NEW (§56).
 * Same catch-all pattern as every other domain router (see
 * api/auth-router.js header for why) — reached via vercel.json rewrite
 * `/api/tasks/:slug*` -> `/api/tasks-router?slug=:slug*`.
 *
 * Routes:
 *   GET    /api/tasks
 *   POST   /api/tasks
 *   PATCH  /api/tasks/:id
 *   DELETE /api/tasks/:id
 *   GET    /api/tasks/:id/comments   (§71)
 *   POST   /api/tasks/:id/comments   (§71)
 */

import { handleTasksCollection, handleTaskById, handleTaskComments } from '../api-lib/handlers/taskHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleTasksCollection(req, res);
  if (segments.length === 1) return handleTaskById(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'comments') return handleTaskComments(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
