-- 004_add_lead_portfolio.sql
-- Adds optional portfolio capture on Lead (23 Jul 2026, Mark's request).
-- Previously portfolio only existed on Appointment (portfolioId NOT NULL,
-- resolved from CreateAppointmentSchema at booking time). LeadDetail.jsx's
-- "Portfolio" field in the Lead Detail card has existed since the page was
-- built but always rendered '—' — the column never existed on Lead at all,
-- not just an unwired display.
--
-- Nullable by design: a Lead can exist for months before anyone knows which
-- portfolio it belongs to (that's still the common case — CSV imports,
-- early-stage leads). When it IS captured on the Lead, Book Appointment
-- pre-fills from it but the booker can still change it.
--
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database. See Status.md's
-- MIGRATIONS PENDING note; also worth checking whether 002/003 (referenced
-- there) ever actually landed, since no db/migrations/ directory existed in
-- the repo before this file.

ALTER TABLE Lead ADD COLUMN IF NOT EXISTS portfolioId UUID NULL;

ALTER TABLE Lead
  ADD CONSTRAINT FK_Lead_Portfolio FOREIGN KEY (portfolioId) REFERENCES Portfolio(id);
