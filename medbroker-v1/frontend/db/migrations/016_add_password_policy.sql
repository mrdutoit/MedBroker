-- 016_add_password_policy.sql
-- Password policy overhaul (§72). passwordRotationDays and
-- passwordLockoutAttempts already existed (v2.5) and are already
-- enforced at login — this migration adds the piece that didn't exist
-- at all: reuse prevention ("unique passwords in a calendar year", Mark's
-- own phrasing) and the history table needed to check it.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

ALTER TABLE SystemConfig ADD COLUMN IF NOT EXISTS passwordPreventReuse BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS PasswordHistory (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    organisationId UUID        NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    userId         UUID        NOT NULL,
    passwordHash   TEXT        NOT NULL,
    createdAt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_PasswordHistory     PRIMARY KEY (id),
    CONSTRAINT FK_PasswordHistory_Org  FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    -- ON DELETE CASCADE — if a User is ever hard-deleted (never happens
    -- today, Users are soft-deleted like everything else, but this is
    -- the safe default regardless), their password history isn't left
    -- as an orphaned, undeletable reference.
    CONSTRAINT FK_PasswordHistory_User FOREIGN KEY (userId) REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_PasswordHistory_User ON PasswordHistory (userId, createdAt);
