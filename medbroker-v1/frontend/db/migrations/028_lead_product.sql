-- Migration 028 — LeadProduct junction table
-- 14 Aug 2026 (§157/§158) — Products on Lead, Mark's decision:
-- "Mandatory, manual form only". Mirrors LeadPortfolio (migration for
-- that table applied earlier, see schema.postgres.sql) exactly — same
-- shape, same reasoning (a Lead can declare interest in more than one
-- product, same as it already can for more than one portfolio).
--
-- No backfill needed: this is a new, additive capability, not a
-- restructuring of existing data. Every Lead created before this
-- migration simply has zero rows here (equivalent to "no products
-- captured yet"), which is already how the feature is designed to
-- degrade — LeadDetail.jsx shows '—' the same way it already does for
-- an empty Portfolio list.

CREATE TABLE IF NOT EXISTS LeadProduct (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    leadId      UUID            NOT NULL,
    productId   UUID            NOT NULL,
    createdAt   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_LeadProduct         PRIMARY KEY (id),
    CONSTRAINT FK_LeadProduct_Lead    FOREIGN KEY (leadId)    REFERENCES Lead(id),
    CONSTRAINT FK_LeadProduct_Product FOREIGN KEY (productId) REFERENCES Product(id),
    CONSTRAINT UQ_LeadProduct         UNIQUE (leadId, productId)
);
