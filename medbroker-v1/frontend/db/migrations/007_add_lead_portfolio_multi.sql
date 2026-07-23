-- 007_add_lead_portfolio_multi.sql
-- Relaxes Lead's portfolio from a single value to many-to-many (23 Jul
-- 2026, Mark's request — see Status.md §41). A Lead can now be tagged
-- with more than one portfolio, mirroring UserPortfolio: a broker isn't
-- limited to selling from a single portfolio, and neither should a lead's
-- declared interest be.
--
-- Lead.portfolioId (added in migration 004) is now DEPRECATED — kept in
-- place, unused by app logic going forward, same treatment as the
-- existing vestigial User.portfolioId. Any single value already set there
-- is migrated into the new table below so nothing already captured is
-- lost.
--
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database.

CREATE TABLE IF NOT EXISTS LeadPortfolio (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    leadId      UUID            NOT NULL,
    portfolioId UUID            NOT NULL,
    createdAt   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_LeadPortfolio           PRIMARY KEY (id),
    CONSTRAINT FK_LeadPortfolio_Lead      FOREIGN KEY (leadId)      REFERENCES Lead(id),
    CONSTRAINT FK_LeadPortfolio_Portfolio FOREIGN KEY (portfolioId) REFERENCES Portfolio(id),
    CONSTRAINT UQ_LeadPortfolio           UNIQUE (leadId, portfolioId)
);

-- Carry forward any single portfolio already captured on a Lead before
-- this migration, so nothing already entered gets silently dropped.
INSERT INTO LeadPortfolio (leadId, portfolioId)
SELECT id, portfolioId FROM Lead
WHERE portfolioId IS NOT NULL
ON CONFLICT (leadId, portfolioId) DO NOTHING;
