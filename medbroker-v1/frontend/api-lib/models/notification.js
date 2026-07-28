/**
 * models/notification.js — NEW (§61).
 * Deliberately minimal compared to models/task.js — there's no manual
 * creation UI for notifications (unlike Tasks' NewTaskModal), and every
 * GET is always self-scoped (recipientId = the caller, full stop — no
 * Agent/Broker/Supervisor/Admin distinction the way Task's scoping
 * needed, since a notification is inherently personal, never assigned to
 * someone else by an admin). No list query schema either — nothing to
 * filter server-side; Notifications.jsx's All/Unread/Assignments/
 * Reminders tabs stay client-side exactly as they already were, same
 * reasoning as Task's category/status filters.
 */

import { z } from 'zod';

export const UpdateNotificationSchema = z.object({
  isRead: z.boolean(),
});
