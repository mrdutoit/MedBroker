-- =============================================================================
-- MedBroker Lead Management System — Database Schema
-- Target:  PostgreSQL (Neon) — DEMO BACKEND ONLY
-- Ported from: infra/schema.sql v2.4 (Azure SQL / T-SQL — the production target)
-- Ported:  2026-07
--
-- This is a syntax port, not a redesign. Every table, column, constraint,
-- and index below is a direct translation of infra/schema.sql v2.4. Keep the
-- two files structurally parallel (same section numbers, same order) so a
-- diff between them stays meaningful when this needs to be ported back.
--
-- Type mapping used throughout:
--   UNIQUEIDENTIFIER      -> UUID
--   NEWID()                -> gen_random_uuid()   (built into Postgres 13+ core)
--   NVARCHAR(n)             -> VARCHAR(n)
--   NVARCHAR(MAX)           -> TEXT
--   BIT                     -> BOOLEAN
--   DATETIMEOFFSET          -> TIMESTAMPTZ
--   GETUTCDATE()            -> NOW()               (TIMESTAMPTZ stores UTC internally)
--   [User]                  -> "User"               (USER is a reserved word in both)
--   IF NOT EXISTS (SELECT..) -> CREATE TABLE/INDEX IF NOT EXISTS (native in Postgres)
--   MERGE ... WHEN NOT MATCHED -> INSERT ... ON CONFLICT (key) DO NOTHING
--   OFFSET..FETCH NEXT..ROWS ONLY -> LIMIT n OFFSET m
--   CONSTRAINT name DEFAULT val  -> plain DEFAULT (Postgres doesn't name defaults);
--                                    FK kept as a named table-level constraint for parity
--
-- Known deliberate DEMO-ONLY deviation (flagged, not silent):
--   Section 17 grants and the encryption key source (Key Vault vs local master
--   key) differ from the Azure version by necessity — see src/services/encryption.js.
--
-- Safe to re-run — every CREATE uses IF NOT EXISTS; seed INSERTs use ON CONFLICT DO NOTHING.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- SECTION 1 — CONFIGURATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS SystemConfig (
    id                              INT             NOT NULL DEFAULT 1,
    maxCallAttempts                 INT             NOT NULL DEFAULT 3,
    leadAutoUnassignMonths          INT             NOT NULL DEFAULT 6,
    qrTokenExpiryHours              INT             NOT NULL DEFAULT 720,
    brokerFreeAppointmentsPerMonth  INT             NOT NULL DEFAULT 10,
    -- v2.5 — local auth password policy. Admin-configurable (preset dropdown
    -- 30/60/90/180 + custom in the UI); 0 means "off" for either setting.
    passwordRotationDays            INT             NOT NULL DEFAULT 90,
    passwordLockoutAttempts         INT             NOT NULL DEFAULT 5,
    updatedAt                       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_SystemConfig      PRIMARY KEY (id),
    CONSTRAINT CK_SystemConfig_One  CHECK (id = 1),
    CONSTRAINT CK_SystemConfig_PwRotation CHECK (passwordRotationDays >= 0),
    CONSTRAINT CK_SystemConfig_PwLockout  CHECK (passwordLockoutAttempts >= 0)
);

INSERT INTO SystemConfig (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 1b — ORGANISATION (tenant root)
-- =============================================================================

CREATE TABLE IF NOT EXISTS Organisation (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(300)    NOT NULL,
    code        VARCHAR(50)     NOT NULL,
    isActive    BOOLEAN         NOT NULL DEFAULT TRUE,
    createdAt   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_Organisation      PRIMARY KEY (id),
    CONSTRAINT UQ_Organisation_Code UNIQUE (code)
);

INSERT INTO Organisation (id, name, code)
VALUES ('D0000000-0000-0000-0000-000000000001', 'Default Organisation', 'default')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 2 — LOOKUP / REFERENCE TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS Region (
    id          VARCHAR(50)     NOT NULL,
    label       VARCHAR(200)    NOT NULL,
    isActive    BOOLEAN         NOT NULL DEFAULT TRUE,
    CONSTRAINT PK_Region PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS Portfolio (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    name            VARCHAR(200)    NOT NULL,
    isActive        BOOLEAN         NOT NULL DEFAULT TRUE,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_Portfolio         PRIMARY KEY (id),
    CONSTRAINT UQ_Portfolio_Name    UNIQUE (name),
    CONSTRAINT FK_Portfolio_Org     FOREIGN KEY (organisationId) REFERENCES Organisation(id)
);

CREATE TABLE IF NOT EXISTS Product (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    portfolioId     UUID            NOT NULL,
    name            VARCHAR(200)    NOT NULL,
    isActive        BOOLEAN         NOT NULL DEFAULT TRUE,
    displayOrder    INT             NOT NULL DEFAULT 0,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_Product               PRIMARY KEY (id),
    CONSTRAINT FK_Product_Org           FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_Product_Portfolio     FOREIGN KEY (portfolioId) REFERENCES Portfolio(id),
    CONSTRAINT UQ_Product_PortfolioName UNIQUE (portfolioId, name)
);

CREATE TABLE IF NOT EXISTS MedicalSubscription (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    name            VARCHAR(300)    NOT NULL,
    providerName    VARCHAR(300)    NULL,
    notes           VARCHAR(1000)   NULL,
    isActive        BOOLEAN         NOT NULL DEFAULT TRUE,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_MedicalSubscription       PRIMARY KEY (id),
    CONSTRAINT FK_MedicalSubscription_Org   FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT UQ_MedicalSubscription_Name  UNIQUE (name)
);

-- =============================================================================
-- SECTION 3 — USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS "User" (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId          UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    entraObjectId           VARCHAR(100)    NULL,
    googleUid               VARCHAR(128)    NULL,
    displayName             VARCHAR(200)    NOT NULL,
    email                   VARCHAR(255)    NOT NULL,
    mobileNumber            VARCHAR(20)     NULL,
    role                    VARCHAR(50)     NOT NULL,
    isActive                BOOLEAN         NOT NULL DEFAULT TRUE,
    region                  VARCHAR(50)     NULL,
    portfolioId             UUID            NULL,
    supervisorId            UUID            NULL,
    m365UserPrincipalName   VARCHAR(255)    NULL,
    calendlyEventTypeUri    VARCHAR(500)    NULL,
    -- v2.5 (21 July 2026, demo schema only — not yet ported to Azure infra/schema.sql):
    -- standalone local authentication, completing the auth.sso.enabled=false
    -- path FeatureFlag already describes but nothing ever implemented.
    -- NULL passwordHash = SSO-only user (entraObjectId/googleUid populated instead).
    passwordHash            TEXT            NULL,
    passwordSetAt           TIMESTAMPTZ     NULL,
    passwordMustChange      BOOLEAN         NOT NULL DEFAULT FALSE,
    failedLoginAttempts     INT             NOT NULL DEFAULT 0,
    isLocked                BOOLEAN         NOT NULL DEFAULT FALSE,
    createdAt               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deletedAt               TIMESTAMPTZ     NULL,
    CONSTRAINT PK_User              PRIMARY KEY (id),
    CONSTRAINT UQ_User_Email        UNIQUE (email),
    CONSTRAINT CK_User_Role         CHECK (role IN ('Admin', 'Supervisor', 'Agent', 'Broker', 'GlobalAdmin')),
    CONSTRAINT FK_User_Org          FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_User_Portfolio    FOREIGN KEY (portfolioId)  REFERENCES Portfolio(id)
    -- Self-referencing FK_User_Supervisor added below, after table creation.
    -- entraObjectId / googleUid mutual exclusivity enforced at application layer,
    -- same as the Azure version — Postgres CHECK constraints have the same
    -- cross-column limitation here.
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_supervisor') THEN
        ALTER TABLE "User"
            ADD CONSTRAINT FK_User_Supervisor FOREIGN KEY (supervisorId) REFERENCES "User"(id);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS UQ_User_EntraObjectId
    ON "User" (entraObjectId) WHERE entraObjectId IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS UQ_User_GoogleUid
    ON "User" (googleUid) WHERE googleUid IS NOT NULL;

CREATE INDEX IF NOT EXISTS IX_User_SupervisorId
    ON "User" (supervisorId) WHERE supervisorId IS NOT NULL;

-- =============================================================================
-- SECTION 4 — USER PORTFOLIO JUNCTION
-- =============================================================================

CREATE TABLE IF NOT EXISTS UserPortfolio (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    userId      UUID            NOT NULL,
    portfolioId UUID            NOT NULL,
    isPrimary   BOOLEAN         NOT NULL DEFAULT FALSE,
    createdAt   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_UserPortfolio             PRIMARY KEY (id),
    CONSTRAINT FK_UserPortfolio_User        FOREIGN KEY (userId)      REFERENCES "User"(id),
    CONSTRAINT FK_UserPortfolio_Portfolio   FOREIGN KEY (portfolioId) REFERENCES Portfolio(id),
    CONSTRAINT UQ_UserPortfolio             UNIQUE (userId, portfolioId)
);

CREATE TABLE IF NOT EXISTS BrokerRegion (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    brokerId    UUID            NOT NULL,
    region      VARCHAR(50)     NOT NULL,
    CONSTRAINT PK_BrokerRegion      PRIMARY KEY (id),
    CONSTRAINT FK_BrokerRegion_User FOREIGN KEY (brokerId) REFERENCES "User"(id),
    CONSTRAINT UQ_BrokerRegion      UNIQUE (brokerId, region)
);

CREATE TABLE IF NOT EXISTS BrokerProduct (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    brokerId    UUID            NOT NULL,
    productId   UUID            NOT NULL,
    CONSTRAINT PK_BrokerProduct             PRIMARY KEY (id),
    CONSTRAINT FK_BrokerProduct_User        FOREIGN KEY (brokerId)  REFERENCES "User"(id),
    CONSTRAINT FK_BrokerProduct_Product     FOREIGN KEY (productId) REFERENCES Product(id),
    CONSTRAINT UQ_BrokerProduct             UNIQUE (brokerId, productId)
);

-- =============================================================================
-- SECTION 5 — EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS Event (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    name            VARCHAR(300)    NOT NULL,
    description     VARCHAR(2000)   NULL,
    eventDate       DATE            NOT NULL,
    venue           VARCHAR(300)    NULL,
    university      VARCHAR(200)    NULL,
    status          VARCHAR(50)     NOT NULL DEFAULT 'Draft',
    qrToken         UUID            NOT NULL DEFAULT gen_random_uuid(),
    createdById     UUID            NULL,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deletedAt       TIMESTAMPTZ     NULL,
    CONSTRAINT PK_Event         PRIMARY KEY (id),
    CONSTRAINT UQ_Event_QrToken UNIQUE (qrToken),
    CONSTRAINT FK_Event_Org     FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_Event_Creator FOREIGN KEY (createdById) REFERENCES "User"(id),
    CONSTRAINT CK_Event_Status  CHECK (status IN ('Draft', 'Active', 'Closed', 'Cancelled'))
);

-- =============================================================================
-- SECTION 6 — CSV IMPORT BATCHES
-- =============================================================================

CREATE TABLE IF NOT EXISTS CsvImportBatch (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    sourceLabel     VARCHAR(300)    NOT NULL,
    importedById    UUID            NOT NULL,
    totalRows       INT             NOT NULL DEFAULT 0,
    importedCount   INT             NOT NULL DEFAULT 0,
    skippedCount    INT             NOT NULL DEFAULT 0,
    importType      VARCHAR(50)     NOT NULL DEFAULT 'Historical',
    subscriptionId  UUID            NULL,
    importedAt      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_CsvImportBatch      PRIMARY KEY (id),
    CONSTRAINT FK_CsvImportBatch_Org  FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_CsvImportBatch_User FOREIGN KEY (importedById)   REFERENCES "User"(id),
    CONSTRAINT FK_CsvImportBatch_Sub  FOREIGN KEY (subscriptionId) REFERENCES MedicalSubscription(id),
    CONSTRAINT CK_CsvImportBatch_Type CHECK (importType IN ('Historical', 'Subscription'))
);

-- =============================================================================
-- SECTION 7 — LEADS
--
-- Source: four nullable FK/text columns — exactly one should be non-null.
-- assignedBrokerId does not exist here by design — broker lives on Appointment
-- only. (This matches the Azure schema; the mismatch was in leadService.js's
-- queries, not the schema — see DEMO_NOTES.md.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS Lead (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId          UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',

    title                   VARCHAR(10)     NULL,
    firstName               VARCHAR(100)    NOT NULL,
    lastName                VARCHAR(100)    NOT NULL,
    dateOfBirth             DATE            NULL,
    idNumberEncrypted       TEXT            NULL,
    idNumberHash            VARCHAR(64)     NULL,
    email                   VARCHAR(255)    NOT NULL,
    mobileNumber            VARCHAR(20)     NULL,
    whatsappNumber          VARCHAR(20)     NULL,

    universityAttended      VARCHAR(200)    NULL,
    yearOfAttendance        INT             NULL,
    degreeAttained          VARCHAR(200)    NULL,
    occupation               VARCHAR(200)    NULL,
    hospitalOrPractice      VARCHAR(300)    NULL,

    existingCover           BOOLEAN         NULL,
    currentInsurer          VARCHAR(200)    NULL,
    policies                VARCHAR(500)    NULL,
    medicalAid              BOOLEAN         NULL,
    medicalAidProvider      VARCHAR(200)    NULL,

    linkedEventId           UUID            NULL,
    linkedSubscriptionId    UUID            NULL,
    csvImportBatchId        UUID            NULL,
    manualSourceName        VARCHAR(300)    NULL,
    -- DEPRECATED 23 Jul 2026 — superseded by LeadPortfolio (many-to-many,
    -- see below). A lead can be tagged with more than one portfolio (a
    -- broker isn't limited to one either — mirrors the existing
    -- UserPortfolio pattern). Column kept in place, unused by app logic
    -- going forward, same as the existing vestigial User.portfolioId.
    portfolioId             UUID            NULL,

    pipelineStatus          VARCHAR(50)     NOT NULL DEFAULT 'Unassigned',
    assignedAgentId         UUID            NULL,
    autoUnassignAfter       TIMESTAMPTZ     NULL,

    createdById             UUID            NULL,
    createdAt               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deletedAt               TIMESTAMPTZ     NULL,

    CONSTRAINT PK_Lead              PRIMARY KEY (id),
    CONSTRAINT FK_Lead_Org          FOREIGN KEY (organisationId)       REFERENCES Organisation(id),
    CONSTRAINT FK_Lead_Event        FOREIGN KEY (linkedEventId)        REFERENCES Event(id),
    CONSTRAINT FK_Lead_Subscription FOREIGN KEY (linkedSubscriptionId) REFERENCES MedicalSubscription(id),
    CONSTRAINT FK_Lead_ImportBatch  FOREIGN KEY (csvImportBatchId)     REFERENCES CsvImportBatch(id),
    CONSTRAINT FK_Lead_Agent        FOREIGN KEY (assignedAgentId)      REFERENCES "User"(id),
    CONSTRAINT FK_Lead_CreatedBy    FOREIGN KEY (createdById)          REFERENCES "User"(id),
    CONSTRAINT FK_Lead_Portfolio    FOREIGN KEY (portfolioId)          REFERENCES Portfolio(id),
    CONSTRAINT CK_Lead_Status       CHECK (pipelineStatus IN (
        'Unassigned', 'Assigned', 'InProgress', 'AppointmentScheduled', 'Closed'
    )),
    CONSTRAINT CK_Lead_Title        CHECK (title IS NULL OR title IN ('Dr', 'Mr', 'Mrs', 'Ms')),
    CONSTRAINT CK_Lead_Year         CHECK (
        yearOfAttendance IS NULL
        OR (yearOfAttendance >= 1960 AND yearOfAttendance <= 2100)
    )
);

-- Many-to-many, mirrors UserPortfolio exactly (23 Jul 2026, Mark's
-- request — a Lead can be tagged with interest across more than one
-- portfolio, same as a broker isn't limited to selling from just one).
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

CREATE INDEX IF NOT EXISTS IX_Lead_PipelineStatus
    ON Lead (pipelineStatus) WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IX_Lead_IdNumberHash
    ON Lead (idNumberHash) WHERE idNumberHash IS NOT NULL AND deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IX_Lead_AssignedAgentId
    ON Lead (assignedAgentId) WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IX_Lead_Email
    ON Lead (email) WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IX_Lead_LinkedEventId
    ON Lead (linkedEventId) WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IX_Lead_Occupation
    ON Lead (occupation) WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IX_Lead_AutoUnassign
    ON Lead (autoUnassignAfter)
    WHERE deletedAt IS NULL
      AND pipelineStatus NOT IN ('Closed','AppointmentScheduled');

CREATE INDEX IF NOT EXISTS IX_Lead_Org ON Lead (organisationId) WHERE deletedAt IS NULL;

-- =============================================================================
-- SECTION 8 — CALL ATTEMPTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS CallAttempt (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId          UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    leadId                  UUID            NOT NULL,
    agentId                 UUID            NOT NULL,
    outcome                 VARCHAR(50)     NOT NULL,
    callTime                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    notes                   VARCHAR(2000)   NULL,
    followUpDateTime        TIMESTAMPTZ     NULL,
    appointmentDate         DATE            NULL,
    appointmentTime         TIME            NULL,
    appointmentAddress      VARCHAR(500)    NULL,
    appointmentPortfolio    VARCHAR(100)    NULL,
    currentInsurer          VARCHAR(200)    NULL,
    CONSTRAINT PK_CallAttempt         PRIMARY KEY (id),
    CONSTRAINT FK_CallAttempt_Org     FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_CallAttempt_Lead    FOREIGN KEY (leadId)  REFERENCES Lead(id),
    CONSTRAINT FK_CallAttempt_Agent   FOREIGN KEY (agentId) REFERENCES "User"(id),
    CONSTRAINT CK_CallAttempt_Outcome CHECK (outcome IN (
        'NoAnswer', 'Voicemail', 'WrongNumber',
        'CallbackRequested', 'ClientContacted', 'NotInterested', 'AppointmentScheduled'
    ))
);

CREATE INDEX IF NOT EXISTS IX_CallAttempt_LeadId ON CallAttempt (leadId);

CREATE INDEX IF NOT EXISTS IX_CallAttempt_FollowUp
    ON CallAttempt (followUpDateTime)
    WHERE followUpDateTime IS NOT NULL;

CREATE INDEX IF NOT EXISTS IX_CallAttempt_Org ON CallAttempt (organisationId);

-- =============================================================================
-- SECTION 9 — APPOINTMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS Appointment (
    id                          UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId              UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    leadId                      UUID            NOT NULL,

    status                      VARCHAR(50)     NOT NULL DEFAULT 'Unassigned',
    agentId                     UUID            NOT NULL,
    brokerId                    UUID            NULL,
    portfolioId                 UUID            NOT NULL,

    firstAppointmentDate        DATE            NOT NULL,
    firstAppointmentTime        TIME            NOT NULL,
    firstAppointmentAddress     VARCHAR(500)    NULL,
    m365EventId                 VARCHAR(500)    NULL,

    productsInterestedIn        TEXT            NULL,
    currentInsurer              VARCHAR(200)    NULL,

    meeting1Date                DATE            NULL,
    meeting1Status               VARCHAR(50)     NULL,
    meeting1RescheduledDateTime TIMESTAMPTZ     NULL,
    meeting1Feedback            VARCHAR(2000)   NULL,

    meeting2Date                DATE            NULL,
    meeting2Status               VARCHAR(50)     NULL,
    meeting2RescheduledDateTime TIMESTAMPTZ     NULL,
    meeting2Feedback            VARCHAR(2000)   NULL,

    meeting3Date                DATE            NULL,
    meeting3Status               VARCHAR(50)     NULL,
    meeting3RescheduledDateTime TIMESTAMPTZ     NULL,
    meeting3Feedback            VARCHAR(2000)   NULL,

    customerSigned              BOOLEAN         NULL,
    isBrokerSwitch              BOOLEAN         NULL,

    claimedByBrokerId           UUID            NULL,
    claimedAt                   TIMESTAMPTZ     NULL,
    claimTokenCost              INT             NULL DEFAULT 0,

    createdAt                   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt                   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT PK_Appointment           PRIMARY KEY (id),
    -- UQ_Appointment_LeadId removed 23 Jul 2026 (Mark's request, see Status.md
    -- §35) — was a hard 1:1 Lead:Appointment constraint. A Lead can now have
    -- multiple Appointments over its lifetime (Closed Lost -> manual Reopen
    -- -> new Book Appointment attempt). Full history preserved; "the current
    -- appointment" for a Lead is resolved as the most recent by createdAt
    -- (see leadService.getLeadById's LATERAL join). IX_Appointment_LeadId
    -- below (a plain, non-unique index) still covers the lookup.
    CONSTRAINT FK_Appointment_Org       FOREIGN KEY (organisationId)    REFERENCES Organisation(id),
    CONSTRAINT FK_Appointment_Lead      FOREIGN KEY (leadId)            REFERENCES Lead(id),
    CONSTRAINT FK_Appointment_Agent     FOREIGN KEY (agentId)           REFERENCES "User"(id),
    CONSTRAINT FK_Appointment_Broker    FOREIGN KEY (brokerId)          REFERENCES "User"(id),
    CONSTRAINT FK_Appointment_ClaimedBy FOREIGN KEY (claimedByBrokerId) REFERENCES "User"(id),
    CONSTRAINT FK_Appointment_Portfolio FOREIGN KEY (portfolioId)       REFERENCES Portfolio(id),
    CONSTRAINT CK_Appointment_Status    CHECK (status IN ('Unassigned', 'Assigned', 'InProgress', 'ClosedWon', 'ClosedLost', 'Claimed', 'ReturnedToLeads')),
    CONSTRAINT CK_Appointment_M1Status  CHECK (meeting1Status IS NULL OR meeting1Status IN ('Seen', 'Rescheduled', 'Cancelled')),
    CONSTRAINT CK_Appointment_M2Status  CHECK (meeting2Status IS NULL OR meeting2Status IN ('Seen', 'Rescheduled', 'Cancelled')),
    CONSTRAINT CK_Appointment_M3Status  CHECK (meeting3Status IS NULL OR meeting3Status IN ('Seen', 'Rescheduled', 'Cancelled'))
);

CREATE INDEX IF NOT EXISTS IX_Appointment_BrokerDate
    ON Appointment (brokerId, firstAppointmentDate)
    WHERE status IN ('Assigned', 'InProgress', 'Claimed');

CREATE INDEX IF NOT EXISTS IX_Appointment_LeadId ON Appointment (leadId);
CREATE INDEX IF NOT EXISTS IX_Appointment_Status ON Appointment (status);
CREATE INDEX IF NOT EXISTS IX_Appointment_Portfolio ON Appointment (portfolioId);

CREATE INDEX IF NOT EXISTS IX_Appointment_FirstDate ON Appointment (firstAppointmentDate)
    WHERE status IN ('Assigned', 'InProgress', 'Claimed');

CREATE INDEX IF NOT EXISTS IX_Appointment_Unassigned ON Appointment (portfolioId, firstAppointmentDate)
    WHERE status = 'Unassigned';

CREATE INDEX IF NOT EXISTS IX_Appointment_Org ON Appointment (organisationId);

-- =============================================================================
-- SECTION 10 — APPOINTMENT PRODUCTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS AppointmentProduct (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    appointmentId   UUID            NOT NULL,
    productId       UUID            NOT NULL,
    -- Added 23 Jul 2026 (Mark's request) — the Rand value of this specific
    -- product on this specific appointment, so policy value can be tracked
    -- per item sold and reported on (previously no monetary field existed
    -- anywhere in the schema — Reports.jsx/BrokerDetail.jsx both dropped
    -- Policy Value KPIs for exactly that reason; this is what re-enables
    -- them for real, see reportService.js). Nullable — capturing a value
    -- shouldn't block saving the outcome if the broker doesn't have the
    -- exact figure to hand yet.
    policyValue     NUMERIC(12,2)   NULL,
    CONSTRAINT PK_AppointmentProduct         PRIMARY KEY (id),
    CONSTRAINT FK_AppointmentProduct_Appt    FOREIGN KEY (appointmentId) REFERENCES Appointment(id),
    CONSTRAINT FK_AppointmentProduct_Product FOREIGN KEY (productId)     REFERENCES Product(id),
    CONSTRAINT UQ_AppointmentProduct         UNIQUE (appointmentId, productId)
);

-- =============================================================================
-- SECTION 11 — EVENT ATTENDEES
-- =============================================================================

CREATE TABLE IF NOT EXISTS EventAttendee (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    eventId         UUID            NOT NULL,
    leadId          UUID            NOT NULL,
    rsvp            BOOLEAN         NOT NULL DEFAULT FALSE,
    attended        BOOLEAN         NOT NULL DEFAULT FALSE,
    attendedAt      TIMESTAMPTZ     NULL,
    popiConsent     BOOLEAN         NOT NULL DEFAULT FALSE,
    registeredAt    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deletedAt       TIMESTAMPTZ     NULL,
    CONSTRAINT PK_EventAttendee       PRIMARY KEY (id),
    CONSTRAINT FK_EventAttendee_Org   FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_EventAttendee_Event FOREIGN KEY (eventId) REFERENCES Event(id),
    CONSTRAINT FK_EventAttendee_Lead  FOREIGN KEY (leadId)  REFERENCES Lead(id),
    CONSTRAINT UQ_EventAttendee       UNIQUE (eventId, leadId)
);

-- =============================================================================
-- SECTION 12 — NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS Notification (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    recipientId     UUID            NOT NULL,
    type            VARCHAR(100)    NOT NULL,
    title           VARCHAR(300)    NOT NULL,
    body            VARCHAR(2000)   NOT NULL,
    entityType      VARCHAR(50)     NULL,
    entityId        VARCHAR(100)    NULL,
    isRead          BOOLEAN         NOT NULL DEFAULT FALSE,
    emailSent       BOOLEAN         NOT NULL DEFAULT FALSE,
    emailSentAt     TIMESTAMPTZ     NULL,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_Notification           PRIMARY KEY (id),
    CONSTRAINT FK_Notification_Org       FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_Notification_Recipient FOREIGN KEY (recipientId) REFERENCES "User"(id)
);

CREATE INDEX IF NOT EXISTS IX_Notification_Recipient
    ON Notification (recipientId, isRead, createdAt DESC);

-- =============================================================================
-- SECTION 13 — TASKS (Phase 2 stub)
-- =============================================================================

CREATE TABLE IF NOT EXISTS Task (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    assignedToId    UUID            NOT NULL,
    entityType      VARCHAR(50)     NOT NULL,
    entityId        UUID            NOT NULL,
    type            VARCHAR(50)     NOT NULL,
    title           VARCHAR(300)    NOT NULL,
    detail          VARCHAR(1000)   NULL,
    dueAt           TIMESTAMPTZ     NULL,
    isComplete      BOOLEAN         NOT NULL DEFAULT FALSE,
    completedAt     TIMESTAMPTZ     NULL,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updatedAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_Task            PRIMARY KEY (id),
    CONSTRAINT FK_Task_Org        FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_Task_AssignedTo FOREIGN KEY (assignedToId) REFERENCES "User"(id),
    CONSTRAINT CK_Task_EntityType CHECK (entityType IN ('Lead', 'Appointment')),
    CONSTRAINT CK_Task_Type       CHECK (type IN ('Callback', 'Appointment', 'Reschedule', 'Reminder', 'Outcome'))
);

CREATE INDEX IF NOT EXISTS IX_Task_AssignedTo
    ON Task (assignedToId, isComplete, dueAt)
    WHERE isComplete = FALSE;

-- =============================================================================
-- SECTION 14 — TOKEN LEDGER (Phase 2 stub)
-- =============================================================================

CREATE TABLE IF NOT EXISTS TokenLedger (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    brokerId        UUID            NOT NULL,
    balance         INT             NOT NULL DEFAULT 0,
    freeRemaining   INT             NOT NULL DEFAULT 10,
    periodStart     DATE            NOT NULL,
    updatedAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_TokenLedger        PRIMARY KEY (id),
    CONSTRAINT FK_TokenLedger_Org    FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_TokenLedger_Broker FOREIGN KEY (brokerId) REFERENCES "User"(id),
    CONSTRAINT UQ_TokenLedger_Broker UNIQUE (brokerId)
);

CREATE TABLE IF NOT EXISTS TokenTransaction (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    brokerId        UUID            NOT NULL,
    type            VARCHAR(20)     NOT NULL,
    amount          INT             NOT NULL,
    appointmentId   UUID            NULL,
    description     VARCHAR(300)    NOT NULL,
    createdAt       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_TokenTransaction             PRIMARY KEY (id),
    CONSTRAINT FK_TokenTransaction_Org         FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_TokenTransaction_Broker      FOREIGN KEY (brokerId)      REFERENCES "User"(id),
    CONSTRAINT FK_TokenTransaction_Appointment FOREIGN KEY (appointmentId) REFERENCES Appointment(id),
    CONSTRAINT CK_TokenTransaction_Type        CHECK (type IN ('Credit', 'Debit'))
);

CREATE INDEX IF NOT EXISTS IX_TokenTransaction_Broker
    ON TokenTransaction (brokerId, createdAt DESC);

-- =============================================================================
-- SECTION 15 — AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS AuditLog (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId  UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    entityType      VARCHAR(100)    NOT NULL,
    entityId        VARCHAR(100)    NOT NULL,
    action          VARCHAR(100)    NOT NULL,
    performedById   UUID            NULL,
    performedAt     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    changeDetail    TEXT            NULL,
    ipAddress       VARCHAR(50)     NULL,
    CONSTRAINT PK_AuditLog     PRIMARY KEY (id),
    CONSTRAINT FK_AuditLog_Org FOREIGN KEY (organisationId) REFERENCES Organisation(id)
);

CREATE INDEX IF NOT EXISTS IX_AuditLog_Entity ON AuditLog (entityType, entityId);
CREATE INDEX IF NOT EXISTS IX_AuditLog_PerformedAt ON AuditLog (performedAt DESC);

-- =============================================================================
-- SECTION 16 — SEED DATA
-- =============================================================================

INSERT INTO Region (id, label) VALUES
    ('Gauteng',       'Gauteng'),
    ('WesternCape',   'Western Cape'),
    ('KwaZuluNatal',  'KwaZulu-Natal'),
    ('EasternCape',   'Eastern Cape'),
    ('Limpopo',       'Limpopo'),
    ('Mpumalanga',    'Mpumalanga'),
    ('NorthWest',     'North West'),
    ('NorthernCape',  'Northern Cape'),
    ('FreeState',     'Free State')
ON CONFLICT (id) DO NOTHING;

INSERT INTO Portfolio (id, name) VALUES
    ('A0000000-0001-0000-0000-000000000001', 'Discovery'),
    ('A0000000-0001-0000-0000-000000000002', 'Money and Medicine')
ON CONFLICT (id) DO NOTHING;

INSERT INTO Product (id, portfolioId, name, displayOrder) VALUES
    ('B0000000-0001-0000-0000-000000000001', 'A0000000-0001-0000-0000-000000000001', 'Life Insurance',        1),
    ('B0000000-0001-0000-0000-000000000002', 'A0000000-0001-0000-0000-000000000001', 'Income Protection',     2),
    ('B0000000-0001-0000-0000-000000000003', 'A0000000-0001-0000-0000-000000000001', 'Disability Cover',      3),
    ('B0000000-0001-0000-0000-000000000004', 'A0000000-0001-0000-0000-000000000001', 'Severe Illness Cover',  4),
    ('B0000000-0001-0000-0000-000000000005', 'A0000000-0001-0000-0000-000000000001', 'Education Cover',       5),
    ('B0000000-0001-0000-0000-000000000006', 'A0000000-0001-0000-0000-000000000001', 'Retirement Annuity',    6),
    ('B0000000-0001-0000-0000-000000000007', 'A0000000-0001-0000-0000-000000000001', 'Medical Aid',           7),
    ('B0000000-0001-0000-0000-000000000008', 'A0000000-0001-0000-0000-000000000001', 'Gap Cover',             8),
    ('B0000000-0001-0000-0000-000000000009', 'A0000000-0001-0000-0000-000000000001', 'Vitality',              9),
    ('B0000000-0001-0000-0000-000000000010', 'A0000000-0001-0000-0000-000000000001', 'Bank',                  10),
    ('B0000000-0001-0000-0000-000000000011', 'A0000000-0001-0000-0000-000000000002', 'Unit Trust',            1),
    ('B0000000-0001-0000-0000-000000000012', 'A0000000-0001-0000-0000-000000000002', 'TFSA',                  2),
    ('B0000000-0001-0000-0000-000000000013', 'A0000000-0001-0000-0000-000000000002', 'Endowment Policy',      3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO MedicalSubscription (id, name, providerName) VALUES
    ('C0000000-0001-0000-0000-000000000001', 'MedLeads SA — Monthly Bundle',   'MedLeads SA (Pty) Ltd'),
    ('C0000000-0001-0000-0000-000000000002', 'Healthwise Doctor Database',     'Healthwise Data'),
    ('C0000000-0001-0000-0000-000000000003', 'SA Medical Register — Q2 2026', 'HPCSA Data Services')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 17 — APPLICATION USER PERMISSIONS
--
-- DEMO DEVIATION: Neon's free-tier connection is the single application role
-- (no Managed Identity equivalent). Table-level GRANTs as used on Azure are
-- not meaningful here in the same way — connection-level access is already
-- scoped to the one Neon role your DATABASE_URL authenticates as. Left as a
-- comment for parity with the Azure file; do not attempt to run this section.
-- =============================================================================

-- =============================================================================
-- SECTION 18 — VERIFICATION
-- =============================================================================

SELECT relname AS "TableName", n_live_tup AS "EstimatedRowCount"
FROM pg_stat_user_tables
ORDER BY relname;
