-- 013_add_task_priority_and_manual_type.sql
-- Task backend build (§56). Two gaps found in the original schema once
-- Tasks.jsx's own spec was read closely:
--   1. priority (High/Medium/Low) is used throughout the UI and the
--      MOCK_TASKS shape, but was never a column on Task at all.
--   2. Task.entityType/entityId are NOT NULL, and Task.type's CHECK
--      constraint only allows the five system-generated values (Callback,
--      Appointment, Reschedule, Reminder, Outcome) — meaning a manually
--      created task (NewTaskModal's default category, no linked Lead or
--      Appointment) could never actually be inserted under the original
--      schema. Adds 'Manual' as a sixth type value and makes entityType/
--      entityId nullable — always populated for the five system-generated
--      trigger rules, always NULL for anything created via POST /api/tasks.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

ALTER TABLE Task ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'Medium';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_task_priority') THEN
        ALTER TABLE Task ADD CONSTRAINT CK_Task_Priority CHECK (priority IN ('High', 'Medium', 'Low'));
    END IF;
END $$;

ALTER TABLE Task ALTER COLUMN entityType DROP NOT NULL;
ALTER TABLE Task ALTER COLUMN entityId DROP NOT NULL;

ALTER TABLE Task DROP CONSTRAINT IF EXISTS ck_task_type;
ALTER TABLE Task ADD CONSTRAINT CK_Task_Type
    CHECK (type IN ('Callback', 'Appointment', 'Reschedule', 'Reminder', 'Outcome', 'Manual'));
