-- Migration 030 — Appointment.lostReason
-- 14 Aug 2026 (§163) — Mark's explicit request, after §156's Reports
-- rebuild brief flagged this couldn't be built (Won vs Lost's loss-
-- reason breakdown) without the field existing first. Nullable — only
-- meaningful once status = 'ClosedLost'; captured in the same outcome-
-- save flow as customerSigned = false, not a separate action.
--
-- Category set is Claude's own design choice (six fixed categories, not
-- free text, not an exhaustive taxonomy) — easy to adjust or extend if
-- these don't match how the business actually talks about lost deals.
-- No backfill: every appointment closed before this migration simply has
-- NULL here, which the reporting layer already treats as "not captured"
-- rather than a missing/broken value.

ALTER TABLE Appointment
    ADD COLUMN IF NOT EXISTS lostReason VARCHAR(50) NULL;

ALTER TABLE Appointment
    ADD CONSTRAINT CK_Appointment_LostReason CHECK (lostReason IS NULL OR lostReason IN (
        'PriceTooHigh', 'ChoseCompetitor', 'NoLongerInterested', 'Uncontactable', 'NotEligible', 'Other'
    ));
