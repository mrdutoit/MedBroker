/**
 * api-lib/handlers/taskHandlers.js — NEW (§56).
 *
 * Role scoping mirrors the pattern already used for Leads/Appointments
 * (see appointmentHandlers.js) rather than re-deriving it: Agent/Broker
 * (without Supervisor/Admin) see only their own tasks; Supervisor-only
 * sees self + direct reports; Admin/GlobalAdmin see everything in the
 * organisation. A task's assignedToId can be anyone (an Agent, a Broker,
 * or an Admin themselves for a manual task) — scoping is always by
 * assignedToId, never by an agentId/brokerId distinction the way
 * Appointments' scoping is, since Task has no such split.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listTasks, getTaskById, createTask, updateTask, deleteTask, listComments, createComment } from '../services/taskService.js';
import { createNotification } from '../services/notificationService.js';
import { getDirectReportIds, isAgentOnly, isSupervisorOnly, getUserDisplayNameById } from '../services/userService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { CreateTaskSchema, UpdateTaskSchema, TaskListQuerySchema, CATEGORY_TO_TYPE, TYPE_TO_CATEGORY, CreateCommentSchema } from '../models/task.js';
import { isUuid } from '../http/helpers.js';

const EDIT_FIELDS = ['assignedToId', 'title', 'detail', 'priority', 'dueDate'];

function isAdminRole(roles) {
  return (roles ?? []).some(r => ['Admin', 'GlobalAdmin'].includes(r));
}

/**
 * Translates a taskService row into exactly the shape Tasks.jsx's own
 * MOCK_TASKS already established — category (not type), done (not
 * isComplete), dueDate/createdAt as date-only strings, linkedLead as an
 * assembled display name rather than three separate name columns. Keeping
 * this translation here (not in taskService.js) means the service stays
 * about DB shape and this handler owns the one place that has to match
 * the frontend's pre-existing contract exactly.
 * @param {Object} row
 */
/**
 * Postgres TIMESTAMPTZ/DATE columns come back from pg as native JS Date
 * objects, not strings — String(dateObj) calls .toString(), which reads
 * like "Fri Jul 31 2026 00:00:00 GMT+0000 (...)" and has NO YEAR in its
 * first 10 characters ("Fri Jul 31"). Re-parsed on the frontend via
 * new Date(...), a year-less date string silently defaults to 2001 in V8
 * — which is exactly the bug Mark caught: a task due 31 Jul 2026 showed
 * as "Overdue 9129d" because it was being compared against 31 Jul 2001.
 * .toISOString() is the fix — matches the pattern already used correctly
 * elsewhere (leadHandlers.js's dateOfBirth). Handles either shape
 * defensively (a Date object, or an already-correct ISO string) since
 * nothing here guarantees the pg driver's return shape won't ever change.
 */
function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function shapeTask(row) {
  const linkedLead = row.linkedLeadId
    ? [row.linkedLeadTitle, row.linkedLeadFirstName, row.linkedLeadLastName].filter(Boolean).join(' ')
    : null;
  return {
    id:                row.id,
    category:          TYPE_TO_CATEGORY[row.type] ?? 'manual',
    priority:          row.priority,
    done:              row.isComplete,
    title:             row.title,
    detail:            row.detail,
    linkedLead,
    linkedLeadId:      row.linkedLeadId,
    linkedAppointment: row.linkedAppointmentId,
    assignedTo:        row.assignedToName,
    assignedToId:      row.assignedToId,
    assignedToRole:    row.assignedToRole,
    createdBy:         row.createdByName,
    createdById:       row.createdById,
    dueDate:           toDateOnly(row.dueAt),
    createdAt:         toDateOnly(row.createdAt),
    source:            row.type === 'Manual' ? 'manual' : 'system',
  };
}

/** GET (list) + POST (create) /api/tasks */
export async function handleTasksCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

      const parsed = TaskListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const filters = { ...parsed.data, viewerId: claims.oid };
      if (!isAdminRole(claims.roles)) {
        if (isSupervisorOnly(claims.roles)) {
          filters.scopeIds = [claims.oid, ...(await getDirectReportIds(claims.oid))];
        } else {
          // Agent-only, Broker-only, or any other non-admin combination —
          // scoped to their own tasks only. viewerId above still applies
          // on top — same scopeIds here already, so no behaviour change
          // for this branch specifically, just consistency.
          filters.scopeIds = [claims.oid];
        }
      }
      // Admin/GlobalAdmin: no scopeIds at all — org-wide, matching listTasks'
      // own contract (scopeIds undefined = no scoping filter applied).
      // viewerId is harmless here too — listTasks only uses it when
      // scopeIds is actually set.

      const tasks = await listTasks(filters);
      return res.status(200).json({ tasks: tasks.map(shapeTask) });
    }

    if (req.method === 'POST') {
      // Matches Tasks.jsx: only Admin/Supervisor/GlobalAdmin see "+ New Task".
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

      const parsed = CreateTaskSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createTask({
        assignedToId: parsed.data.assignedToId,
        createdById:  claims.oid,
        type:         CATEGORY_TO_TYPE[parsed.data.category],
        title:        parsed.data.title,
        detail:       parsed.data.detail,
        priority:     parsed.data.priority,
        dueAt:        parsed.data.dueDate || null,
        // Manual creation never links a real Lead/Appointment — no
        // entity-picking UI exists in NewTaskModal.
        entityType:   null,
        entityId:     null,
      });

      await writeAuditLog({
        entityType: 'Task',
        entityId: newId,
        action: 'TaskCreated',
        performedById: claims.oid,
        changeDetail: {
          assignedToId: parsed.data.assignedToId,
          assignedToName: await getUserDisplayNameById(parsed.data.assignedToId),
          category: parsed.data.category,
        },
        ipAddress: clientIp(req),
      });

      const created = await getTaskById(newId);
      return res.status(201).json(shapeTask(created));
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('tasks/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Shared visibility check for a single task — used by PATCH/DELETE
 * (below) and by the new comments endpoint (§71), so there's exactly
 * one place this logic lives, not two copies that can drift apart.
 *
 * FIXED 30 Jul 2026, §71: this used to only check assignedToId — §69
 * fixed listTasks()' LIST-view scoping to also consider createdById
 * (a creator's own tasks are always visible to them, regardless of who
 * they're assigned to), but this SINGLE-task check was never updated to
 * match. That meant a Supervisor could see their own creation in the
 * list, but clicking into it — or, now, commenting on it — would still
 * 403. Fixed here, alongside building comments, which needed this exact
 * check anyway.
 * @param {Object} claims
 * @param {Object} task - a row from getTaskById()
 * @returns {Promise<boolean>}
 */
async function canSeeTask(claims, task) {
  if (isAdminRole(claims.roles)) return true;
  if (task.createdById === claims.oid) return true;
  if (isSupervisorOnly(claims.roles)) {
    const reportIds = await getDirectReportIds(claims.oid);
    return task.assignedToId === claims.oid || reportIds.includes(task.assignedToId);
  }
  return task.assignedToId === claims.oid;
}

/** GET + POST /api/tasks/:id/comments — §71 */
export async function handleTaskComments(req, res, taskId) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    if (!isUuid(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });

    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!(await canSeeTask(claims, task))) {
      return res.status(403).json({ error: 'You do not have access to this task' });
    }

    if (req.method === 'GET') {
      const comments = await listComments(taskId);
      return res.status(200).json({
        comments: comments.map(c => ({
          id: c.id, body: c.body, createdAt: c.createdAt,
          authorId: c.authorId, author: c.authorName,
        })),
      });
    }

    if (req.method === 'POST') {
      const parsed = CreateCommentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createComment(taskId, claims.oid, parsed.data.body);

      const comments = await listComments(taskId);
      const created = comments.find(c => c.id === newId);
      return res.status(201).json({
        id: created.id, body: created.body, createdAt: created.createdAt,
        authorId: created.authorId, author: created.authorName,
      });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('tasks/[id]/comments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PATCH + DELETE /api/tasks/:id */
export async function handleTaskById(req, res, id) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid task ID format' });

    const existing = await getTaskById(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    // Visibility — see canSeeTask() above (shared with the comments
    // endpoint; also now correctly considers createdById, not just
    // assignedToId — see that function's own comment for why this
    // changed today).
    const canSee = await canSeeTask(claims, existing);
    if (!canSee) return res.status(403).json({ error: 'You do not have access to this task' });

    if (req.method === 'PATCH') {
      const parsed = UpdateTaskSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      // isComplete is the one field the assignee themselves can touch —
      // ticking off your own task doesn't need Admin/Supervisor. Editing
      // or reassigning anything else does (matches only Admin/Supervisor/
      // GlobalAdmin ever seeing a way to do so in Tasks.jsx).
      const isEditOrReassign = EDIT_FIELDS.some(f => parsed.data[f] !== undefined);
      if (isEditOrReassign && !isAdminRole(claims.roles) && !isSupervisorOnly(claims.roles)) {
        return res.status(403).json({ error: 'Only an Admin or Supervisor can edit or reassign a task' });
      }

      // §105 — Mark asked for reassignment targets to be constrained to a
      // Supervisor's own team, not org-wide. Enforced here, not just in
      // Tasks.jsx's dropdown — a hidden option in the UI is a suggestion,
      // not a rule; the API is what actually has to say no. Admin/
      // GlobalAdmin are deliberately exempt (matches canSeeTask's own
      // org-wide visibility for those roles). A Supervisor may reassign
      // to themselves or a direct report — the same set canSeeTask()
      // already lets them see a task on in the first place.
      if (parsed.data.assignedToId && isSupervisorOnly(claims.roles) && !isAdminRole(claims.roles)) {
        const reportIds = await getDirectReportIds(claims.oid);
        const allowedTargets = new Set([claims.oid, ...reportIds]);
        if (!allowedTargets.has(parsed.data.assignedToId)) {
          return res.status(403).json({ error: 'A Supervisor can only reassign tasks to themselves or a direct report' });
        }
      }

      const { dueDate, ...rest } = parsed.data;
      await updateTask(id, dueDate !== undefined ? { ...rest, dueAt: dueDate } : rest);

      // §98 — a genuine reassignment (assignedToId present in this PATCH
      // AND actually different from who had it before) gets the new
      // assignee the same TaskAssigned notification createTask() sends
      // on first creation. Deliberately NOT firing for every edit —
      // changing the title or priority isn't a new assignment.
      if (parsed.data.assignedToId && parsed.data.assignedToId !== existing.assignedToId) {
        await createNotification({
          recipientId: parsed.data.assignedToId,
          type:        'TaskAssigned',
          title:       `Task reassigned to you — ${existing.title}`,
          body:        `You have been assigned this task.${existing.dueAt ? ` Due ${String(existing.dueAt).slice(0, 10)}.` : ''}`,
          entityType:  'Task',
          entityId:    id,
        });
      }

      await writeAuditLog({
        entityType: 'Task',
        entityId: id,
        action: parsed.data.isComplete === true ? 'TaskCompleted'
              : parsed.data.isComplete === false ? 'TaskReopened'
              : 'TaskUpdated',
        performedById: claims.oid,
        changeDetail: parsed.data.assignedToId
          ? { ...parsed.data, assignedToName: await getUserDisplayNameById(parsed.data.assignedToId) }
          : parsed.data,
        ipAddress: clientIp(req),
      });

      const updated = await getTaskById(id);
      return res.status(200).json(shapeTask(updated));
    }

    if (req.method === 'DELETE') {
      // Header spec: "DELETE /api/tasks/:id Admin only" — GlobalAdmin
      // always travels with Admin in this codebase's allow-lists.
      requireRole(claims, ['Admin', 'GlobalAdmin']);

      // §58 — Mark's ask was specifically to delete MANUALLY created
      // tasks. Deleting a system-generated one (Callback, Appointment,
      // Reschedule, Outcome) would make a real pending action vanish with
      // no record — those should be completed, reassigned, or left to the
      // cascade cleanup in taskService.js (deleteTasksForEntity/
      // reassignTasksForEntity), not deleted one at a time by hand.
      if (existing.type !== 'Manual') {
        return res.status(400).json({ error: 'Only manually created tasks can be deleted. System-generated tasks should be completed or reassigned instead.' });
      }

      await deleteTask(id);

      await writeAuditLog({
        entityType: 'Task',
        entityId: id,
        action: 'TaskDeleted',
        performedById: claims.oid,
        changeDetail: null,
        ipAddress: clientIp(req),
      });

      return res.status(204).end();
    }

    res.setHeader('Allow', 'PATCH, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('tasks/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
