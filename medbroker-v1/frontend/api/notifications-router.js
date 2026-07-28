/**
 * api/notifications-router.js — NEW (§61).
 * Same catch-all pattern as every other domain router (see
 * api/auth-router.js header for why) — reached via vercel.json rewrite
 * `/api/notifications/:slug*` -> `/api/notifications-router?slug=:slug*`.
 *
 * Routes:
 *   GET   /api/notifications
 *   PATCH /api/notifications/mark-all-read
 *   PATCH /api/notifications/:id
 */

import { handleNotificationsCollection, handleNotificationById, handleMarkAllRead } from '../api-lib/handlers/notificationHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleNotificationsCollection(req, res);
  // Must come before the UUID branch below — 'mark-all-read' is never a
  // valid notification id.
  if (segments.length === 1 && segments[0] === 'mark-all-read') return handleMarkAllRead(req, res);
  if (segments.length === 1) return handleNotificationById(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
