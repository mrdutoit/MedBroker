-- Migration 035 — POPIA erasure / FAIS restrict-and-retain (20 Aug 2026)
--
-- Backs the new SAR "Deletion" request type: executing one either
-- anonymises a Lead immediately (no live FAIS record-keeping obligation)
-- or restricts it — locks it out of active processing but keeps the raw
-- data intact until the FAIS five-year window (from the last ClosedWon/
-- ClosedLost Appointment) actually lapses. See Project_Context_Vercel.md
-- §12a for the full compliance reasoning and leadService.js's
-- eraseLeadPII()/restrictLead()/getLeadRetentionPosition() for the
-- implementation.
--
-- Idempotent, matches every other migration in this project — safe to
-- run more than once.

ALTER TABLE SubjectAccessRequest
    ADD COLUMN IF NOT EXISTS requestType VARCHAR(20) NOT NULL DEFAULT 'Access';

DO $$
BEGIN
    -- Postgres folds unquoted identifiers to lowercase, so the stored
    -- conname is 'ck_subjectaccessrequest_requesttype', not the CamelCase
    -- spelling used in the ADD CONSTRAINT statement below — caught by
    -- actually running this against a real Postgres instance a second
    -- time (this project's own standing verification rule paying off
    -- directly): the mixed-case comparison never matched, so the guard
    -- was a no-op and the second run failed on a duplicate constraint.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_subjectaccessrequest_requesttype'
    ) THEN
        ALTER TABLE SubjectAccessRequest
            ADD CONSTRAINT CK_SubjectAccessRequest_RequestType
            CHECK (requestType IN ('Access', 'Deletion'));
    END IF;
END $$;

ALTER TABLE Lead
    ADD COLUMN IF NOT EXISTS erasedAt          TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS restrictedAt       TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS retentionExpiresAt TIMESTAMPTZ NULL;

-- Supports the (currently manual, Phase 2 = scheduled) query "which
-- restricted Leads have crossed their retention window and are now
-- eligible for erasure" — see the follow-up item logged in
-- Status_Vercel.md (the auto-purge cron is explicitly NOT built this
-- session, only the manual SAR-triggered path is).
CREATE INDEX IF NOT EXISTS IX_Lead_RetentionExpiry
    ON Lead (retentionExpiresAt)
    WHERE restrictedAt IS NOT NULL AND erasedAt IS NULL;
