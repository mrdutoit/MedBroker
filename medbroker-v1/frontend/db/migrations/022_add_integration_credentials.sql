-- 022_add_integration_credentials.sql
-- §134 (6 Aug 2026) — Stripe checkout/webhook + Integrations settings page
-- (Stripe + SMTP credentials).
--
-- Two changes, both additive, no data loss risk on an existing database:
--
-- 1. IntegrationCredential — new table. One row per (organisationId,
--    provider), provider IN ('stripe','smtp'), the whole per-provider
--    config JSON-encoded and encrypted as a single opaque blob via
--    encryption.js's existing envelope encryption (same encrypt()/decrypt()
--    pair Lead.idNumber already uses). Empty on a fresh migration — nothing
--    is configured until a GlobalAdmin fills in the Integrations page.
--
-- 2. TokenTransaction.externalRef — new nullable column + partial unique
--    index. Used ONLY for Stripe-webhook-originated credits, to make
--    Stripe's documented at-least-once webhook redelivery idempotent at
--    the database level (a duplicate INSERT hits the unique index and is
--    caught as a no-op, not a double-credit). NULL for every existing row
--    and every non-Stripe transaction type going forward — this migration
--    does not touch any existing TokenTransaction data.
--
-- Safe to run against a live database with existing TokenLedger/
-- TokenTransaction rows — ADD COLUMN ... NULL is a metadata-only change on
-- Postgres (no table rewrite, no lock beyond the brief one already implied
-- by any DDL statement).

CREATE TABLE IF NOT EXISTS IntegrationCredential (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    provider        VARCHAR(20)     NOT NULL,
    encryptedConfig TEXT            NOT NULL,
    updatedAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedById     UUID            NULL,
    CONSTRAINT PK_IntegrationCredential          PRIMARY KEY (id),
    CONSTRAINT FK_IntegrationCredential_Org      FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_IntegrationCredential_UpdBy    FOREIGN KEY (updatedById)    REFERENCES "User"(id),
    CONSTRAINT CK_IntegrationCredential_Provider CHECK (provider IN ('stripe', 'smtp')),
    CONSTRAINT UQ_IntegrationCredential_OrgProv  UNIQUE (organisationId, provider)
);

ALTER TABLE TokenTransaction ADD COLUMN IF NOT EXISTS externalRef VARCHAR(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS UQ_TokenTransaction_ExternalRef
    ON TokenTransaction (externalRef) WHERE externalRef IS NOT NULL;
