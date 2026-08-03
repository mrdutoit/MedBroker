/**
 * api/notifications-router.js — NEW (§61).
 * Same catch-all pattern as every other domain router (see
 * api/auth-router.js header for why) — reached via vercel.json rewrite
 * `/api/notifications/:slug*` -> `/api/notifications-router?slug=:slug*`.
 *
 * Routes:
 *   GET    /api/notifications
 *   GET    /api/notifications/scheduled-tick  (Vercel Cron only, §68)
 *   PATCH  /api/notifications/mark-all-read
 *   DELETE /api/notifications/clear-read      (§99 — clears read notifications)
 *   PATCH  /api/notifications/:id
 *   DELETE /api/notifications/:id             (§99 — dismiss one)
 */

import { handleNotificationsCollection, handleNotificationById, handleMarkAllRead, handleScheduledTick, handleClearRead } from '../api-lib/handlers/notificationHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleNotificationsCollection(req, res);
  // Must come before the UUID branch below — none of these literals are
  // ever a valid notification id.
  if (segments.length === 1 && segments[0] === 'mark-all-read') return handleMarkAllRead(req, res);
  if (segments.length === 1 && segments[0] === 'scheduled-tick') return handleScheduledTick(req, res);
  if (segments.length === 1 && segments[0] === 'clear-read') return handleClearRead(req, res);
  if (segments.length === 1) return handleNotificationById(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
