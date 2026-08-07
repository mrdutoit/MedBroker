-- 023_add_paystack_provider.sql
-- §135 (7 Aug 2026) — Paystack as a second appointments.tokens.paymentProvider
-- option, alongside Stripe. Added because Stripe does not support South
-- Africa at all as a merchant country — Paystack (Stripe-owned) does,
-- natively in ZAR.
--
-- Two changes, both additive/non-destructive:
--
-- 1. IntegrationCredential.provider's CHECK constraint widened to allow
--    'paystack' — Postgres has no ALTER CHECK, so this is a DROP + ADD.
--    No existing rows are affected (nothing currently has
--    provider = 'paystack', and the constraint only restricts INSERTs
--    going forward).
--
-- 2. The appointments.tokens.paymentProvider FeatureFlag's allowedValues
--    column widened from 'none,stripe' to 'none,stripe,paystack' — this
--    is a plain UPDATE, not something feature-flags.postgres.sql's own
--    re-run would pick up (that file's seed INSERT is
--    ON CONFLICT (flagKey) DO NOTHING, so re-running it against an
--    already-seeded database is a no-op for this row). The flag's
--    current VALUE is untouched — still whatever Mark has it set to
--    today ('none' unless already changed).
--
-- Safe to run against a live database with existing IntegrationCredential
-- rows and an existing paymentProvider flag row.

ALTER TABLE IntegrationCredential DROP CONSTRAINT IF EXISTS CK_IntegrationCredential_Provider;
ALTER TABLE IntegrationCredential ADD CONSTRAINT CK_IntegrationCredential_Provider
    CHECK (provider IN ('stripe', 'smtp', 'paystack'));

UPDATE FeatureFlag
SET allowedValues = 'none,stripe,paystack',
    description = 'Payment gateway for broker token top-ups. none = manual top-up by admin only. stripe = brokers can self-purchase tokens via Stripe Checkout (not usable in South Africa — Stripe does not support ZA merchants). paystack = brokers can self-purchase tokens via Paystack (Stripe-owned, ZAR-native, South Africa-supported — added §135, 7 Aug 2026). Only relevant when appointments.claimModel = claim.'
WHERE flagKey = 'appointments.tokens.paymentProvider';
