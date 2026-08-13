-- 025_add_default_claim_token_cost.sql
-- §140c (12 Aug 2026) — flat org-wide claim token cost.
--
-- Root cause this closes: Appointment.claimTokenCost has always existed
-- (migration/schema from §117) but nothing anywhere ever set it to a
-- nonzero value — the booking form never sent one, so every appointment
-- has been claimable for 0 tokens since the claim model was built. Mark's
-- explicit choice: a single flat org-wide cost, not per-portfolio or
-- agent-set-per-booking.
--
-- One additive column, safe default (1), no data loss risk on an
-- existing database.

ALTER TABLE SystemConfig ADD COLUMN IF NOT EXISTS defaultClaimTokenCost INT NOT NULL DEFAULT 1;

ALTER TABLE SystemConfig DROP CONSTRAINT IF EXISTS CK_SystemConfig_ClaimCost;
ALTER TABLE SystemConfig ADD CONSTRAINT CK_SystemConfig_ClaimCost CHECK (defaultClaimTokenCost >= 0);
