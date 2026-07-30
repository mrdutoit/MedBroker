/**
 * services/schedulerService.js — NEW (§68).
 * The three time-based checks Notifications.jsx's own header comment
 * (§61) named as needing "a scheduled job that doesn't exist in this
 * stack" — Vercel Cron does exist and is genuinely usable on Hobby (up
 * to 100 jobs, once-per-day cadence — confirmed via Vercel's own docs,
 * not assumed), which suits all three checks here anyway; none of them
 * need finer-grained timing. Called once daily from
 * handleScheduledTick() (notificationHandlers.js), itself triggered by
 * vercel.json's crons entry hitting /api/notifications/scheduled-tick.
 *
 * Each function is independently idempotent-by-construction — re-running
 * the same day should not create duplicate notifications, because each
 * scan's WHERE clause naturally excludes anything already handled (an
 * appointment reminder only matches appointments dated exactly today; a
 * lead already auto-returned no longer matches "still assigned and
 * inactive"). No separate "already notified today" tracking needed.
 */

import { executeQuery, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { createNotification } from './notificationService.js';
import { deleteTasksForEntity } from './taskService.js';
import { getFlagMeta } from './flagService.js';
import { getSystemConfig } from './systemConfigService.js';

/**
 * "AppointmentReminder" — every Appointment happening today, still
 * Assigned (a broker is actually attached — nothing to remind an
 * unassigned appointment's broker about), gets the assigned broker a
 * same-day reminder. Matches Notifications.jsx's own MOCK_NOTIFICATIONS
 * example wording style ("Today 07:00").
 * @returns {Promise<number>} how many reminders were sent
 */
export async function sendAppointmentReminders() {
  const organisationId = resolveOrganisationId();
  const rows = await executeQuery(
    `SELECT a.id, a.brokerId AS "brokerId", a.firstAppointmentTime AS "firstAppointmentTime",
            l.title, l.firstName AS "firstName", l.lastName AS "lastName"
     FROM Appointment a
     LEFT JOIN Lead l ON a.leadId = l.id
     WHERE a.organisationId = @organisationId
       AND a.status = 'Assigned'
       AND a.firstAppointmentDate = CURRENT_DATE
       AND a.brokerId IS NOT NULL`,
    { organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );

  for (const appt of rows) {
    const leadName = [appt.title, appt.firstName, appt.lastName].filter(Boolean).join(' ');
    await createNotification({
      recipientId: appt.brokerId,
      type:        'AppointmentReminder',
      title:       `Appointment today — ${leadName}`,
      body:        `You have an appointment with ${leadName} today${appt.firstAppointmentTime ? ` at ${appt.firstAppointmentTime}` : ''}.`,
      entityType:  'Appointment',
      entityId:    appt.id,
    });
  }
  return rows.length;
}

/**
 * "CallbackReminder" — a Lead whose most recent CallAttempt asked for a
 * callback today, with no LATER CallAttempt logged since (meaning it
 * genuinely hasn't been actioned yet), reminds the assigned agent. The
 * "no later attempt" condition is what keeps this from re-firing forever
 * once the agent actually makes the call — a fresh CallAttempt row (any
 * outcome) after the callback request means it's been handled.
 * @returns {Promise<number>} how many reminders were sent
 */
export async function sendCallbackReminders() {
  const organisationId = resolveOrganisationId();
  const rows = await executeQuery(
    `SELECT DISTINCT ON (ca.leadId)
            ca.leadId AS "leadId", ca.agentId AS "agentId",
            l.title, l.firstName AS "firstName", l.lastName AS "lastName"
     FROM CallAttempt ca
     LEFT JOIN Lead l ON ca.leadId = l.id
     WHERE ca.organisationId = @organisationId
       AND ca.outcome = 'CallbackRequested'
       AND ca.followUpDateTime::date = CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM CallAttempt later
         WHERE later.leadId = ca.leadId AND later.callTime > ca.callTime
       )
     ORDER BY ca.leadId, ca.callTime DESC`,
    { organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );

  for (const row of rows) {
    const leadName = [row.title, row.firstName, row.lastName].filter(Boolean).join(' ');
    await createNotification({
      recipientId: row.agentId,
      type:        'CallbackReminder',
      title:       `Callback due today — ${leadName}`,
      body:        `${leadName} asked to be called back today.`,
      entityType:  'Lead',
      entityId:    row.leadId,
    });
  }
  return rows.length;
}

/**
 * "LeadAutoReturned" — a Lead still Assigned/InProgress whose most
 * recent activity (last CallAttempt, or the lead's own createdAt if it
 * has none yet) is older than SystemConfig.leadAutoUnassignMonths gets
 * unassigned back to the pool: pipelineStatus -> Unassigned,
 * assignedAgentId cleared, any incomplete Task tied to it cleaned up
 * (deleteTasksForEntity — same cascade-cleanup function returnToLeads
 * already uses, reused here rather than duplicated), and the agent who
 * lost it notified why. Gated on leads.autoUnassign.enabled (defaults
 * on) — checked here since this is the one action of the three that
 * actually changes data, not just sends a notification.
 * @returns {Promise<number>} how many leads were auto-returned
 */
export async function autoReturnStaleLeads() {
  const flag = await getFlagMeta('leads.autoUnassign.enabled');
  if (!flag || flag.value !== '1') return 0;

  const sysConfig = await getSystemConfig();
  const months = sysConfig?.leadAutoUnassignMonths ?? 6;
  const organisationId = resolveOrganisationId();

  const rows = await executeQuery(
    `SELECT l.id, l.assignedAgentId AS "assignedAgentId", l.title, l.firstName AS "firstName", l.lastName AS "lastName"
     FROM Lead l
     WHERE l.organisationId = @organisationId
       AND l.deletedAt IS NULL
       AND l.pipelineStatus IN ('Assigned', 'InProgress')
       AND l.assignedAgentId IS NOT NULL
       AND COALESCE(
             (SELECT MAX(ca.callTime) FROM CallAttempt ca WHERE ca.leadId = l.id),
             l.createdAt
           ) < NOW() - (@months || ' months')::interval`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      months:         { type: sql.Int, value: months },
    }
  );

  for (const lead of rows) {
    const previousAgentId = lead.assignedAgentId;

    await executeQuery(
      `UPDATE Lead SET pipelineStatus = 'Unassigned', assignedAgentId = NULL, updatedAt = NOW()
       WHERE id = @id AND organisationId = @organisationId`,
      { id: { type: sql.UniqueIdentifier, value: lead.id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
    );

    await deleteTasksForEntity({ entityType: 'Lead', entityId: lead.id });

    const leadName = [lead.title, lead.firstName, lead.lastName].filter(Boolean).join(' ');
    await createNotification({
      recipientId: previousAgentId,
      type:        'LeadAutoReturned',
      title:       `Lead auto-returned — ${leadName}`,
      body:        `${leadName} had no activity for ${months} months and was automatically returned to the Unassigned queue.`,
      entityType:  'Lead',
      entityId:    lead.id,
    });
  }
  return rows.length;
}
