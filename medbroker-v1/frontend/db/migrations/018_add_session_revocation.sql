-- 018_add_session_revocation.sql
-- §97 — session token revocation. A JWT is stateless by design (no DB
-- lookup needed to verify it), but that means there was previously no
-- way to invalidate one before its natural 8-hour expiry — not on a
-- password change, and not via any admin action short of fully
-- deactivating the account. This adds a single timestamp: any token
-- issued (iat) BEFORE sessionsRevokedAt is rejected on its next use,
-- checked as part of the SAME per-request user lookup validateToken()
-- already does for the isActive/isLocked check — no new query, no
-- token-blacklist table that would grow unboundedly and need cleanup.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS sessionsRevokedAt TIMESTAMPTZ NULL;
