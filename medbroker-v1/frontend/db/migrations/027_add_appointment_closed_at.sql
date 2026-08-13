-- 027_add_appointment_closed_at.sql
-- §148 (13 Aug 2026) — Mark's testing surfaced that Reports' Closed
-- Won/Lost reporting was scoped by Lead.createdAt (a lead created in
-- July but only closed in August was reported against July). Doing this
-- properly needs a real, dedicated close-date column rather than leaning
-- on updatedAt (a general last-modified timestamp that drifts on any
-- later edit to a closed appointment's row, silently corrupting
-- historical reporting).
--
-- One additive column, nullable, no data loss risk. Set going forward at
-- the exact moment an appointment's status transitions to ClosedWon,
-- ClosedLost, or ReturnedToLeads (appointmentStatusService.js) — same
-- pattern as claimedAt just below it in the table.
--
-- BACKFILL, Mark's explicit choice: best-effort from each row's own
-- updatedAt, imprecise (updatedAt could reflect a later, unrelated edit,
-- not the actual close moment) but better than leaving every
-- already-closed appointment unattributed to any period at all under
-- the new reporting. Only applied to rows already in a closed state —
-- anything still open stays NULL, exactly as a never-closed appointment
-- should.

ALTER TABLE Appointment ADD COLUMN IF NOT EXISTS closedAt TIMESTAMPTZ NULL;

UPDATE Appointment
SET closedAt = updatedAt
WHERE status IN ('ClosedWon', 'ClosedLost', 'ReturnedToLeads')
  AND closedAt IS NULL;
