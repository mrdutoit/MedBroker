-- 30 Sep 2026 — Replace full UNIQUE(eventId, leadId) with partial index excluding soft-deleted rows.
-- Soft-deleted attendees can now be re-added without 23505 violation.
-- Idempotent: DROP IF EXISTS + CREATE IF NOT EXISTS; run by hand against Neon.
ALTER TABLE EventAttendee DROP CONSTRAINT IF EXISTS UQ_EventAttendee;
CREATE UNIQUE INDEX IF NOT EXISTS UQ_EventAttendee_active ON EventAttendee(eventId, leadId) WHERE deletedAt IS NULL;
