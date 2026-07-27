-- 010_add_lead_portal_account.sql
-- Lead Portal — self-service prospect identity (24 Jul 2026). Deliberately
-- NOT an extension of "User" (staff roles) — a prospect's account has a
-- completely different security posture, own JWT signing secret (see
-- api-lib/config.js portalAuth), so a portal token can never be replayed
-- against a staff route or vice versa. passwordMustChange/rotation
-- deliberately omitted — that's a staff policy concern, not applicable
-- to a prospect's own account.
--
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database.

CREATE TABLE IF NOT EXISTS LeadPortalAccount (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId      UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    leadId              UUID            NOT NULL,
    email               VARCHAR(255)    NOT NULL,
    passwordHash        TEXT            NOT NULL,
    passwordSetAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    failedLoginAttempts INT             NOT NULL DEFAULT 0,
    isLocked            BOOLEAN         NOT NULL DEFAULT FALSE,
    createdAt           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deletedAt           TIMESTAMPTZ     NULL,
    CONSTRAINT PK_LeadPortalAccount       PRIMARY KEY (id),
    CONSTRAINT FK_LeadPortalAccount_Org   FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_LeadPortalAccount_Lead  FOREIGN KEY (leadId) REFERENCES Lead(id),
    CONSTRAINT UQ_LeadPortalAccount_Lead  UNIQUE (leadId),
    CONSTRAINT UQ_LeadPortalAccount_Email UNIQUE (email)
);
