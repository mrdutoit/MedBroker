-- =============================================================================
-- MedBroker — Feature Flags Migration (Postgres port of infra/feature-flags.sql)
-- Run after db/schema.postgres.sql.
-- Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS FeatureFlag (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    flagKey         VARCHAR(100)    NOT NULL,
    label           VARCHAR(200)    NOT NULL,
    description     VARCHAR(1000)   NULL,
    valueType       VARCHAR(20)     NOT NULL DEFAULT 'boolean',
    value           VARCHAR(500)    NOT NULL,
    allowedValues   VARCHAR(500)    NULL,
    tier            VARCHAR(50)     NOT NULL DEFAULT 'Operational',
    requiresRestart BOOLEAN         NOT NULL DEFAULT FALSE,
    isPhase2        BOOLEAN         NOT NULL DEFAULT FALSE,
    updatedById     UUID            NULL,
    updatedAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_FeatureFlag      PRIMARY KEY (id),
    CONSTRAINT UQ_FeatureFlag_Key  UNIQUE (flagKey),
    CONSTRAINT CK_FeatureFlag_Type CHECK (valueType IN ('boolean', 'enum', 'string', 'integer')),
    CONSTRAINT CK_FeatureFlag_Tier CHECK (tier IN ('Core', 'Operational', 'Phase2')),
    CONSTRAINT FK_FeatureFlag_User FOREIGN KEY (updatedById) REFERENCES "User"(id)
);

INSERT INTO FeatureFlag (flagKey, label, description, valueType, value, allowedValues, tier, requiresRestart, isPhase2) VALUES

    ('auth.sso.enabled', 'Single Sign-On',
     'Enable SSO via Microsoft 365 (Entra ID) or Google Workspace. When disabled, users log in with a standalone email and password managed within MedBroker.',
     'boolean', '0', NULL, 'Core', FALSE, FALSE),

    ('auth.sso.provider', 'SSO Provider',
     'Which identity provider to use for SSO. Only applies when auth.sso.enabled is true.',
     'enum', 'none', 'none,microsoft,google', 'Core', TRUE, FALSE),

    ('appointments.claimModel', 'Appointment workflow',
     'Assign: admin or supervisor assigns appointments to brokers. Claim: brokers self-select available appointments from a queue. Selecting Claim also activates the token economy (monthly free allocation + token top-ups).',
     'enum', 'assign', 'assign,claim', 'Core', FALSE, FALSE),

    ('appointments.tokens.paymentProvider', 'Token payment provider',
     'Payment gateway for broker token top-ups. none = manual top-up by admin only. stripe = brokers can self-purchase tokens via Stripe Checkout. Only relevant when appointments.claimModel = claim.',
     'enum', 'none', 'none,stripe', 'Core', FALSE, FALSE),

    ('events.enabled', 'Events module',
     'Show the Events section in the navigation. Disable for customers who do not run university or career fair events.',
     'boolean', '1', NULL, 'Core', FALSE, FALSE),

    ('leads.autoUnassign.enabled', 'Lead auto-return',
     'Automatically return leads to the Unassigned queue after the configured inactivity period (set in System Config).',
     'boolean', '1', NULL, 'Core', FALSE, FALSE),

    ('leads.importCsv.enabled', 'CSV lead import',
     'Show the Historical CSV import tab on the Lead Import page.',
     'boolean', '1', NULL, 'Operational', FALSE, FALSE),

    ('leads.importSubscription.enabled', 'Subscription lead import',
     'Show the Medical Subscription import tab on the Lead Import page.',
     'boolean', '1', NULL, 'Operational', FALSE, FALSE),

    ('leads.occupationFilter.enabled', 'Occupation filter on Leads',
     'Show the occupation dropdown filter on the Leads list.',
     'boolean', '1', NULL, 'Operational', FALSE, FALSE),

    ('reports.agentDetail.enabled', 'Agent detail report',
     'Enable the View button and drill-down report for individual agent performance.',
     'boolean', '1', NULL, 'Operational', FALSE, FALSE),

    ('reports.brokerDetail.enabled', 'Broker detail report',
     'Enable the View button and drill-down report for individual broker performance.',
     'boolean', '1', NULL, 'Operational', FALSE, FALSE),

    ('notifications.email.enabled', 'Email notifications',
     'Dispatch email notifications in addition to in-app notifications, via whatever SMTP provider is configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD in Vercel env vars — see emailService.js). Wired up §78; requires those env vars to actually be set, or emails silently no-op (in-app notifications are unaffected either way).',
     'boolean', '0', NULL, 'Operational', FALSE, FALSE),

    ('appointments.thirdMeeting.enabled', 'Optional third meeting',
     'Show the third meeting section on the Appointment Detail page.',
     'boolean', '0', NULL, 'Operational', FALSE, FALSE),

    ('tasks.enabled', 'Task management',
     'Enable the Tasks page and automatic task generation from appointment events, callbacks, and rescheduling actions.',
     'boolean', '0', NULL, 'Core', FALSE, FALSE),

    ('broker.tokenIncentives.enabled', 'Broker deal incentives',
     'Award bonus tokens to brokers who close deals. Requires the token economy to be enabled.',
     'boolean', '0', NULL, 'Phase2', FALSE, TRUE),

    ('popia.subjectAccessRequest.enabled', 'POPIA subject access requests',
     'Enable the admin endpoint and UI for processing POPIA data subject access requests.',
     'boolean', '0', NULL, 'Phase2', FALSE, TRUE)

ON CONFLICT (flagKey) DO NOTHING;

-- Post-merge corrections — parity with the Azure file's re-run safety net.
DELETE FROM FeatureFlag WHERE flagKey = 'appointments.tokens.enabled';

UPDATE FeatureFlag
SET    tier     = 'Core',
       isPhase2 = FALSE
WHERE  flagKey  = 'tasks.enabled'
  AND  (tier != 'Core' OR isPhase2 != FALSE);
