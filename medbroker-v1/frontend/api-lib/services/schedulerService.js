/**
 * services/schedulerService.js — NEW (§68); sendTaskDueReminders added
 * §98 alongside TaskAssigned (see taskService.js's createTask()) —
 * Tasks had never been wired into notifications at all until then.
 * The three original time-based checks were what Notifications.jsx's
 * own header comment (§61) named as needing "a scheduled job that
 * doesn't exist in this stack" — Vercel Cron does exist and is
 * genuinely usable on Hobby (up to 100 jobs, once-per-day cadence —
 * confirmed via Vercel's own docs, not assumed), which suits every
 * check here; none of them need finer-grained timing. Called once
 * daily from handleScheduledTick() (notificationHandlers.js), itself
 * triggered by vercel.json's crons entry hitting
 * /api/notifications/scheduled-tick.
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
import { findLeastLoadedSupervisorForRegion } from './userService.js';
import { shortDateLabel } from './appointmentService.js';

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
 * "AppointmentUnassignedWarning" — 14 Aug 2026 (§160), outstanding item
 * 2: nothing previously surfaced a claim-model or assign-model
 * appointment as it approaches its own date with no broker attached
 * yet. Fires exactly SystemConfig.appointmentUnassignedWarningDays
 * before firstAppointmentDate, for any Appointment still status =
 * 'Unassigned' at that point — the same status value both models leave
 * a broker-less appointment at (claim mode's "Available to Claim" pool
 * is literally status = 'Unassigned', confirmed directly against
 * listAvailableToClaim(); assign mode starts there too, before a
 * Supervisor/Admin picks a broker), so one query covers both, no need
 * to branch on the claimModel flag at all.
 *
 * Recipient logic deliberately doesn't re-derive routing from scratch:
 * LEFT JOINs the open Assign-broker Task (type='Appointment',
 * entityType='Appointment') already created at booking time in assign
 * mode (appointmentService.createAppointment) — if one exists, notifies
 * whoever CURRENTLY holds it (its assignedToId), which correctly
 * reflects a manual reassignment since creation rather than
 * re-computing a possibly-different answer via the region lookup. Only
 * when no such Task exists (claim mode, where §140 deliberately never
 * creates one — the appointment's own visibility in the claim pool was
 * judged the mechanism, but nothing escalates it as the date nears,
 * which is exactly the gap this closes) does it fall back to the same
 * findLeastLoadedSupervisorForRegion(...) ?? the agent themselves
 * routing appointmentService.createAppointment() already uses for the
 * Assign-broker Task itself — same "never orphan" pattern, not a new one.
 *
 * Naturally idempotent like every other check in this file — matches
 * firstAppointmentDate to an EXACT date (today + N days), not a range,
 * so it only fires once per appointment, on the one day that's true.
 * @returns {Promise<number>} how many warnings were sent
 */
export async function sendUnassignedAppointmentWarnings() {
  const organisationId = resolveOrganisationId();
  const sysConfig = await getSystemConfig();
  const days = sysConfig?.appointmentUnassignedWarningDays ?? 2;

  const rows = await executeQuery(
    `SELECT a.id, a.firstAppointmentDate AS "firstAppointmentDate",
            ag.region AS "agentRegion", ag.id AS "agentId",
            l.title, l.firstName AS "firstName", l.lastName AS "lastName",
            t.assignedToId AS "taskAssigneeId"
     FROM Appointment a
     JOIN Lead l ON l.id = a.leadId
     JOIN "User" ag ON ag.id = a.agentId
     LEFT JOIN Task t ON t.entityType = 'Appointment' AND t.entityId = a.id
       AND t.type = 'Appointment' AND t.isComplete = FALSE
     WHERE a.status = 'Unassigned' AND a.organisationId = @organisationId
       AND a.firstAppointmentDate = CURRENT_DATE + @days`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      days:           { type: sql.Int, value: days },
    }
  );

  let sent = 0;
  for (const appt of rows) {
    // Assign-mode: notify whoever currently holds the open Assign-broker
    // Task. Claim-mode (or any other case with no such Task): route by
    // region the same way that Task was originally routed, falling back
    // to the agent themselves if no region-matched Supervisor exists.
    const recipientId = appt.taskAssigneeId
      ?? (await findLeastLoadedSupervisorForRegion(appt.agentRegion))
      ?? appt.agentId;
    if (!recipientId) continue; // never expected (agentId is NOT NULL), guards the fallback chain anyway

    const leadName = [appt.title, appt.firstName, appt.lastName].filter(Boolean).join(' ');
    const dateLabel = shortDateLabel(appt.firstAppointmentDate);
    await createNotification({
      recipientId,
      type:        'AppointmentUnassignedWarning',
      title:       `Still unassigned — ${leadName}`,
      body:        `${leadName}'s appointment on ${dateLabel} still has no broker attached.`,
      entityType:  'Appointment',
      entityId:    appt.id,
    });
    sent++;
  }
  return sent;
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
 * "TaskDueReminder" — every incomplete Task due today gets its assignee
 * a same-day reminder, matching AppointmentReminder's exact shape.
 * Naturally idempotent like the other two checks here — a task only
 * matches dueAt = today on the one day that's actually true, and a
 * completed task drops out of the WHERE clause entirely, so there's
 * nothing to separately track.
 * @returns {Promise<number>} how many reminders were sent
 */
export async function sendTaskDueReminders() {
  const organisationId = resolveOrganisationId();
  const rows = await executeQuery(
    `SELECT id, assignedToId AS "assignedToId", title
     FROM Task
     WHERE organisationId = @organisationId
       AND isComplete = FALSE
       AND dueAt::date = CURRENT_DATE`,
    { organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );

  for (const task of rows) {
    await createNotification({
      recipientId: task.assignedToId,
      type:        'TaskDueReminder',
      title:       `Task due today — ${task.title}`,
      body:        `"${task.title}" is due today.`,
      entityType:  'Task',
      entityId:    task.id,
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
