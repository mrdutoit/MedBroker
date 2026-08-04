-- 021_add_kms_encryption_flag.sql
-- §112 — new flag controlling whether encrypt() (services/encryption.js)
-- uses AWS KMS ('kms1' format) or the local DEMO_ENCRYPTION_KEY scheme
-- ('demo1' format) for NEW Lead.idNumber values. Off by default so the
-- app keeps working with zero AWS setup — see encryption.js's header
-- comment for the full design and the required env vars before turning
-- this on. decrypt() always reads both formats regardless of this
-- flag's value, so flipping it never breaks reading anything already
-- encrypted under the other scheme.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

INSERT INTO FeatureFlag (flagKey, label, description, valueType, value, allowedValues, tier, requiresRestart, isPhase2)
VALUES (
    'security.kmsEncryption.enabled', 'AWS KMS-backed field encryption',
    'When on, new Lead.idNumber values are encrypted using AWS KMS (kms1 format) instead of the local DEMO_ENCRYPTION_KEY (demo1 format). Off by default so the app works with zero AWS setup -- turn on only after KMS_MASTER_KEY_ID, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are all set and verified, since encrypt() does not silently fall back if this is on but AWS is not actually configured. Values already encrypted under either format stay readable regardless of this flag''s current value.',
    'boolean', '0', NULL, 'Core', FALSE, FALSE
)
ON CONFLICT (flagKey) DO NOTHING;
