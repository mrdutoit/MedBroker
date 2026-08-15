-- Migration 032 — region on Lead and Appointment
-- 14 Aug 2026 (§166) — Mark's explicit request, found while testing
-- §165's BrokerRegion fix: "a Lead and an Appointment both need to
-- relate to a region, and a Lead should not be assignable to someone
-- that is out of that region."
--
-- Both nullable, no backfill — inferring an existing lead's true region
-- from its current agent's own region would be a guess dressed up as
-- data, same reasoning applied to every other "don't invent a field
-- with no home" decision this session. Mandatory going forward only, on
-- the manual Create Lead form specifically (leadSource === 'ManualEntry'),
-- same split Portfolio/Products already use.

ALTER TABLE Lead
    ADD COLUMN IF NOT EXISTS region VARCHAR(50) NULL;

ALTER TABLE Appointment
    ADD COLUMN IF NOT EXISTS region VARCHAR(50) NULL;
