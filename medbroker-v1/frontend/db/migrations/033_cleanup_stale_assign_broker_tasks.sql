-- Migration 033 — one-time cleanup: complete (not delete) Assign-broker
-- tasks left stuck open by the bug §168 fixed.
--
-- Mark's explicit request: "won't break the data that is there now and
-- will still allow me to have those records as dummy data" — this
-- marks the affected tasks COMPLETE, it does not delete them. They
-- stay visible via the Tasks page's own "Show completed" toggle and
-- still count toward the Completed total; they just stop showing as
-- stuck open forever. Nothing about any Lead, Appointment, or any
-- other table is touched — Task is the only table this script writes to.
--
-- Matches exactly: type = 'Appointment' AND entityType = 'Appointment'.
-- Confirmed directly against the code (appointmentService.js, the
-- createAppointment() Assign-broker trigger) that this combination is
-- the ONLY place anything in this codebase creates a type='Appointment'
-- task — a plain grep across every createTask() call site confirms it,
-- not assumed. No title-text matching needed to isolate these safely.
--
-- Only touches a task if its own Appointment ALREADY has a broker
-- (brokerId IS NOT NULL) — i.e., only genuinely orphaned tasks whose
-- one job the appointment has already outgrown. A task belonging to an
-- appointment that's still genuinely unassigned is left completely
-- alone — it isn't stale, it's still doing its job, and this script
-- must not complete it just because it happens to match on type/entityType.
--
-- Safe to run more than once — the isComplete = FALSE condition means a
-- second run simply matches zero rows the second time.
--
-- Want to see exactly what this will touch before running it? Run this
-- first (read-only, changes nothing):
--
--   SELECT t.id, t.title, t.createdAt, a.brokerId
--   FROM Task t JOIN Appointment a ON a.id = t.entityId
--   WHERE t.type = 'Appointment' AND t.entityType = 'Appointment'
--     AND t.isComplete = FALSE AND a.brokerId IS NOT NULL;

UPDATE Task
SET isComplete = TRUE, completedAt = NOW(), updatedAt = NOW()
WHERE type = 'Appointment'
  AND entityType = 'Appointment'
  AND isComplete = FALSE
  AND entityId IN (
    SELECT id FROM Appointment WHERE brokerId IS NOT NULL
  );
