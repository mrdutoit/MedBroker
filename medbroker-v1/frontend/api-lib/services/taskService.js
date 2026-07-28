/**
 * services/taskService.js — NEW (§56).
 * Data access for the Task entity. Task.entityType/entityId is a
 * polymorphic reference (Lead OR Appointment OR neither, for a manually
 * created task) — TASK_SELECT below resolves whichever applies via two
 * mutually-exclusive LEFT JOINs (only one of entityType='Lead' /
 * entityType='Appointment' can ever match a given row) plus a third hop
 * from Appointment to its own Lead, so a task linked to an Appointment
 * still surfaces the underlying Lead's name for display — exactly what
 * Tasks.jsx's linkedLead field expects for appointment/rescheduling/
 * outcome category tasks, not just callback ones.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';

const TASK_SELECT = `
  t.id, t.type, t.title, t.detail, t.priority,
  t.dueAt AS "dueAt", t.isComplete AS "isComplete", t.completedAt AS "completedAt",
  t.createdAt AS "createdAt", t.updatedAt AS "updatedAt",
  t.assignedToId AS "assignedToId", au.displayName AS "assignedToName", au.role AS "assignedToRole",
  t.entityType AS "entityType", t.entityId AS "entityId",
  CASE WHEN t.entityType = 'Appointment' THEN t.entityId ELSE NULL END AS "linkedAppointmentId",
  COALESCE(l_direct.id, l_via_appt.id) AS "linkedLeadId",
  COALESCE(l_direct.title, l_via_appt.title) AS "linkedLeadTitle",
  COALESCE(l_direct.firstName, l_via_appt.firstName) AS "linkedLeadFirstName",
  COALESCE(l_direct.lastName, l_via_appt.lastName) AS "linkedLeadLastName"`;

const TASK_JOINS = `
  FROM Task t
  LEFT JOIN "User" au        ON t.assignedToId = au.id
  LEFT JOIN Lead l_direct    ON t.entityType = 'Lead' AND t.entityId = l_direct.id
  LEFT JOIN Appointment ap   ON t.entityType = 'Appointment' AND t.entityId = ap.id
  LEFT JOIN Lead l_via_appt  ON ap.leadId = l_via_appt.id`;

/**
 * @param {{assignedToId?: string, scopeIds?: string[]}} filters
 *   scopeIds — mandatory role-scoping (self, or self+direct reports),
 *   omitted entirely for Admin/GlobalAdmin (org-wide). assignedToId is an
 *   additional convenience filter (the Assignee dropdown), ANDed on top —
 *   composes with scopeIds exactly like every other filter pair in this
 *   codebase (Leads/Appointments' own supervisorAgentIds + agentId/brokerId).
 */
export async function listTasks({ assignedToId, scopeIds } = {}) {
  let whereClause = 'WHERE t.organisationId = @organisationId';
  const params = { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } };

  if (scopeIds !== undefined) {
    if (scopeIds.length === 0) {
      whereClause += ' AND 1 = 0'; // no direct reports yet (or none at all) — no rows
    } else {
      const placeholders = scopeIds.map((_, i) => `@scope${i}`).join(', ');
      whereClause += ` AND t.assignedToId IN (${placeholders})`;
      scopeIds.forEach((id, i) => {
        params[`scope${i}`] = { type: sql.UniqueIdentifier, value: id };
      });
    }
  }
  if (assignedToId) {
    whereClause += ' AND t.assignedToId = @assignedToId';
    params.assignedToId = { type: sql.UniqueIdentifier, value: assignedToId };
  }

  return executeQuery(
    `SELECT ${TASK_SELECT} ${TASK_JOINS} ${whereClause} ORDER BY t.dueAt ASC NULLS LAST, t.createdAt DESC`,
    params
  );
}

/** @param {string} id */
export async function getTaskById(id) {
  return executeQueryOne(
    `SELECT ${TASK_SELECT} ${TASK_JOINS} WHERE t.id = @id AND t.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * Low-level insert — used both by manual creation (POST /api/tasks, via
 * taskHandlers.js) and by the five system-generation call sites
 * (leadService.logCallAttempt, appointmentService.createAppointment/
 * saveOutcome). Deliberately takes already-resolved DB-shape fields
 * (type, not category) — the category<->type mapping lives in
 * models/task.js, one level up, so this function has no opinion on it.
 * @param {{assignedToId: string, type: string, title: string, detail?: string,
 *          priority?: string, dueAt?: string|Date, entityType?: string, entityId?: string}} data
 * @returns {Promise<string>} new task id
 */
export async function createTask(data) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO Task (
       id, organisationId, assignedToId, entityType, entityId, type,
       priority, title, detail, dueAt, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @assignedToId, @entityType, @entityId, @type,
       @priority, @title, @detail, @dueAt, NOW(), NOW()
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      assignedToId:   { type: sql.UniqueIdentifier, value: data.assignedToId },
      entityType:     { type: sql.NVarChar(50),     value: data.entityType ?? null },
      entityId:       { type: sql.UniqueIdentifier, value: data.entityId ?? null },
      type:           { type: sql.NVarChar(50),     value: data.type },
      priority:       { type: sql.NVarChar(20),     value: data.priority ?? 'Medium' },
      title:          { type: sql.NVarChar(300),    value: data.title },
      detail:         { type: sql.NVarChar(1000),   value: data.detail ?? null },
      dueAt:          { type: sql.DateTimeOffset,   value: data.dueAt ?? null },
    }
  );
  return newId;
}

/**
 * @param {string} id
 * @param {Object} data - validated UpdateTaskSchema data
 */
export async function updateTask(id, data) {
  const organisationId = resolveOrganisationId();
  const setClauses = [];
  const params = { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  const fieldTypes = {
    assignedToId: sql.UniqueIdentifier,
    title:        sql.NVarChar(300),
    detail:       sql.NVarChar(1000),
    priority:     sql.NVarChar(20),
    dueAt:        sql.DateTimeOffset,
  };
  for (const [key, type] of Object.entries(fieldTypes)) {
    // dueDate (frontend field) resolves to dueAt (DB column) before this
    // function is called — see taskHandlers.js.
    if (data[key] !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = { type, value: data[key] };
    }
  }

  // isComplete carries completedAt as a side effect — set on completion,
  // cleared on reopen — rather than trusting a client-supplied timestamp.
  if (data.isComplete !== undefined) {
    setClauses.push('isComplete = @isComplete');
    params.isComplete = { type: sql.Bit, value: data.isComplete };
    setClauses.push(`completedAt = ${data.isComplete ? 'NOW()' : 'NULL'}`);
  }

  if (setClauses.length === 0) return;

  await executeQuery(
    `UPDATE Task SET ${setClauses.join(', ')}, updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    params
  );
}

/**
 * Real hard delete, not the soft-delete convention Lead/Appointment/User
 * use — Task has no deletedAt column, and a to-do item carries no
 * business/audit record worth preserving the way a Lead or Appointment
 * does. Admin/GlobalAdmin only, enforced in the handler.
 * @param {string} id
 */
export async function deleteTask(id) {
  await executeQuery(
    `DELETE FROM Task WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}
