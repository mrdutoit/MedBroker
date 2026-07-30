/**
 * models/task.js — NEW (§56).
 * Validation schemas for the Tasks API. Built by reading Tasks.jsx's own
 * header comment and MOCK_TASKS shape first, not guessed.
 *
 * CATEGORY <-> TYPE: Tasks.jsx's UI concept is "category" (callback,
 * appointment, rescheduling, outcome, manual) — lowercase, and
 * 'rescheduling' specifically, not 'reschedule'. The DB column is `type`,
 * matching the Azure-ported schema's existing CK_Task_Type enum values
 * (Callback, Appointment, Reschedule, Reminder, Outcome, Manual — see
 * migration 013 for why Manual had to be added). CATEGORY_TO_TYPE /
 * TYPE_TO_CATEGORY below are the single source of truth for that mapping —
 * used by both the handler (incoming category filters/creates) and the
 * service (outgoing rows), so the two directions can never drift apart.
 */

import { z } from 'zod';

export const TaskCategory = z.enum(['callback', 'appointment', 'rescheduling', 'outcome', 'manual']);

export const CATEGORY_TO_TYPE = {
  callback:     'Callback',
  appointment:  'Appointment',
  rescheduling: 'Reschedule',
  outcome:      'Outcome',
  manual:       'Manual',
};

export const TYPE_TO_CATEGORY = {
  Callback:    'callback',
  Appointment: 'appointment',
  Reschedule:  'rescheduling',
  Outcome:     'outcome',
  Manual:      'manual',
  // Reminder has no frontend category yet (no UI creates or filters on it) —
  // included so a future Reminder-type task still round-trips sensibly
  // instead of falling through to `?? 'manual'` at the call site.
  Reminder:    'reminder',
};

// POST /api/tasks — manual creation only (NewTaskModal). Always ends up
// with entityType/entityId = NULL server-side (see taskService.createTask)
// — there is no entity-linking UI here, unlike the five system-generated
// trigger rules, which always populate a real entity.
export const CreateTaskSchema = z.object({
  title:        z.string().min(1).max(300),
  detail:       z.string().max(1000).optional(),
  category:     TaskCategory.default('manual'),
  priority:     z.enum(['High', 'Medium', 'Low']).default('Medium'),
  assignedToId: z.string().uuid(),
  dueDate:      z.string().optional(), // date-only (YYYY-MM-DD); dueAt is TIMESTAMPTZ
});

// PATCH /api/tasks/:id. isComplete is reachable by anyone who can see the
// task (the assignee themselves, or their Supervisor/Admin); every other
// field is Admin/Supervisor/GlobalAdmin-only (edit/reassign) — enforced in
// the handler, not here, since that split depends on the caller's role.
export const UpdateTaskSchema = z.object({
  isComplete:   z.boolean().optional(),
  assignedToId: z.string().uuid().optional(),
  title:        z.string().min(1).max(300).optional(),
  detail:       z.string().max(1000).optional().nullable(),
  priority:     z.enum(['High', 'Medium', 'Low']).optional(),
  dueDate:      z.string().optional().nullable(),
});

// GET /api/tasks — deliberately minimal. Role-scoping (self / direct
// reports / everyone) is mandatory and handled in the handler, not a query
// param — a user can never opt out of their own scoping. assignedToId here
// is a convenience filter on TOP of that scoping, for Admin/Supervisor's
// "Assignee" dropdown; category/status/search stay client-side exactly as
// they already were against MOCK_TASKS, since a user's task list is
// personal-scale (dozens, not the thousands Leads/Appointments can reach),
// so there's no pagination need driving a heavier server-side filter set.
export const TaskListQuerySchema = z.object({
  assignedToId: z.string().uuid().optional(),
});

// POST /api/tasks/:id/comments — §71. No edit/delete schema at all;
// comments are a discussion record, not a document — matches the same
// philosophy AuditLog already follows for the same reason.
export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});
