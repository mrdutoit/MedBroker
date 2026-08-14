-- Migration 029 — SystemConfig.appointmentUnassignedWarningDays
-- 14 Aug 2026 (§160) — outstanding item 2: nothing currently surfaces a
-- claim-model or assign-model appointment as it approaches its own
-- appointment date with no broker attached yet. This column drives the
-- new daily scan (schedulerService.sendUnassignedAppointmentWarnings())
-- — how many days before firstAppointmentDate the warning fires.
--
-- Single scalar with a sensible default, applying uniformly to the
-- existing singleton SystemConfig row — no backfill mapping needed,
-- unlike the still-unbuilt Meeting redesign's migration.

ALTER TABLE SystemConfig
    ADD COLUMN IF NOT EXISTS appointmentUnassignedWarningDays INT NOT NULL DEFAULT 2;
