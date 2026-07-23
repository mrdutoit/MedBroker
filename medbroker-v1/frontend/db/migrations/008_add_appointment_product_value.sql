-- 008_add_appointment_product_value.sql
-- Adds per-product policy value tracking (23 Jul 2026, Mark's request —
-- see Status.md §44). Previously no monetary field existed anywhere in
-- the schema — Reports.jsx and BrokerDetail.jsx both dropped their
-- Policy Value KPIs during the §42/§43 real-data rebuild for exactly that
-- reason, flagged clearly at the time rather than inventing the feature
-- unprompted. Mark has now asked for it directly: track a value against
-- each item/product sold, not just a single lump sum per appointment, so
-- it can be reported on properly (which product families are actually
-- driving value, not just deal count).
--
-- Nullable — a broker recording an outcome without the exact figure to
-- hand yet shouldn't be blocked from saving. Reports/KPIs that sum this
-- column already treat NULL as 0 via COALESCE, not as an error.
--
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database.

ALTER TABLE AppointmentProduct ADD COLUMN IF NOT EXISTS policyValue NUMERIC(12,2) NULL;
