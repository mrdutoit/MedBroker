-- 006_add_appointment_returned_status.sql
-- Adds 'ReturnedToLeads' as a valid Appointment.status value (23 Jul 2026,
-- Mark's request — see Status.md §36).
--
-- Return to Leads previously DELETED the Appointment row (and its
-- AppointmentProduct rows) outright. Mark's point: that loses history that
-- matters for metrics — how many appointments get returned, by whom, why —
-- and the audit log entry the return handler already wrote became
-- practically unreachable once the row it referenced was gone. Now the
-- appointment is locked via this new status instead of deleted, same as
-- ClosedWon/ClosedLost lock it, but kept separate from those so win/loss
-- reporting isn't skewed by administrative returns.
--
-- Postgres CHECK constraints can't be altered in place — drop and recreate.
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database.

ALTER TABLE Appointment DROP CONSTRAINT IF EXISTS CK_Appointment_Status;

ALTER TABLE Appointment ADD CONSTRAINT CK_Appointment_Status
  CHECK (status IN ('Unassigned', 'Assigned', 'InProgress', 'ClosedWon', 'ClosedLost', 'Claimed', 'ReturnedToLeads'));
