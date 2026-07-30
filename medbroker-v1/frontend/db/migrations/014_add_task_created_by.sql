-- 014_add_task_created_by.sql
-- Task backend (§56-58) tracked assignedToId (who a task is FOR) but had
-- no way to know who CREATED it — Mark asked whether Tasks should show
-- "things I created" alongside "things assigned to me", and the honest
-- answer was the data to support that didn't exist. Adds createdById,
-- nullable — always populated for a manually created task (POST
-- /api/tasks), always NULL for the five system-generated trigger rules
-- (there's no human creator for those; "source" already distinguishes
-- system vs manual on the frontend, this is the same distinction at the
-- data layer).
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

ALTER TABLE Task ADD COLUMN IF NOT EXISTS createdById UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_task_createdby') THEN
        ALTER TABLE Task ADD CONSTRAINT FK_Task_CreatedBy FOREIGN KEY (createdById) REFERENCES "User"(id);
    END IF;
END $$;
