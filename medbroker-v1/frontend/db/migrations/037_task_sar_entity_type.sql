-- Migration 037 — §12b (21 Aug 2026), Mark's explicit request: an
-- SAR request now auto-creates a linked, redirect-only Task (mirroring
-- how Callback/Assign-broker tasks already work), completed only when
-- the request reaches Fulfilled or Rejected, never by a direct checkbox
-- tick. Found NEEDED, not assumed, while verifying the new code against
-- a real Postgres instance — CK_Task_EntityType and CK_Task_Type both
-- predate this feature and don't yet allow the new values; the INSERT
-- this feature relies on would fail without this migration, caught
-- before delivery rather than after.
--
-- Idempotent: guards on whether the constraint already permits the new
-- value before dropping/recreating it — same lowercase-comparison
-- caution established after migration 035's case-folding bug (Postgres
-- stores constraint definitions verbatim but this guard compares the
-- actual allowed-values text, not a constraint NAME, so that specific
-- historical footgun doesn't apply here — still checked defensively).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_task_entitytype'
      AND pg_get_constraintdef(oid) ILIKE '%SubjectAccessRequest%'
  ) THEN
    ALTER TABLE Task DROP CONSTRAINT IF EXISTS CK_Task_EntityType;
    ALTER TABLE Task ADD CONSTRAINT CK_Task_EntityType
      CHECK (entityType IN ('Lead', 'Appointment', 'SubjectAccessRequest'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_task_type'
      AND pg_get_constraintdef(oid) ILIKE '%Sar%'
  ) THEN
    ALTER TABLE Task DROP CONSTRAINT IF EXISTS CK_Task_Type;
    ALTER TABLE Task ADD CONSTRAINT CK_Task_Type
      CHECK (type IN ('Callback', 'Appointment', 'Reschedule', 'Reminder', 'Outcome', 'Manual', 'Sar'));
  END IF;
END $$;
