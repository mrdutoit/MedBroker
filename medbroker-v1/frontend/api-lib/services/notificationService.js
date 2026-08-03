/**
 * services/notificationService.js — NEW (§61), email notifications added
 * (§78). Data access for the Notification entity. Simpler than
 * taskService.js — no polymorphic entity resolution needed for display,
 * since a notification's title/body are fully human-readable text baked
 * in at creation time (entityType/entityId are carried through for a
 * possible future "go to the lead/appointment" click-through, not
 * currently used by Notifications.jsx, which has no navigation today
 * either).
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { getFlagMeta } from './flagService.js';
import { getUserEmailById } from './userService.js';
import { sendEmail } from './emailService.js';

/**
 * Low-level insert — every real notification type funnels through this
 * one function: LeadAssigned/AppointmentAssigned (action-driven, §61)
 * and AppointmentReminder/CallbackReminder/LeadAutoReturned (daily
 * Vercel Cron scan, §68 — schedulerService.js).
 * @param {{recipientId: string, type: string, title: string, body: string,
 *          entityType?: string, entityId?: string}} data
 * @returns {Promise<string>} new notification id
 */
export async function createNotification({ recipientId, type, title, body, entityType, entityId }) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO Notification (
       id, organisationId, recipientId, type, title, body, entityType, entityId, createdAt
     ) VALUES (
       @id, @organisationId, @recipientId, @type, @title, @body, @entityType, @entityId, NOW()
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      type:           { type: sql.NVarChar(100),    value: type },
      title:          { type: sql.NVarChar(300),    value: title },
      body:           { type: sql.NVarChar(2000),   value: body },
      // entityId is VARCHAR(100) on this table, not UUID — unlike Task's
      // entityId. Kept as a plain string, not sql.UniqueIdentifier.
      entityType:     { type: sql.NVarChar(50),     value: entityType ?? null },
      entityId:       { type: sql.NVarChar(100),    value: entityId ?? null },
    }
  );

  // §78 — email notifications. AWAITED, not fire-and-forget: a Vercel
  // serverless function can freeze/terminate the instant its handler
  // returns, so an un-awaited promise here risks never actually
  // completing. Wrapped in try/catch so an email failure — including
  // "SMTP isn't configured yet", which is the DEFAULT state — can never
  // make notification creation itself fail. The in-app notification
  // (already inserted above) always succeeds regardless of whether the
  // email send does.
  try {
    await maybeSendNotificationEmail({ recipientId, title, body });
  } catch (err) {
    console.error(`Email notification failed (non-fatal, in-app notification ${newId} still created):`, err.message);
  }

  return newId;
}

/**
 * Gated on the notifications.email.enabled flag (default off) — checked
 * fresh on every call rather than cached, since this flag is exactly
 * the kind of thing an Admin might flip and expect to take effect
 * immediately, not after some cache expires. Returns early (no-op,
 * no error) when the flag is off — this is the DEFAULT state, so the
 * common case does the least possible work: one flag lookup, nothing
 * else.
 */
async function maybeSendNotificationEmail({ recipientId, title, body }) {
  const flag = await getFlagMeta('notifications.email.enabled');
  if (!flag || flag.value !== '1') return;

  const email = await getUserEmailById(recipientId);
  if (!email) return; // deleted/deactivated user — nothing to send to

  await sendEmail({
    to: email,
    subject: title,
    text: body,
    html: `<p>${body}</p><p style="color:#888;font-size:12px;margin-top:24px;">This is an automated notification from MedBroker.</p>`,
  });
}

const NOTIFICATION_SELECT = `
  id, type, title, body,
  entityType AS "entityType", entityId AS "entityId",
  isRead AS "isRead", createdAt AS "createdAt"`;

/**
 * Every notification for one user — always self-scoped, no filters.
 * Notifications.jsx's tabs filter this client-side, same as Tasks' did.
 * @param {string} recipientId
 */
export async function listNotificationsForUser(recipientId) {
  return executeQuery(
    `SELECT ${NOTIFICATION_SELECT} FROM Notification
     WHERE recipientId = @recipientId AND organisationId = @organisationId
     ORDER BY createdAt DESC`,
    {
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Scoped to recipientId, not just id — a user can never fetch or act on
 * someone else's notification even by guessing an id.
 * @param {string} id
 * @param {string} recipientId
 */
export async function getNotificationById(id, recipientId) {
  return executeQueryOne(
    `SELECT ${NOTIFICATION_SELECT} FROM Notification
     WHERE id = @id AND recipientId = @recipientId AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * @param {string} id
 * @param {string} recipientId
 * @param {boolean} isRead
 */
export async function markNotificationRead(id, recipientId, isRead) {
  await executeQuery(
    `UPDATE Notification SET isRead = @isRead, readAt = CASE WHEN @isRead THEN NOW() ELSE NULL END
     WHERE id = @id AND recipientId = @recipientId AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      isRead:         { type: sql.Bit,              value: isRead },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/** @param {string} recipientId */
export async function markAllNotificationsRead(recipientId) {
  await executeQuery(
    `UPDATE Notification SET isRead = TRUE, readAt = NOW()
     WHERE recipientId = @recipientId AND isRead = FALSE AND organisationId = @organisationId`,
    {
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * §99 — a single notification, dismissed by its own recipient. Same
 * ownership check as markNotificationRead — a recipientId mismatch
 * means "not found", not "forbidden", so this can't be used to probe
 * whether a given id exists for someone else.
 * @param {string} id
 * @param {string} recipientId
 */
export async function deleteNotification(id, recipientId) {
  await executeQuery(
    `DELETE FROM Notification WHERE id = @id AND recipientId = @recipientId AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * §99 — "Clear read" bulk action. Deliberately scoped to already-read
 * notifications only — an unread one still needs to be seen, clearing
 * it would be indistinguishable from losing it.
 * @param {string} recipientId
 */
export async function deleteAllReadNotifications(recipientId) {
  await executeQuery(
    `DELETE FROM Notification WHERE recipientId = @recipientId AND isRead = TRUE AND organisationId = @organisationId`,
    {
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * §99 — the automatic side of retention, run from the same daily Cron
 * tick as the reminder checks: any notification read more than 30 days
 * ago gets cleaned up on its own, without anyone needing to remember to
 * clear it. Unread notifications are never touched by this, regardless
 * of age — an old unread notification is still something nobody has
 * seen yet, not clutter. 30 days is a reasonable default, not
 * configurable yet; worth revisiting if that turns out to matter.
 * @returns {Promise<number>} how many were cleaned up
 */
export async function cleanupOldReadNotifications() {
  const result = await executeQuery(
    `DELETE FROM Notification
     WHERE isRead = TRUE AND readAt IS NOT NULL AND readAt < NOW() - INTERVAL '30 days'
     RETURNING id`,
    {}
  );
  return result.length;
}
