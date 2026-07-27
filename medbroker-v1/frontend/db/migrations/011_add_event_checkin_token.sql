-- 011_add_event_checkin_token.sql
-- Separate attendance-confirmation token from the registration/RSVP token
-- (24 Jul 2026, Mark's explicit requirement). qrToken is shared before the
-- event (WhatsApp/email, printed collateral) for registration — if
-- attendance confirmation used that SAME token, anyone who ever received
-- the share link could "check in" from anywhere with no proof they were
-- at the venue. checkinToken is display/print only on the staff side,
-- never shared via a link.
--
-- gen_random_uuid() is volatile, so this ALTER computes a genuine unique
-- value per existing row (a full table rewrite, trivial at this table's
-- size) rather than storing one shared default.
--
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database.

ALTER TABLE Event ADD COLUMN IF NOT EXISTS checkinToken UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE Event ADD CONSTRAINT UQ_Event_CheckinToken UNIQUE (checkinToken);
