-- 020_correct_popia_sar_flag_tier.sql
-- §109 — the popia.subjectAccessRequest.enabled flag now actually gates
-- the Data Requests feature (AppAdmin.jsx) for the first time. Before
-- this delivery it was live and unconditionally visible to Admin/
-- GlobalAdmin regardless of this flag's value or its own stale
-- 'Phase2'/isPhase2=TRUE metadata (§103's finding — dead metadata, not a
-- real gate). Reclassified to Operational, matching every other built-
-- and-gated admin capability in this table.
--
-- This only corrects Mark's already-live database — a brand-new install
-- gets this right immediately from feature-flags.postgres.sql's own
-- INSERT, which was updated in the same delivery. Run this against Neon
-- like every other migration in this list. Safe to re-run.

UPDATE FeatureFlag
SET    tier     = 'Operational',
       isPhase2 = FALSE
WHERE  flagKey  = 'popia.subjectAccessRequest.enabled'
  AND  (tier != 'Operational' OR isPhase2 != FALSE);
