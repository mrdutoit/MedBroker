-- Migration 036 — field-level encryption for medical/insurance Lead
-- fields (F1, security audit, 20 Aug 2026).
--
-- Extends the same envelope-encryption scheme idNumber already uses
-- (encryption.js's encrypt()/decrypt(), KMS- or DEMO_ENCRYPTION_KEY-
-- wrapped depending on security.kmsEncryption.enabled) to five more
-- Lead fields: medicalAid, medicalAidProvider, existingCover,
-- currentInsurer, policies — the fields closest to POPIA s26 special
-- personal information, per Project_Context_Vercel.md §12a Gap 2 and
-- MedBroker_Security_Code_Review_Findings.docx finding F1/E4.
--
-- The two boolean fields (medicalAid, existingCover) are stored
-- encrypted as TEXT ('true'/'false' before encryption) — same "envelope
-- around a string" approach idNumber uses; there is no encrypted-
-- boolean column type. leadService.js converts back to a real boolean
-- on decrypt.
--
-- OLD PLAINTEXT COLUMNS ARE DELIBERATELY KEPT, NOT DROPPED, IN THIS
-- MIGRATION — same "column kept in place, unused by app logic going
-- forward" pattern already used elsewhere in this schema (Lead.
-- portfolioId, User.portfolioId). Dropping them is a separate, later,
-- deliberate decision once Mark has confirmed the encrypted columns are
-- working correctly in his own testing — mirrors exactly how
-- security.kmsEncryption.enabled stays off until AWS is verified ready,
-- not flipped automatically. scripts/backfill-encrypt-lead-fields.js
-- (same delivery) migrates any existing plaintext values into the new
-- encrypted columns and nulls the old ones per row — run once, after
-- this migration, before relying on the new columns for existing data.
--
-- Idempotent, matches every other migration in this project.

ALTER TABLE Lead
    ADD COLUMN IF NOT EXISTS medicalAidEncrypted         TEXT NULL,
    ADD COLUMN IF NOT EXISTS medicalAidProviderEncrypted TEXT NULL,
    ADD COLUMN IF NOT EXISTS existingCoverEncrypted       TEXT NULL,
    ADD COLUMN IF NOT EXISTS currentInsurerEncrypted      TEXT NULL,
    ADD COLUMN IF NOT EXISTS policiesEncrypted             TEXT NULL;
