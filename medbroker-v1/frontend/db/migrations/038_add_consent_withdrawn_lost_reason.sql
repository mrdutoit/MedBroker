-- Migration 038 — 24 Aug 2026
-- Adds 'ConsentWithdrawn' to Appointment.lostReason's CHECK constraint —
-- a NEW, distinct category, not a reuse of any of the existing six. Written
-- ONLY by appointmentService.closeOpenAppointmentsForErasure(), called from
-- sarService.executeSarDeletion() (both the Erased and Restricted
-- outcomes) — never selectable from any user-facing "Reason for loss"
-- dropdown. See closeOpenAppointmentsForErasure()'s own header comment for
-- the full reasoning, including Mark's explicit 24 Aug 2026 decision that
-- these DO count as genuine Lost appointments in every Reports query
-- (win rate, conversion, Loss Reason breakdown) — no query-level exclusion
-- added anywhere; the distinct reason value exists purely so the Loss
-- Reason breakdown can show "Consent withdrawn (POPIA)" as its own line
-- rather than silently blending into 'Other' or a real sales-loss category.
--
-- DROP CONSTRAINT IF EXISTS + a plain re-ADD, deliberately, rather than a
-- SELECT-from-pg_constraint existence guard — migration 035's own guard
-- (see Status_Vercel.md, 21 Aug 2026) compared pg_constraint.conname
-- against the CamelCase spelling used in its ADD CONSTRAINT statement;
-- Postgres folds unquoted identifiers to lowercase on storage, so that
-- comparison never matched and the guard was silently a no-op. This
-- shape sidesteps the whole class of bug — DROP CONSTRAINT IF EXISTS
-- doesn't need to know or compare the stored spelling, and ADD CONSTRAINT
-- is a plain, unconditional re-add — safe to run more than once by
-- construction, not by a check that could itself be wrong. Verified by
-- actually running this migration twice in a row against a real local
-- Postgres 16 instance loaded from the current schema.postgres.sql, not
-- assumed from reading the SQL — same standing rule this codebase already
-- holds itself to for every raw-SQL migration.

ALTER TABLE Appointment DROP CONSTRAINT IF EXISTS ck_appointment_lostreason;

ALTER TABLE Appointment ADD CONSTRAINT CK_Appointment_LostReason CHECK (lostReason IS NULL OR lostReason IN (
    'PriceTooHigh', 'ChoseCompetitor', 'NoLongerInterested', 'Uncontactable', 'NotEligible', 'Other',
    'ConsentWithdrawn'
));
