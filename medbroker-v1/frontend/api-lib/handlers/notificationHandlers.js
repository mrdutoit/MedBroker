/**
 * api-lib/handlers/notificationHandlers.js — NEW (§61).
 * No role gating beyond "authenticated" anywhere in this file — every
 * route here only ever touches the caller's own notifications
 * (recipientId = claims.oid), so there's no privilege distinction to
 * enforce the way Task's Admin/Supervisor/Agent/Broker split needed.
 * No audit log writes either — marking a notification read/unread is UI
 * bookkeeping, not a business-state change to a Lead/Appointment/User the
 * A4 audit gate (Status.md §0) is about.
 */

import { validateToken, authErrorResponse } from '../middleware/auth.js';
import { listNotificationsForUser, getNotificationById, markNotificationRead, markAllNotificationsRead } from '../services/notificationService.js';
import { sendAppointmentReminders, sendCallbackReminders, autoReturnStaleLeads, sendTaskDueReminders } from '../services/schedulerService.js';
import { UpdateNotificationSchema } from '../models/notification.js';
import { isUuid } from '../http/helpers.js';

/**
 * GET /api/notifications/scheduled-tick — Vercel Cron's entry point
 * (§68), once daily. Secured via CRON_SECRET, Vercel's own documented
 * pattern: Vercel automatically sends Authorization: Bearer
 * <CRON_SECRET> when it triggers a cron job, so this route rejects
 * anything that doesn't match — no JWT/user session involved, this is a
 * system-triggered request, not a user one. CRON_SECRET must be set as
 * an environment variable in Vercel's project settings (not something
 * committed to the repo) — Mark's action, not something this delivery
 * can do on its own.
 */
export async function handleScheduledTick(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [appointmentReminders, callbackReminders, leadsAutoReturned, taskDueReminders] = await Promise.all([
      sendAppointmentReminders(),
      sendCallbackReminders(),
      autoReturnStaleLeads(),
      sendTaskDueReminders(),
    ]);

    return res.status(200).json({ appointmentReminders, callbackReminders, leadsAutoReturned, taskDueReminders });

  } catch (err) {
    console.error('notifications/scheduled-tick error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/notifications — every authenticated role, always self-scoped */
export async function handleNotificationsCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const notifications = await listNotificationsForUser(claims.oid);
    return res.status(200).json({ notifications });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('notifications/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PATCH /api/notifications/mark-all-read */
export async function handleMarkAllRead(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    await markAllNotificationsRead(claims.oid);
    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('notifications/mark-all-read error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PATCH /api/notifications/:id */
export async function handleNotificationById(req, res, id) {
  try {
    const claims = await validateToken(req);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid notification ID format' });

    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Scoped to recipientId inside getNotificationById itself — this also
    // doubles as the ownership check (404, not 403, if it's someone
    // else's — doesn't reveal that a notification with this id exists at
    // all for a different user).
    const existing = await getNotificationById(id, claims.oid);
    if (!existing) return res.status(404).json({ error: 'Notification not found' });

    const parsed = UpdateNotificationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await markNotificationRead(id, claims.oid, parsed.data.isRead);

    const updated = await getNotificationById(id, claims.oid);
    return res.status(200).json(updated);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('notifications/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
