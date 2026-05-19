-- =============================================================================
-- MedBroker Lead Management System — Database Schema
-- Target:  Azure SQL (SQL Server compatible)
-- Created: 2026-05
-- Version: 2.1
--
-- Version history:
--   1.0  Initial schema
--   2.0  Lead/Appointment separation (Salesforce pattern); Portfolio, Product,
--        MedicalSubscription, CsvImportBatch, Notification, SystemConfig added;
--        CallAttempt updated (callTime, Interested removed, appt fields added);
--        3-meeting tracking and outcome fields on Appointment.
--   2.1  Changes to align with React app and UI requirements:
--          - User.supervisorId added — FK back to User for supervisor assignment.
--            Required for Agent and Broker roles. Enables supervisor-filtered
--            queries on Leads and Appointments (WHERE agent.supervisorId = @me).
--          - User.portfolioId (single FK) replaced by UserPortfolio junction table.
--            Agents have one portfolio; Brokers can have both. portfolioId is
--            retained on User as a convenience column for the common case
--            (single-portfolio users) and kept in sync by the application.
--          - User.googleUid added — Google Workspace UID for GCP (Profile B)
--            deployments using Firebase Authentication. NULL for Azure deployments.
--          - Appointment.status CHECK updated to include 'Claimed' for the Phase 2
--            broker self-service model. Not enforced until Phase 2 is live.
--          - Task table stubbed for Phase 2 — structure defined, not yet
--            populated by any application logic.
--          - TokenLedger and TokenTransaction tables stubbed for the Phase 2
--            broker claim token economy.
--          - MedicalSubscription seed data added (3 initial subscriptions).
--          - Notification.type CHECK updated to include 'AppointmentAvailable'
--            (Phase 2 — sent to brokers when an unassigned appointment is available
--            to claim in their region and portfolio).
--
-- Instructions:
--   1. Connect to your Azure SQL database in Azure Data Studio or SSMS
--   2. Select the medbroker database
--   3. Execute this full script (F5 or Run)
--   4. Safe to re-run — all CREATE statements check for existence first
--   5. MERGE seed data is idempotent
--   6. After creation, grant app user permissions (Section 15)
-- =============================================================================

-- =============================================================================
-- SECTION 1 — CONFIGURATION
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SystemConfig')
CREATE TABLE SystemConfig (
    id                          INT             NOT NULL DEFAULT 1,
    maxCallAttempts             INT             NOT NULL DEFAULT 3,
    leadAutoUnassignMonths      INT             NOT NULL DEFAULT 6,
    qrTokenExpiryHours          INT             NOT NULL DEFAULT 720,
    -- Phase 2: free monthly appointment allocation for brokers before token cost
    brokerFreeAppointmentsPerMonth INT          NOT NULL DEFAULT 10,
    updatedAt                   DATETIMEOFFSET  NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_SystemConfig      PRIMARY KEY (id),
    CONSTRAINT CK_SystemConfig_One  CHECK (id = 1)
);

IF NOT EXISTS (SELECT 1 FROM SystemConfig WHERE id = 1)
    INSERT INTO SystemConfig (id) VALUES (1);

-- =============================================================================
-- SECTION 2 — LOOKUP / REFERENCE TABLES
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Region')
CREATE TABLE Region (
    id          NVARCHAR(50)    NOT NULL,
    label       NVARCHAR(200)   NOT NULL,
    isActive    BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Region PRIMARY KEY (id)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Portfolio')
CREATE TABLE Portfolio (
    id          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    name        NVARCHAR(200)       NOT NULL,
    isActive    BIT                 NOT NULL DEFAULT 1,
    createdAt   DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Portfolio         PRIMARY KEY (id),
    CONSTRAINT UQ_Portfolio_Name    UNIQUE (name)
);

-- Product — insurance products selectable as products sold on an appointment.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Product')
CREATE TABLE Product (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    portfolioId     UNIQUEIDENTIFIER    NOT NULL,
    name            NVARCHAR(200)       NOT NULL,
    isActive        BIT                 NOT NULL DEFAULT 1,
    displayOrder    INT                 NOT NULL DEFAULT 0,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Product               PRIMARY KEY (id),
    CONSTRAINT FK_Product_Portfolio     FOREIGN KEY (portfolioId) REFERENCES Portfolio(id),
    CONSTRAINT UQ_Product_PortfolioName UNIQUE (portfolioId, name)
);

-- MedicalSubscription — third-party lead data sources.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'MedicalSubscription')
CREATE TABLE MedicalSubscription (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    name            NVARCHAR(300)       NOT NULL,
    providerName    NVARCHAR(300)       NULL,
    notes           NVARCHAR(1000)      NULL,
    isActive        BIT                 NOT NULL DEFAULT 1,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_MedicalSubscription       PRIMARY KEY (id),
    CONSTRAINT UQ_MedicalSubscription_Name  UNIQUE (name)
);

-- =============================================================================
-- SECTION 3 — USERS
--
-- v2.1 changes:
--   supervisorId  — FK back to User for the supervisor/direct-report relationship.
--                   Required for Agent and Broker roles; NULL for Supervisor/Admin.
--                   Used by the API to filter: WHERE u.supervisorId = @currentUserId
--   googleUid     — Google Workspace UID for Firebase Authentication (Profile B/GCP).
--                   NULL on Azure deployments. Either entraObjectId or googleUid
--                   will be populated, not both; enforced at application layer.
--   portfolioId   — Retained as a convenience column for single-portfolio users
--                   (all Agents, single-portfolio Brokers). Kept in sync with
--                   UserPortfolio by the application. Multi-portfolio Brokers
--                   have their authoritative portfolio list in UserPortfolio.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'User')
CREATE TABLE [User] (
    id                      UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    -- Azure Entra ID object ID (oid claim). NULL for GCP deployments.
    entraObjectId           NVARCHAR(100)       NULL,
    -- Google Workspace UID from Firebase Authentication. NULL for Azure deployments.
    googleUid               NVARCHAR(128)       NULL,
    displayName             NVARCHAR(200)       NOT NULL,
    email                   NVARCHAR(255)       NOT NULL,
    mobileNumber            NVARCHAR(20)        NULL,
    role                    NVARCHAR(50)        NOT NULL,
    isActive                BIT                 NOT NULL DEFAULT 1,
    -- Primary region for the user. Brokers can have additional regions in BrokerRegion.
    region                  NVARCHAR(50)        NULL,
    -- Convenience FK for single-portfolio users. Multi-portfolio brokers use UserPortfolio.
    portfolioId             UNIQUEIDENTIFIER    NULL,
    -- Supervisor assignment — required for Agent and Broker; NULL for Supervisor/Admin.
    -- Enables supervisor-scoped queries: WHERE assignedUser.supervisorId = @supervisorId
    supervisorId            UNIQUEIDENTIFIER    NULL,
    -- Microsoft 365 UPN used with Graph API for calendar availability lookup.
    m365UserPrincipalName   NVARCHAR(255)       NULL,
    createdAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt               DATETIMEOFFSET      NULL,
    CONSTRAINT PK_User              PRIMARY KEY (id),
    CONSTRAINT UQ_User_Email        UNIQUE (email),
    CONSTRAINT CK_User_Role         CHECK (role IN ('Admin', 'Supervisor', 'Agent', 'Broker')),
    CONSTRAINT FK_User_Portfolio    FOREIGN KEY (portfolioId)  REFERENCES Portfolio(id),
    -- Self-referencing FK. Deferred to after table creation — see ALTER below.
    -- CONSTRAINT FK_User_Supervisor   FOREIGN KEY (supervisorId) REFERENCES [User](id)
    -- NOTE: entraObjectId and googleUid are mutually exclusive; one must be non-null.
    -- Enforce in application layer — CHECK constraints cannot reference other columns
    -- in Azure SQL for this pattern.
);

-- Self-referencing FK added after table creation to avoid forward-reference issue
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_User_Supervisor'
)
ALTER TABLE [User]
    ADD CONSTRAINT FK_User_Supervisor FOREIGN KEY (supervisorId) REFERENCES [User](id);

-- Unique constraints for identity columns (conditional — only one will be non-null)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_User_EntraObjectId')
    CREATE UNIQUE INDEX UQ_User_EntraObjectId
        ON [User] (entraObjectId) WHERE entraObjectId IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_User_GoogleUid')
    CREATE UNIQUE INDEX UQ_User_GoogleUid
        ON [User] (googleUid) WHERE googleUid IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_User_SupervisorId')
    CREATE INDEX IX_User_SupervisorId ON [User] (supervisorId) WHERE supervisorId IS NOT NULL;

-- =============================================================================
-- SECTION 4 — USER PORTFOLIO JUNCTION
--
-- v2.1 addition: replaces the implicit single-portfolio constraint.
-- Agents typically have one portfolio. Brokers can have both Discovery and
-- Money and Medicine. The convenience portfolioId on User is kept in sync
-- with the first/primary portfolio in this table.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'UserPortfolio')
CREATE TABLE UserPortfolio (
    id          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    userId      UNIQUEIDENTIFIER    NOT NULL,
    portfolioId UNIQUEIDENTIFIER    NOT NULL,
    -- isPrimary = 1 for the portfolio that maps to User.portfolioId (convenience)
    isPrimary   BIT                 NOT NULL DEFAULT 0,
    createdAt   DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_UserPortfolio             PRIMARY KEY (id),
    CONSTRAINT FK_UserPortfolio_User        FOREIGN KEY (userId)      REFERENCES [User](id),
    CONSTRAINT FK_UserPortfolio_Portfolio   FOREIGN KEY (portfolioId) REFERENCES Portfolio(id),
    CONSTRAINT UQ_UserPortfolio             UNIQUE (userId, portfolioId)
);

-- BrokerRegion — a broker can cover multiple regions beyond their primary one
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BrokerRegion')
CREATE TABLE BrokerRegion (
    id          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    brokerId    UNIQUEIDENTIFIER    NOT NULL,
    region      NVARCHAR(50)        NOT NULL,
    CONSTRAINT PK_BrokerRegion      PRIMARY KEY (id),
    CONSTRAINT FK_BrokerRegion_User FOREIGN KEY (brokerId) REFERENCES [User](id),
    CONSTRAINT UQ_BrokerRegion      UNIQUE (brokerId, region)
);

-- BrokerProduct — products a broker is qualified/specialised to sell
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BrokerProduct')
CREATE TABLE BrokerProduct (
    id          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    brokerId    UNIQUEIDENTIFIER    NOT NULL,
    productId   UNIQUEIDENTIFIER    NOT NULL,
    CONSTRAINT PK_BrokerProduct             PRIMARY KEY (id),
    CONSTRAINT FK_BrokerProduct_User        FOREIGN KEY (brokerId)  REFERENCES [User](id),
    CONSTRAINT FK_BrokerProduct_Product     FOREIGN KEY (productId) REFERENCES Product(id),
    CONSTRAINT UQ_BrokerProduct             UNIQUE (brokerId, productId)
);

-- =============================================================================
-- SECTION 5 — EVENTS
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Event')
CREATE TABLE Event (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    name            NVARCHAR(300)       NOT NULL,
    description     NVARCHAR(2000)      NULL,
    eventDate       DATE                NOT NULL,
    venue           NVARCHAR(300)       NULL,
    university      NVARCHAR(200)       NULL,
    status          NVARCHAR(50)        NOT NULL DEFAULT 'Draft',
    qrToken         UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    createdById     UNIQUEIDENTIFIER    NULL,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt       DATETIMEOFFSET      NULL,
    CONSTRAINT PK_Event         PRIMARY KEY (id),
    CONSTRAINT UQ_Event_QrToken UNIQUE (qrToken),
    CONSTRAINT FK_Event_Creator FOREIGN KEY (createdById) REFERENCES [User](id),
    CONSTRAINT CK_Event_Status  CHECK (status IN ('Draft', 'Active', 'Closed', 'Cancelled'))
);

-- =============================================================================
-- SECTION 6 — CSV IMPORT BATCHES
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CsvImportBatch')
CREATE TABLE CsvImportBatch (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    sourceLabel     NVARCHAR(300)       NOT NULL,
    importedById    UNIQUEIDENTIFIER    NOT NULL,
    totalRows       INT                 NOT NULL DEFAULT 0,
    importedCount   INT                 NOT NULL DEFAULT 0,
    skippedCount    INT                 NOT NULL DEFAULT 0,
    importType      NVARCHAR(50)        NOT NULL DEFAULT 'Historical',
    subscriptionId  UNIQUEIDENTIFIER    NULL,
    importedAt      DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_CsvImportBatch            PRIMARY KEY (id),
    CONSTRAINT FK_CsvImportBatch_User       FOREIGN KEY (importedById)   REFERENCES [User](id),
    CONSTRAINT FK_CsvImportBatch_Sub        FOREIGN KEY (subscriptionId) REFERENCES MedicalSubscription(id),
    CONSTRAINT CK_CsvImportBatch_Type       CHECK (importType IN ('Historical', 'Subscription'))
);

-- =============================================================================
-- SECTION 7 — LEADS
--
-- Design decisions carried forward from v2.0:
--   - Source: four nullable FK/text columns (linkedEventId, linkedSubscriptionId,
--     csvImportBatchId, manualSourceName). Exactly one should be non-null.
--   - assignedBrokerId removed — broker lives on Appointment only.
--   - autoUnassignAfter: set by app as DATEADD(month, leadAutoUnassignMonths, NOW()).
--   - pipelineStatus = 'AppointmentBooked' excludes the lead from the Leads list.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Lead')
CREATE TABLE Lead (
    id                      UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),

    -- Personal information
    firstName               NVARCHAR(100)       NOT NULL,
    lastName                NVARCHAR(100)       NOT NULL,
    idNumberEncrypted       NVARCHAR(MAX)       NULL,
    email                   NVARCHAR(255)       NOT NULL,
    mobileNumber            NVARCHAR(20)        NULL,
    whatsappNumber          NVARCHAR(20)        NULL,

    -- Professional information
    universityAttended      NVARCHAR(200)       NULL,
    yearOfAttendance        INT                 NULL,
    degreeAttained          NVARCHAR(200)       NULL,
    occupation              NVARCHAR(200)       NULL,
    hospitalOrPractice      NVARCHAR(300)       NULL,

    -- Insurance information
    existingCover           BIT                 NULL,
    currentInsurer          NVARCHAR(200)       NULL,
    policies                NVARCHAR(500)       NULL,
    medicalAid              BIT                 NULL,
    medicalAidProvider      NVARCHAR(200)       NULL,

    -- Lead source — exactly one of these four should be non-null
    linkedEventId           UNIQUEIDENTIFIER    NULL,
    linkedSubscriptionId    UNIQUEIDENTIFIER    NULL,
    csvImportBatchId        UNIQUEIDENTIFIER    NULL,
    manualSourceName        NVARCHAR(300)       NULL,

    -- Pipeline
    pipelineStatus          NVARCHAR(50)        NOT NULL DEFAULT 'Unassigned',
    assignedAgentId         UNIQUEIDENTIFIER    NULL,
    autoUnassignAfter       DATETIMEOFFSET      NULL,

    -- Audit
    createdById             UNIQUEIDENTIFIER    NULL,
    createdAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt               DATETIMEOFFSET      NULL,

    CONSTRAINT PK_Lead              PRIMARY KEY (id),
    CONSTRAINT FK_Lead_Event        FOREIGN KEY (linkedEventId)        REFERENCES Event(id),
    CONSTRAINT FK_Lead_Subscription FOREIGN KEY (linkedSubscriptionId) REFERENCES MedicalSubscription(id),
    CONSTRAINT FK_Lead_ImportBatch  FOREIGN KEY (csvImportBatchId)     REFERENCES CsvImportBatch(id),
    CONSTRAINT FK_Lead_Agent        FOREIGN KEY (assignedAgentId)      REFERENCES [User](id),
    CONSTRAINT FK_Lead_CreatedBy    FOREIGN KEY (createdById)          REFERENCES [User](id),
    CONSTRAINT CK_Lead_Status       CHECK (pipelineStatus IN (
        'Unassigned', 'Assigned', 'InProgress', 'AppointmentBooked',
        'Progressed', 'ClosedWon', 'ClosedLost', 'Uncontactable'
    )),
    CONSTRAINT CK_Lead_Year         CHECK (
        yearOfAttendance IS NULL
        OR (yearOfAttendance >= 1960 AND yearOfAttendance <= 2100)
    )
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_PipelineStatus')
    CREATE INDEX IX_Lead_PipelineStatus
        ON Lead (pipelineStatus) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_AssignedAgentId')
    CREATE INDEX IX_Lead_AssignedAgentId
        ON Lead (assignedAgentId) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_Email')
    CREATE INDEX IX_Lead_Email
        ON Lead (email) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_LinkedEventId')
    CREATE INDEX IX_Lead_LinkedEventId
        ON Lead (linkedEventId) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_Occupation')
    CREATE INDEX IX_Lead_Occupation
        ON Lead (occupation) WHERE deletedAt IS NULL;

-- Used by the auto-unassign scheduled job
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_AutoUnassign')
    CREATE INDEX IX_Lead_AutoUnassign
        ON Lead (autoUnassignAfter)
        WHERE deletedAt IS NULL
          AND pipelineStatus NOT IN ('ClosedWon','ClosedLost','Uncontactable','AppointmentBooked');

-- =============================================================================
-- SECTION 8 — CALL ATTEMPTS
--
-- callTime: system-set on INSERT; never accepted from client payload.
-- Outcomes: 'Interested' removed; 'AppointmentBooked' adds appointment fields.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CallAttempt')
CREATE TABLE CallAttempt (
    id                      UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    leadId                  UNIQUEIDENTIFIER    NOT NULL,
    agentId                 UNIQUEIDENTIFIER    NOT NULL,
    outcome                 NVARCHAR(50)        NOT NULL,
    callTime                DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    notes                   NVARCHAR(2000)      NULL,
    followUpDateTime        DATETIMEOFFSET      NULL,
    -- Populated when outcome = 'AppointmentBooked'
    appointmentDate         DATE                NULL,
    appointmentTime         TIME                NULL,
    appointmentAddress      NVARCHAR(500)       NULL,
    appointmentPortfolio    NVARCHAR(100)       NULL,
    currentInsurer          NVARCHAR(200)       NULL,
    CONSTRAINT PK_CallAttempt           PRIMARY KEY (id),
    CONSTRAINT FK_CallAttempt_Lead      FOREIGN KEY (leadId)  REFERENCES Lead(id),
    CONSTRAINT FK_CallAttempt_Agent     FOREIGN KEY (agentId) REFERENCES [User](id),
    CONSTRAINT CK_CallAttempt_Outcome   CHECK (outcome IN (
        'NoAnswer', 'Voicemail', 'WrongNumber',
        'CallbackRequested', 'NotInterested', 'AppointmentBooked'
    ))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CallAttempt_LeadId')
    CREATE INDEX IX_CallAttempt_LeadId ON CallAttempt (leadId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CallAttempt_FollowUp')
    CREATE INDEX IX_CallAttempt_FollowUp
        ON CallAttempt (followUpDateTime)
        WHERE followUpDateTime IS NOT NULL;

-- =============================================================================
-- SECTION 9 — APPOINTMENTS
--
-- 1:1 with Lead enforced by UNIQUE (leadId).
-- v2.1: status CHECK updated to include 'Claimed' for Phase 2 broker self-service.
--        'Claimed' is not yet set by any application code — it is stubbed here
--        so the schema does not require a migration when Phase 2 goes live.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Appointment')
CREATE TABLE Appointment (
    id                          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    leadId                      UNIQUEIDENTIFIER    NOT NULL,

    -- Ownership
    -- Status values:
    --   Unassigned — booked but no broker assigned yet
    --   Assigned   — broker manually assigned by admin/supervisor
    --   Claimed    — (Phase 2) broker claimed via self-service token mechanism
    status                      NVARCHAR(50)        NOT NULL DEFAULT 'Unassigned',
    agentId                     UNIQUEIDENTIFIER    NOT NULL,
    brokerId                    UNIQUEIDENTIFIER    NULL,
    portfolioId                 UNIQUEIDENTIFIER    NOT NULL,

    -- First appointment logistics
    firstAppointmentDate        DATE                NOT NULL,
    firstAppointmentTime        TIME                NOT NULL,
    firstAppointmentAddress     NVARCHAR(500)       NULL,
    m365EventId                 NVARCHAR(500)       NULL,

    -- Booking capture
    productsInterestedIn        NVARCHAR(MAX)       NULL,
    currentInsurer              NVARCHAR(200)       NULL,

    -- First meeting
    meeting1Date                DATE                NULL,
    meeting1Status              NVARCHAR(50)        NULL,
    meeting1RescheduledDateTime DATETIMEOFFSET      NULL,
    meeting1Feedback            NVARCHAR(2000)      NULL,

    -- Second meeting
    meeting2Date                DATE                NULL,
    meeting2Status              NVARCHAR(50)        NULL,
    meeting2RescheduledDateTime DATETIMEOFFSET      NULL,
    meeting2Feedback            NVARCHAR(2000)      NULL,

    -- Third meeting (optional)
    meeting3Date                DATE                NULL,
    meeting3Status              NVARCHAR(50)        NULL,
    meeting3RescheduledDateTime DATETIMEOFFSET      NULL,
    meeting3Feedback            NVARCHAR(2000)      NULL,

    -- Outcome
    customerSigned              BIT                 NULL,
    isBrokerSwitch              BIT                 NULL,

    -- Phase 2 claim fields (populated when status = 'Claimed')
    claimedByBrokerId           UNIQUEIDENTIFIER    NULL,
    claimedAt                   DATETIMEOFFSET      NULL,
    -- Token deducted for this claim (0 = free allocation, 1+ = paid)
    claimTokenCost              INT                 NULL DEFAULT 0,

    -- Audit
    createdAt                   DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt                   DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT PK_Appointment               PRIMARY KEY (id),
    CONSTRAINT UQ_Appointment_LeadId        UNIQUE (leadId),
    CONSTRAINT FK_Appointment_Lead          FOREIGN KEY (leadId)            REFERENCES Lead(id),
    CONSTRAINT FK_Appointment_Agent         FOREIGN KEY (agentId)           REFERENCES [User](id),
    CONSTRAINT FK_Appointment_Broker        FOREIGN KEY (brokerId)          REFERENCES [User](id),
    CONSTRAINT FK_Appointment_ClaimedBy     FOREIGN KEY (claimedByBrokerId) REFERENCES [User](id),
    CONSTRAINT FK_Appointment_Portfolio     FOREIGN KEY (portfolioId)       REFERENCES Portfolio(id),
    CONSTRAINT CK_Appointment_Status        CHECK (status IN ('Unassigned', 'Assigned', 'Claimed')),
    CONSTRAINT CK_Appointment_M1Status      CHECK (meeting1Status IS NULL OR meeting1Status IN ('Seen', 'Rescheduled', 'Cancelled')),
    CONSTRAINT CK_Appointment_M2Status      CHECK (meeting2Status IS NULL OR meeting2Status IN ('Seen', 'Rescheduled', 'Cancelled')),
    CONSTRAINT CK_Appointment_M3Status      CHECK (meeting3Status IS NULL OR meeting3Status IN ('Seen', 'Rescheduled', 'Cancelled'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_BrokerDate')
    CREATE INDEX IX_Appointment_BrokerDate
        ON Appointment (brokerId, firstAppointmentDate)
        WHERE status IN ('Assigned', 'Claimed');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_LeadId')
    CREATE INDEX IX_Appointment_LeadId ON Appointment (leadId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_Status')
    CREATE INDEX IX_Appointment_Status ON Appointment (status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_Portfolio')
    CREATE INDEX IX_Appointment_Portfolio ON Appointment (portfolioId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_FirstDate')
    CREATE INDEX IX_Appointment_FirstDate ON Appointment (firstAppointmentDate)
    WHERE status IN ('Assigned', 'Claimed');

-- Unassigned appointments available for broker claiming — used by the Phase 2
-- available-to-claim query (filter by portfolio and broker region)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_Unassigned')
    CREATE INDEX IX_Appointment_Unassigned ON Appointment (portfolioId, firstAppointmentDate)
    WHERE status = 'Unassigned';

-- =============================================================================
-- SECTION 10 — APPOINTMENT PRODUCTS
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AppointmentProduct')
CREATE TABLE AppointmentProduct (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    appointmentId   UNIQUEIDENTIFIER    NOT NULL,
    productId       UNIQUEIDENTIFIER    NOT NULL,
    CONSTRAINT PK_AppointmentProduct            PRIMARY KEY (id),
    CONSTRAINT FK_AppointmentProduct_Appt       FOREIGN KEY (appointmentId) REFERENCES Appointment(id),
    CONSTRAINT FK_AppointmentProduct_Product    FOREIGN KEY (productId)     REFERENCES Product(id),
    CONSTRAINT UQ_AppointmentProduct            UNIQUE (appointmentId, productId)
);

-- =============================================================================
-- SECTION 11 — EVENTS AND EVENT ATTENDEES
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventAttendee')
CREATE TABLE EventAttendee (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    eventId         UNIQUEIDENTIFIER    NOT NULL,
    leadId          UNIQUEIDENTIFIER    NOT NULL,
    rsvp            BIT                 NOT NULL DEFAULT 0,
    attended        BIT                 NOT NULL DEFAULT 0,
    attendedAt      DATETIMEOFFSET      NULL,
    popiConsent     BIT                 NOT NULL DEFAULT 0,
    registeredAt    DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt       DATETIMEOFFSET      NULL,
    CONSTRAINT PK_EventAttendee         PRIMARY KEY (id),
    CONSTRAINT FK_EventAttendee_Event   FOREIGN KEY (eventId) REFERENCES Event(id),
    CONSTRAINT FK_EventAttendee_Lead    FOREIGN KEY (leadId)  REFERENCES Lead(id),
    CONSTRAINT UQ_EventAttendee         UNIQUE (eventId, leadId)
);

-- =============================================================================
-- SECTION 12 — NOTIFICATIONS
--
-- v2.1: 'AppointmentAvailable' type added for Phase 2 broker claim notifications.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Notification')
CREATE TABLE Notification (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    recipientId     UNIQUEIDENTIFIER    NOT NULL,
    -- type values:
    --   LeadAssigned          — agent receives when a lead is assigned to them
    --   AppointmentAssigned   — broker receives when assigned to an appointment
    --   AppointmentReminder   — daily digest of upcoming appointments
    --   CallbackReminder      — agent reminder for a CallbackRequested follow-up
    --   RescheduleReminder    — agent/broker reminder when a meeting is rescheduled
    --   LeadAutoReturned      — supervisor notified when lead auto-returns to queue
    --   AppointmentAvailable  — (Phase 2) broker notified of claimable appointment
    type            NVARCHAR(100)       NOT NULL,
    title           NVARCHAR(300)       NOT NULL,
    body            NVARCHAR(2000)      NOT NULL,
    entityType      NVARCHAR(50)        NULL,
    entityId        NVARCHAR(100)       NULL,
    isRead          BIT                 NOT NULL DEFAULT 0,
    emailSent       BIT                 NOT NULL DEFAULT 0,
    emailSentAt     DATETIMEOFFSET      NULL,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Notification              PRIMARY KEY (id),
    CONSTRAINT FK_Notification_Recipient    FOREIGN KEY (recipientId) REFERENCES [User](id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_Recipient')
    CREATE INDEX IX_Notification_Recipient
        ON Notification (recipientId, isRead, createdAt DESC);

-- =============================================================================
-- SECTION 13 — TASKS (Phase 2 stub)
--
-- Tasks are generated from appointment events, callback requests, and rescheduling
-- actions. Not yet populated by any application logic — stubbed here so Phase 2
-- requires only application code changes, not a schema migration.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Task')
CREATE TABLE Task (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    -- The user this task is assigned to (agent or broker)
    assignedToId    UNIQUEIDENTIFIER    NOT NULL,
    -- The lead or appointment this task relates to
    entityType      NVARCHAR(50)        NOT NULL,   -- 'Lead' | 'Appointment'
    entityId        UNIQUEIDENTIFIER    NOT NULL,
    -- Type controls the task icon and category filter in the UI
    -- Values: 'Callback' | 'Appointment' | 'Reschedule' | 'Reminder' | 'Outcome'
    type            NVARCHAR(50)        NOT NULL,
    title           NVARCHAR(300)       NOT NULL,
    detail          NVARCHAR(1000)      NULL,
    dueAt           DATETIMEOFFSET      NULL,
    isComplete      BIT                 NOT NULL DEFAULT 0,
    completedAt     DATETIMEOFFSET      NULL,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Task              PRIMARY KEY (id),
    CONSTRAINT FK_Task_AssignedTo   FOREIGN KEY (assignedToId) REFERENCES [User](id),
    CONSTRAINT CK_Task_EntityType   CHECK (entityType IN ('Lead', 'Appointment')),
    CONSTRAINT CK_Task_Type         CHECK (type IN ('Callback', 'Appointment', 'Reschedule', 'Reminder', 'Outcome'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Task_AssignedTo')
    CREATE INDEX IX_Task_AssignedTo
        ON Task (assignedToId, isComplete, dueAt)
        WHERE isComplete = 0;

-- =============================================================================
-- SECTION 14 — TOKEN LEDGER (Phase 2 stub)
--
-- Records the token balance for each broker and tracks each credit/debit.
-- Not yet populated by any application logic — stubbed for Phase 2.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TokenLedger')
CREATE TABLE TokenLedger (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    brokerId        UNIQUEIDENTIFIER    NOT NULL,
    -- Current token balance. Maintained as a running total; recomputable
    -- from TokenTransaction history if correction is needed.
    balance         INT                 NOT NULL DEFAULT 0,
    -- Free appointments remaining this month (resets on 1st of each month)
    freeRemaining   INT                 NOT NULL DEFAULT 10,
    periodStart     DATE                NOT NULL,   -- first day of current month
    updatedAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_TokenLedger           PRIMARY KEY (id),
    CONSTRAINT FK_TokenLedger_Broker    FOREIGN KEY (brokerId) REFERENCES [User](id),
    CONSTRAINT UQ_TokenLedger_Broker    UNIQUE (brokerId)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TokenTransaction')
CREATE TABLE TokenTransaction (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    brokerId        UNIQUEIDENTIFIER    NOT NULL,
    -- type: 'Credit' = tokens purchased or incentive award; 'Debit' = claim cost
    type            NVARCHAR(20)        NOT NULL,
    amount          INT                 NOT NULL,   -- positive for Credit, negative for Debit
    -- Reference to the appointment that triggered a Debit, or NULL for Credits
    appointmentId   UNIQUEIDENTIFIER    NULL,
    description     NVARCHAR(300)       NOT NULL,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_TokenTransaction              PRIMARY KEY (id),
    CONSTRAINT FK_TokenTransaction_Broker       FOREIGN KEY (brokerId)      REFERENCES [User](id),
    CONSTRAINT FK_TokenTransaction_Appointment  FOREIGN KEY (appointmentId) REFERENCES Appointment(id),
    CONSTRAINT CK_TokenTransaction_Type         CHECK (type IN ('Credit', 'Debit'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TokenTransaction_Broker')
    CREATE INDEX IX_TokenTransaction_Broker
        ON TokenTransaction (brokerId, createdAt DESC);

-- =============================================================================
-- SECTION 15 — AUDIT LOG
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuditLog')
CREATE TABLE AuditLog (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    entityType      NVARCHAR(100)       NOT NULL,
    entityId        NVARCHAR(100)       NOT NULL,
    action          NVARCHAR(100)       NOT NULL,
    performedById   UNIQUEIDENTIFIER    NULL,
    performedAt     DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    changeDetail    NVARCHAR(MAX)       NULL,
    ipAddress       NVARCHAR(50)        NULL,
    CONSTRAINT PK_AuditLog PRIMARY KEY (id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_Entity')
    CREATE INDEX IX_AuditLog_Entity ON AuditLog (entityType, entityId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_PerformedAt')
    CREATE INDEX IX_AuditLog_PerformedAt ON AuditLog (performedAt DESC);

-- =============================================================================
-- SECTION 16 — SEED DATA
-- All MERGE statements are idempotent — safe to re-run at any time.
-- Fixed GUIDs ensure application code and future migrations can reference
-- known IDs without a lookup query.
-- =============================================================================

-- Regions
MERGE Region AS target
USING (VALUES
    ('Gauteng',       'Gauteng'),
    ('WesternCape',   'Western Cape'),
    ('KwaZuluNatal',  'KwaZulu-Natal'),
    ('EasternCape',   'Eastern Cape'),
    ('Limpopo',       'Limpopo'),
    ('Mpumalanga',    'Mpumalanga'),
    ('NorthWest',     'North West'),
    ('NorthernCape',  'Northern Cape'),
    ('FreeState',     'Free State')
) AS source (id, label)
ON target.id = source.id
WHEN NOT MATCHED THEN INSERT (id, label) VALUES (source.id, source.label);

-- Portfolios
MERGE Portfolio AS target
USING (VALUES
    ('A0000000-0001-0000-0000-000000000001', 'Discovery'),
    ('A0000000-0001-0000-0000-000000000002', 'Money and Medicine')
) AS source (id, name)
ON target.id = source.id
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (source.id, source.name);

-- Products
MERGE Product AS target
USING (VALUES
    -- Discovery (10 products)
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
    -- Money and Medicine (3 products)
    ('B0000000-0001-0000-0000-000000000011', 'A0000000-0001-0000-0000-000000000002', 'Unit Trust',            1),
    ('B0000000-0001-0000-0000-000000000012', 'A0000000-0001-0000-0000-000000000002', 'TFSA',                  2),
    ('B0000000-0001-0000-0000-000000000013', 'A0000000-0001-0000-0000-000000000002', 'Endowment Policy',      3)
) AS source (id, portfolioId, name, displayOrder)
ON target.id = source.id
WHEN NOT MATCHED THEN
    INSERT (id, portfolioId, name, displayOrder)
    VALUES (source.id, source.portfolioId, source.name, source.displayOrder);

-- Medical Subscriptions — initial set matching the UI dropdown
-- (v2.1 addition — was missing from previous seed)
MERGE MedicalSubscription AS target
USING (VALUES
    ('C0000000-0001-0000-0000-000000000001', 'MedLeads SA — Monthly Bundle',   'MedLeads SA (Pty) Ltd'),
    ('C0000000-0001-0000-0000-000000000002', 'Healthwise Doctor Database',     'Healthwise Data'),
    ('C0000000-0001-0000-0000-000000000003', 'SA Medical Register — Q2 2026', 'HPCSA Data Services')
) AS source (id, name, providerName)
ON target.id = source.id
WHEN NOT MATCHED THEN INSERT (id, name, providerName) VALUES (source.id, source.name, source.providerName);

-- =============================================================================
-- SECTION 17 — APPLICATION USER PERMISSIONS
-- Run AFTER the Managed Identity user has been created:
--   CREATE USER [medbroker-api-prod] FROM EXTERNAL PROVIDER;
-- Then uncomment and execute the GRANT block.
-- =============================================================================

/*
-- Reference / lookup (read-only for app)
GRANT SELECT ON Region              TO [medbroker-api-prod];
GRANT SELECT ON Portfolio           TO [medbroker-api-prod];
GRANT SELECT ON Product             TO [medbroker-api-prod];
GRANT SELECT ON MedicalSubscription TO [medbroker-api-prod];
GRANT SELECT ON SystemConfig        TO [medbroker-api-prod];

-- Users
GRANT SELECT, INSERT, UPDATE ON [User]          TO [medbroker-api-prod];
GRANT SELECT, INSERT, UPDATE ON UserPortfolio   TO [medbroker-api-prod];
GRANT SELECT, INSERT, UPDATE ON BrokerRegion    TO [medbroker-api-prod];
GRANT SELECT, INSERT, UPDATE ON BrokerProduct   TO [medbroker-api-prod];

-- Lead pipeline
GRANT SELECT, INSERT, UPDATE ON Lead            TO [medbroker-api-prod];
GRANT SELECT, INSERT         ON CallAttempt     TO [medbroker-api-prod];
GRANT SELECT, INSERT         ON CsvImportBatch  TO [medbroker-api-prod];

-- Appointments
GRANT SELECT, INSERT, UPDATE ON Appointment         TO [medbroker-api-prod];
GRANT SELECT, INSERT, DELETE ON AppointmentProduct  TO [medbroker-api-prod];

-- Events
GRANT SELECT, INSERT, UPDATE ON Event           TO [medbroker-api-prod];
GRANT SELECT, INSERT, UPDATE ON EventAttendee   TO [medbroker-api-prod];

-- Notifications
GRANT SELECT, INSERT, UPDATE ON Notification    TO [medbroker-api-prod];

-- Tasks (Phase 2 — grant now so no permission change needed at go-live)
GRANT SELECT, INSERT, UPDATE ON Task            TO [medbroker-api-prod];

-- Token ledger (Phase 2)
GRANT SELECT, INSERT, UPDATE ON TokenLedger         TO [medbroker-api-prod];
GRANT SELECT, INSERT         ON TokenTransaction    TO [medbroker-api-prod];

-- Admin-configurable reference data (admin role only; enforced at app layer)
GRANT INSERT, UPDATE ON MedicalSubscription TO [medbroker-api-prod];
GRANT INSERT, UPDATE ON Portfolio           TO [medbroker-api-prod];
GRANT INSERT, UPDATE ON Product             TO [medbroker-api-prod];
GRANT UPDATE         ON SystemConfig        TO [medbroker-api-prod];

-- Audit log is strictly append-only
GRANT INSERT ON AuditLog TO [medbroker-api-prod];
*/

-- =============================================================================
-- SECTION 18 — VERIFICATION
-- =============================================================================

SELECT
    t.name              AS TableName,
    p.rows              AS RowCount,
    SUM(a.total_pages) * 8  AS TotalSizeKB
FROM sys.tables t
JOIN sys.indexes i          ON t.object_id   = i.object_id
JOIN sys.partitions p       ON i.object_id   = p.object_id
                           AND i.index_id    = p.index_id
JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE i.index_id IN (0, 1)
GROUP BY t.name, p.rows
ORDER BY t.name;
