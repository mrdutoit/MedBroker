/**
 * services/notificationService.js — NEW (§61).
 * Data access for the Notification entity. Simpler than taskService.js —
 * no polymorphic entity resolution needed for display, since a
 * notification's title/body are fully human-readable text baked in at
 * creation time (entityType/entityId are carried through for a possible
 * future "go to the lead/appointment" click-through, not currently used
 * by Notifications.jsx, which has no navigation today either).
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';

/**
 * Low-level insert — used by the two synchronous trigger points this
 * narrowed pass covers: LeadAssigned (leadHandlers.js's assign handler)
 * and AppointmentAssigned (appointmentService.assignBroker()). The three
 * time-based types Notifications.jsx's own header comment lists
 * (AppointmentReminder, CallbackReminder, LeadAutoReturned) need a
 * scheduled job that doesn't exist anywhere in this stack yet —
 * deliberately not built here, see Status.md §61.
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
  return newId;
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
    `UPDATE Notification SET isRead = @isRead
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
    `UPDATE Notification SET isRead = TRUE
     WHERE recipientId = @recipientId AND isRead = FALSE AND organisationId = @organisationId`,
    {
      recipientId:    { type: sql.UniqueIdentifier, value: recipientId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}
