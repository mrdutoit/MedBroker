-- =============================================================================
-- MedBroker — Feature Flags Migration
-- Run after schema v2.1 is deployed.
-- Safe to re-run — uses IF NOT EXISTS.
-- =============================================================================

-- =============================================================================
-- FeatureFlag table
-- One row per flag. Flags are fetched by the API on startup and cached in
-- memory (TTL 5 minutes). The admin UI reads and writes this table directly.
--
-- Flag key naming convention: 'domain.feature.aspect'
--   e.g. 'auth.sso.enabled', 'appointments.claimModel', 'tasks.enabled'
--
-- valueType controls how the UI renders the control:
--   'boolean' — toggle switch (value is '0' or '1')
--   'enum'    — dropdown (allowedValues is a comma-separated list)
--   'string'  — text input
--   'integer' — number input
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FeatureFlag')
CREATE TABLE FeatureFlag (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    -- Dotted key used in code: flag('auth.sso.enabled')
    flagKey         NVARCHAR(100)       NOT NULL,
    -- Human-readable label shown in the admin UI
    label           NVARCHAR(200)       NOT NULL,
    -- One-line explanation shown as a tooltip in the admin UI
    description     NVARCHAR(1000)      NULL,
    -- 'boolean' | 'enum' | 'string' | 'integer'
    valueType       NVARCHAR(20)        NOT NULL DEFAULT 'boolean',
    -- Current value stored as string; cast on read based on valueType
    value           NVARCHAR(500)       NOT NULL,
    -- For enum type: comma-separated list of valid values
    allowedValues   NVARCHAR(500)       NULL,
    -- Display grouping in the admin UI
    tier            NVARCHAR(50)        NOT NULL DEFAULT 'Operational',
    -- Marks flags that require a redeploy or service restart to take effect
    requiresRestart BIT                 NOT NULL DEFAULT 0,
    -- Marks Phase 2 flags — shown greyed out in UI until Phase 2 is live
    isPhase2        BIT                 NOT NULL DEFAULT 0,
    -- Audit
    updatedById     UNIQUEIDENTIFIER    NULL,
    updatedAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_FeatureFlag       PRIMARY KEY (id),
    CONSTRAINT UQ_FeatureFlag_Key   UNIQUE (flagKey),
    CONSTRAINT CK_FeatureFlag_Type  CHECK (valueType IN ('boolean', 'enum', 'string', 'integer')),
    CONSTRAINT CK_FeatureFlag_Tier  CHECK (tier IN ('Core', 'Operational', 'Phase2')),
    CONSTRAINT FK_FeatureFlag_User  FOREIGN KEY (updatedById) REFERENCES [User](id)
);

-- =============================================================================
-- Seed: default flag values
-- All MERGE statements are idempotent — safe to re-run.
-- =============================================================================

MERGE FeatureFlag AS target
USING (VALUES

    -- ── CORE flags ────────────────────────────────────────────────────────────
    -- SSO vs standalone user management
    ('auth.sso.enabled',
     'Single Sign-On',
     'Enable SSO via Microsoft 365 (Entra ID) or Google Workspace. When disabled, users log in with a standalone email and password managed within MedBroker.',
     'boolean', '0', NULL, 'Core', 0, 0),

    ('auth.sso.provider',
     'SSO Provider',
     'Which identity provider to use for SSO. Only applies when auth.sso.enabled is true.',
     'enum', 'none', 'none,microsoft,google', 'Core', 1, 0),

    -- Appointment workflow model
    -- Selecting 'claim' also activates the token economy — that is a feature of
    -- claim mode, not a separately configurable toggle. appointments.tokens.enabled
    -- has been removed; see DELETE statement below.
    ('appointments.claimModel',
     'Appointment workflow',
     'Assign: admin or supervisor assigns appointments to brokers. Claim: brokers self-select available appointments from a queue. Selecting Claim also activates the token economy (monthly free allocation + token top-ups).',
     'enum', 'assign', 'assign,claim', 'Core', 0, 0),

    ('appointments.tokens.paymentProvider',
     'Token payment provider',
     'Payment gateway for broker token top-ups. none = manual top-up by admin only. stripe = brokers can self-purchase tokens via Stripe Checkout. Only relevant when appointments.claimModel = claim.',
     'enum', 'none', 'none,stripe', 'Core', 0, 0),

    ('events.enabled',
     'Events module',
     'Show the Events section in the navigation. Disable for customers who do not run university or career fair events.',
     'boolean', '1', NULL, 'Core', 0, 0),

    ('leads.autoUnassign.enabled',
     'Lead auto-return',
     'Automatically return leads to the Unassigned queue after the configured inactivity period (set in System Config).',
     'boolean', '1', NULL, 'Core', 0, 0),

    -- ── OPERATIONAL flags ─────────────────────────────────────────────────────
    ('leads.importCsv.enabled',
     'CSV lead import',
     'Show the Historical CSV import tab on the Lead Import page.',
     'boolean', '1', NULL, 'Operational', 0, 0),

    ('leads.importSubscription.enabled',
     'Subscription lead import',
     'Show the Medical Subscription import tab on the Lead Import page.',
     'boolean', '1', NULL, 'Operational', 0, 0),

    ('leads.occupationFilter.enabled',
     'Occupation filter on Leads',
     'Show the occupation dropdown filter on the Leads list.',
     'boolean', '1', NULL, 'Operational', 0, 0),

    ('reports.agentDetail.enabled',
     'Agent detail report',
     'Enable the View button and drill-down report for individual agent performance.',
     'boolean', '1', NULL, 'Operational', 0, 0),

    ('reports.brokerDetail.enabled',
     'Broker detail report',
     'Enable the View button and drill-down report for individual broker performance.',
     'boolean', '1', NULL, 'Operational', 0, 0),

    ('notifications.email.enabled',
     'Email notifications',
     'Dispatch email notifications via Azure Communication Services in addition to in-app notifications. Requires ACS connection string in environment config.',
     'boolean', '0', NULL, 'Operational', 0, 0),

    ('appointments.thirdMeeting.enabled',
     'Optional third meeting',
     'Show the third meeting section on the Appointment Detail page.',
     'boolean', '0', NULL, 'Operational', 0, 0),

    -- ── PHASE 2 flags ──────────────────────────────────────────────────────────
    -- tasks.enabled is intentionally NOT Phase2 — the Tasks page is fully built
    -- and functional. It is off by default but works immediately when enabled.
    -- Phase2 tier is reserved for features that do not yet exist in code.
    ('tasks.enabled',
     'Task management',
     'Enable the Tasks page and automatic task generation from appointment events, callbacks, and rescheduling actions.',
     'boolean', '0', NULL, 'Core', 0, 0),

    ('broker.tokenIncentives.enabled',
     'Broker deal incentives',
     'Award bonus tokens to brokers who close deals. Requires the token economy to be enabled.',
     'boolean', '0', NULL, 'Phase2', 0, 1),

    ('popia.subjectAccessRequest.enabled',
     'POPIA subject access requests',
     'Enable the admin endpoint and UI for processing POPIA data subject access requests.',
     'boolean', '0', NULL, 'Phase2', 0, 1)

) AS source (
    flagKey, label, description, valueType, value,
    allowedValues, tier, requiresRestart, isPhase2
)
ON target.flagKey = source.flagKey
WHEN NOT MATCHED THEN INSERT (
    flagKey, label, description, valueType, value,
    allowedValues, tier, requiresRestart, isPhase2
) VALUES (
    source.flagKey, source.label, source.description, source.valueType, source.value,
    source.allowedValues, source.tier, source.requiresRestart, source.isPhase2
);

-- =============================================================================
-- Post-merge corrections
-- These handle re-runs against a DB that was seeded before this migration was
-- updated. The MERGE above is WHEN NOT MATCHED only (idempotent insert), so it
-- cannot update or delete rows that already exist.
-- =============================================================================

-- Remove appointments.tokens.enabled — the token economy is now implied by
-- claimModel = 'claim' and is no longer a separately configurable flag.
-- Safe to run whether or not the row exists.
DELETE FROM FeatureFlag WHERE flagKey = 'appointments.tokens.enabled';

-- Correct tasks.enabled if it was previously seeded as Phase2.
-- The Tasks page is fully built; it is off by default but operational.
UPDATE FeatureFlag
SET    tier      = 'Core',
       isPhase2  = 0
WHERE  flagKey   = 'tasks.enabled'
  AND  (tier != 'Core' OR isPhase2 != 0);

-- Grant to app user
-- GRANT SELECT, UPDATE ON FeatureFlag TO [medbroker-api-prod];
