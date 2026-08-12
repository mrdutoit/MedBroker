-- 024_add_task_call_resolution_link.sql
-- §138 (12 Aug 2026) — Callback task auto-completion.
--
-- One additive column, no data loss risk on an existing database.
--
-- Task.resolvedByCallAttemptId — nullable FK to CallAttempt. Set when a
-- Callback-type task is auto-completed as a side effect of a new call
-- attempt being logged against the same lead (leadService.logCallAttempt,
-- taskService.completeOpenCallbackTasksForLead) — Mark's explicit design:
-- ANY call logged against the lead closes an open Callback task,
-- regardless of outcome, and the closing call's own detail should be
-- visible against the completed task.
--
-- Deliberately a LINK, not a copied/duplicated text snapshot: the
-- completed task's display pulls the closing call's outcome/notes/
-- callTime live from CallAttempt via this FK, rather than copying that
-- text at the moment of completion. A later correction to the call log's
-- own notes (if ever allowed) would then be reflected automatically,
-- not leave the Task showing stale text. Task.detail is untouched and
-- keeps meaning what it already meant — the ORIGINAL request's context
-- (e.g. "call back after 5pm"), set once at creation.
--
-- NULL for every existing Task row and for every Task that isn't a
-- Callback closed this way (manual tasks, Assign-broker tasks, and any
-- Callback task completed before this migration ran).
--
-- ON DELETE SET NULL, not CASCADE: if a CallAttempt row is ever deleted
-- (no code path does this today, but nothing guarantees one never will),
-- the Task itself — a real, already-completed record — shouldn't vanish
-- along with it. It just loses the "closed by this call" detail link and
-- falls back to showing only its original Task.detail.

ALTER TABLE Task ADD COLUMN IF NOT EXISTS resolvedByCallAttemptId UUID NULL;

ALTER TABLE Task DROP CONSTRAINT IF EXISTS FK_Task_ResolvedByCallAttempt;
ALTER TABLE Task ADD CONSTRAINT FK_Task_ResolvedByCallAttempt
    FOREIGN KEY (resolvedByCallAttemptId) REFERENCES CallAttempt(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IX_Task_ResolvedByCallAttempt ON Task (resolvedByCallAttemptId) WHERE resolvedByCallAttemptId IS NOT NULL;
