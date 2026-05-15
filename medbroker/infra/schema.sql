-- =============================================================================
-- MedBroker Lead Management System — Database Schema
-- Target:  Azure SQL (SQL Server compatible)
-- Created: 2026-05
-- Version: 1.0
--
-- Instructions:
--   1. Connect to your Azure SQL database in Azure Data Studio or SSMS
--   2. Open this file and execute it (F5 or Run)
--   3. Run the full script in one pass — it is safe to re-run (checks exist first)
--   4. After creation, grant your app user permissions (see bottom of file)
-- =============================================================================

-- Run all statements in the medbroker database context
-- If running from SSMS, ensure you are connected to the correct database first.

-- =============================================================================
-- SECTION 1 — LOOKUP / REFERENCE TABLES
-- Create these first as other tables reference them via FK constraints.
-- =============================================================================

-- ProductType — the insurance product types MedBroker sells
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductType')
CREATE TABLE ProductType (
    id          NVARCHAR(50)    NOT NULL,   -- e.g. 'PersonalInsurance', 'PracticeInsurance', 'Malpractice'
    label       NVARCHAR(200)   NOT NULL,
    isActive    BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductType PRIMARY KEY (id)
);

-- Region — geographic regions used for broker matching
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Region')
CREATE TABLE Region (
    id          NVARCHAR(50)    NOT NULL,   -- e.g. 'Gauteng', 'WesternCape', 'KwaZuluNatal'
    label       NVARCHAR(200)   NOT NULL,
    isActive    BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Region PRIMARY KEY (id)
);

-- =============================================================================
-- SECTION 2 — USERS
-- Covers agents, supervisors, admins, and brokers — all in one table, role-differentiated.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'User')
CREATE TABLE [User] (
    id                  UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    entraObjectId       NVARCHAR(100)       NOT NULL,   -- Entra ID object ID (oid claim from JWT)
    displayName         NVARCHAR(200)       NOT NULL,
    email               NVARCHAR(255)       NOT NULL,
    mobileNumber        NVARCHAR(20)        NULL,
    role                NVARCHAR(50)        NOT NULL,   -- 'Admin' | 'Supervisor' | 'Agent' | 'Broker'
    isActive            BIT                 NOT NULL DEFAULT 1,
    -- Broker-specific fields (NULL for non-broker roles)
    calendlyEventTypeUri    NVARCHAR(500)   NULL,       -- Calendly event type URI for availability lookup
    createdAt           DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt           DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt           DATETIMEOFFSET      NULL,
    CONSTRAINT PK_User PRIMARY KEY (id),
    CONSTRAINT UQ_User_EntraObjectId UNIQUE (entraObjectId),
    CONSTRAINT UQ_User_Email UNIQUE (email),
    CONSTRAINT CK_User_Role CHECK (role IN ('Admin', 'Supervisor', 'Agent', 'Broker'))
);

-- Broker region assignments — one broker can cover multiple regions
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BrokerRegion')
CREATE TABLE BrokerRegion (
    id          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    brokerId    UNIQUEIDENTIFIER    NOT NULL,
    region      NVARCHAR(50)        NOT NULL,
    CONSTRAINT PK_BrokerRegion PRIMARY KEY (id),
    CONSTRAINT FK_BrokerRegion_User FOREIGN KEY (brokerId) REFERENCES [User](id),
    CONSTRAINT UQ_BrokerRegion UNIQUE (brokerId, region)
);

-- Broker product specialisations — one broker can specialise in multiple products
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BrokerProduct')
CREATE TABLE BrokerProduct (
    id          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    brokerId    UNIQUEIDENTIFIER    NOT NULL,
    productType NVARCHAR(50)        NOT NULL,
    CONSTRAINT PK_BrokerProduct PRIMARY KEY (id),
    CONSTRAINT FK_BrokerProduct_User FOREIGN KEY (brokerId) REFERENCES [User](id),
    CONSTRAINT UQ_BrokerProduct UNIQUE (brokerId, productType)
);

-- =============================================================================
-- SECTION 3 — EVENTS
-- Create before Lead so Lead can reference linkedEventId.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Event')
CREATE TABLE Event (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    name            NVARCHAR(300)       NOT NULL,
    description     NVARCHAR(2000)      NULL,
    eventDate       DATE                NOT NULL,
    venue           NVARCHAR(300)       NULL,
    university      NVARCHAR(200)       NULL,
    status          NVARCHAR(50)        NOT NULL DEFAULT 'Draft',   -- 'Draft' | 'Active' | 'Closed' | 'Cancelled'
    qrToken         UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),   -- Unique token embedded in the QR code
    createdById     UNIQUEIDENTIFIER    NULL,
    createdAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt       DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt       DATETIMEOFFSET      NULL,
    CONSTRAINT PK_Event PRIMARY KEY (id),
    CONSTRAINT UQ_Event_QrToken UNIQUE (qrToken),
    CONSTRAINT FK_Event_CreatedBy FOREIGN KEY (createdById) REFERENCES [User](id),
    CONSTRAINT CK_Event_Status CHECK (status IN ('Draft', 'Active', 'Closed', 'Cancelled'))
);

-- =============================================================================
-- SECTION 4 — LEADS
-- The primary entity. References Event for linkedEventId.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Lead')
CREATE TABLE Lead (
    id                      UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),

    -- Personal information
    firstName               NVARCHAR(100)       NOT NULL,
    lastName                NVARCHAR(100)       NOT NULL,
    -- id_number is stored encrypted (AES-256-CBC via Key Vault).
    -- The column holds a base64-encoded blob — never plaintext.
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
    policies                NVARCHAR(500)       NULL,
    medicalAid              BIT                 NULL,
    medicalAidProvider      NVARCHAR(200)       NULL,

    -- System fields
    leadSource              NVARCHAR(50)        NOT NULL DEFAULT 'ManualEntry',
    linkedEventId           UNIQUEIDENTIFIER    NULL,
    pipelineStatus          NVARCHAR(50)        NOT NULL DEFAULT 'Unassigned',
    assignedAgentId         UNIQUEIDENTIFIER    NULL,
    assignedBrokerId        UNIQUEIDENTIFIER    NULL,
    createdById             UNIQUEIDENTIFIER    NULL,   -- NULL for public event registrations

    createdAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt               DATETIMEOFFSET      NULL,   -- Soft delete — POPIA right to erasure

    CONSTRAINT PK_Lead PRIMARY KEY (id),
    CONSTRAINT FK_Lead_Event        FOREIGN KEY (linkedEventId)    REFERENCES Event(id),
    CONSTRAINT FK_Lead_Agent        FOREIGN KEY (assignedAgentId)  REFERENCES [User](id),
    CONSTRAINT FK_Lead_Broker       FOREIGN KEY (assignedBrokerId) REFERENCES [User](id),
    CONSTRAINT FK_Lead_CreatedBy    FOREIGN KEY (createdById)      REFERENCES [User](id),
    CONSTRAINT CK_Lead_LeadSource   CHECK (leadSource IN ('EventAttendance', 'CSVImport', 'ManualEntry', 'Referral', 'WebForm')),
    CONSTRAINT CK_Lead_Status       CHECK (pipelineStatus IN (
        'Unassigned', 'Assigned', 'InProgress', 'AppointmentBooked',
        'Progressed', 'ClosedWon', 'ClosedLost', 'Uncontactable'
    )),
    CONSTRAINT CK_Lead_YearOfAttendance CHECK (yearOfAttendance IS NULL OR (yearOfAttendance >= 1980 AND yearOfAttendance <= 2100))
);

-- Indexes for common query patterns
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_PipelineStatus')
    CREATE INDEX IX_Lead_PipelineStatus ON Lead (pipelineStatus) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_AssignedAgentId')
    CREATE INDEX IX_Lead_AssignedAgentId ON Lead (assignedAgentId) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_Email')
    CREATE INDEX IX_Lead_Email ON Lead (email) WHERE deletedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Lead_LinkedEventId')
    CREATE INDEX IX_Lead_LinkedEventId ON Lead (linkedEventId) WHERE deletedAt IS NULL;

-- =============================================================================
-- SECTION 5 — CALL ATTEMPTS
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CallAttempt')
CREATE TABLE CallAttempt (
    id                  UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    leadId              UNIQUEIDENTIFIER    NOT NULL,
    agentId             UNIQUEIDENTIFIER    NOT NULL,
    outcome             NVARCHAR(50)        NOT NULL,
    notes               NVARCHAR(2000)      NULL,
    callbackDateTime    DATETIMEOFFSET      NULL,
    attemptedAt         DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_CallAttempt PRIMARY KEY (id),
    CONSTRAINT FK_CallAttempt_Lead  FOREIGN KEY (leadId)  REFERENCES Lead(id),
    CONSTRAINT FK_CallAttempt_Agent FOREIGN KEY (agentId) REFERENCES [User](id),
    CONSTRAINT CK_CallAttempt_Outcome CHECK (outcome IN (
        'NoAnswer', 'Voicemail', 'WrongNumber', 'CallbackRequested',
        'NotInterested', 'Interested', 'AppointmentBooked'
    ))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CallAttempt_LeadId')
    CREATE INDEX IX_CallAttempt_LeadId ON CallAttempt (leadId);

-- =============================================================================
-- SECTION 6 — APPOINTMENTS
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Appointment')
CREATE TABLE Appointment (
    id                      UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    leadId                  UNIQUEIDENTIFIER    NOT NULL,
    brokerId                UNIQUEIDENTIFIER    NOT NULL,
    agentId                 UNIQUEIDENTIFIER    NOT NULL,   -- Agent who booked the appointment
    appointmentType         NVARCHAR(50)        NOT NULL DEFAULT 'First',   -- 'First' | 'Closeout'
    scheduledAt             DATETIMEOFFSET      NOT NULL,
    status                  NVARCHAR(50)        NOT NULL DEFAULT 'Scheduled',
    calendlyEventUri        NVARCHAR(500)       NULL,       -- Calendly event URI if booked via Calendly
    notes                   NVARCHAR(2000)      NULL,
    createdAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt               DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Appointment PRIMARY KEY (id),
    CONSTRAINT FK_Appointment_Lead   FOREIGN KEY (leadId)   REFERENCES Lead(id),
    CONSTRAINT FK_Appointment_Broker FOREIGN KEY (brokerId) REFERENCES [User](id),
    CONSTRAINT FK_Appointment_Agent  FOREIGN KEY (agentId)  REFERENCES [User](id),
    CONSTRAINT CK_Appointment_Type   CHECK (appointmentType IN ('First', 'Closeout')),
    CONSTRAINT CK_Appointment_Status CHECK (status IN ('Scheduled', 'Completed', 'Cancelled', 'NoShow'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_BrokerId')
    CREATE INDEX IX_Appointment_BrokerId ON Appointment (brokerId, scheduledAt)
    WHERE status NOT IN ('Cancelled', 'NoShow');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Appointment_LeadId')
    CREATE INDEX IX_Appointment_LeadId ON Appointment (leadId);

-- =============================================================================
-- SECTION 7 — DEALS
-- Created when a lead reaches Closed Won or Closed Lost.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Deal')
CREATE TABLE Deal (
    id                  UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    leadId              UNIQUEIDENTIFIER    NOT NULL,
    brokerId            UNIQUEIDENTIFIER    NOT NULL,
    outcome             NVARCHAR(50)        NOT NULL,       -- 'ClosedWon' | 'ClosedLost'
    -- policyValue is mandatory when outcome = 'ClosedWon' — enforced at application layer
    policyValue         DECIMAL(12, 2)      NULL,
    lostReason          NVARCHAR(500)       NULL,
    notes               NVARCHAR(2000)      NULL,
    zohoCrmContactId    NVARCHAR(100)       NULL,           -- Zoho CRM contact ID after push
    zohoCrmDealId       NVARCHAR(100)       NULL,           -- Zoho CRM deal ID after push
    crmPushedAt         DATETIMEOFFSET      NULL,
    closedAt            DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    createdAt           DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Deal PRIMARY KEY (id),
    CONSTRAINT FK_Deal_Lead   FOREIGN KEY (leadId)   REFERENCES Lead(id),
    CONSTRAINT FK_Deal_Broker FOREIGN KEY (brokerId) REFERENCES [User](id),
    CONSTRAINT CK_Deal_Outcome CHECK (outcome IN ('ClosedWon', 'ClosedLost'))
);

-- =============================================================================
-- SECTION 8 — EVENT ATTENDEES
-- Tracks RSVPs and actual attendance per event per lead.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventAttendee')
CREATE TABLE EventAttendee (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    eventId         UNIQUEIDENTIFIER    NOT NULL,
    leadId          UNIQUEIDENTIFIER    NOT NULL,
    rsvp            BIT                 NOT NULL DEFAULT 0,     -- Was this person on the RSVP list?
    attended        BIT                 NOT NULL DEFAULT 0,     -- Did they actually attend?
    attendedAt      DATETIMEOFFSET      NULL,
    -- POPIA consent captured at point of registration
    popiConsent     BIT                 NOT NULL DEFAULT 0,
    registeredAt    DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    deletedAt       DATETIMEOFFSET      NULL,
    CONSTRAINT PK_EventAttendee PRIMARY KEY (id),
    CONSTRAINT FK_EventAttendee_Event FOREIGN KEY (eventId) REFERENCES Event(id),
    CONSTRAINT FK_EventAttendee_Lead  FOREIGN KEY (leadId)  REFERENCES Lead(id),
    CONSTRAINT UQ_EventAttendee       UNIQUE (eventId, leadId)  -- One record per lead per event
);

-- =============================================================================
-- SECTION 9 — AUDIT LOG
-- Immutable record of all significant system actions (POPIA + FAIS compliance).
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuditLog')
CREATE TABLE AuditLog (
    id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    entityType      NVARCHAR(100)       NOT NULL,   -- e.g. 'Lead', 'Appointment', 'Deal'
    entityId        NVARCHAR(100)       NOT NULL,   -- ID of the affected record
    action          NVARCHAR(100)       NOT NULL,   -- e.g. 'Created', 'Updated', 'Deleted', 'Assigned'
    performedById   UNIQUEIDENTIFIER    NULL,       -- NULL for system actions
    performedAt     DATETIMEOFFSET      NOT NULL DEFAULT GETUTCDATE(),
    -- JSON snapshot of what changed — stored as text for compatibility
    changeDetail    NVARCHAR(MAX)       NULL,
    ipAddress       NVARCHAR(50)        NULL,
    CONSTRAINT PK_AuditLog PRIMARY KEY (id)
);

-- Note: No FK on performedById — audit log must remain intact even if a user is deleted
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_Entity')
    CREATE INDEX IX_AuditLog_Entity ON AuditLog (entityType, entityId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_PerformedAt')
    CREATE INDEX IX_AuditLog_PerformedAt ON AuditLog (performedAt DESC);

-- =============================================================================
-- SECTION 10 — SEED DATA
-- Reference data required for the system to function.
-- Safe to re-run — uses MERGE to avoid duplicates.
-- =============================================================================

-- Product types
MERGE ProductType AS target
USING (VALUES
    ('PersonalInsurance',   'Personal Insurance'),
    ('PracticeInsurance',   'Practice Insurance'),
    ('Malpractice',         'Malpractice Insurance'),
    ('LifeCover',           'Life Cover'),
    ('DisabilityInsurance', 'Disability Insurance')
) AS source (id, label)
ON target.id = source.id
WHEN NOT MATCHED THEN
    INSERT (id, label) VALUES (source.id, source.label);

-- Regions
MERGE Region AS target
USING (VALUES
    ('Gauteng',         'Gauteng'),
    ('WesternCape',     'Western Cape'),
    ('KwaZuluNatal',    'KwaZulu-Natal'),
    ('EasternCape',     'Eastern Cape'),
    ('Limpopo',         'Limpopo'),
    ('Mpumalanga',      'Mpumalanga'),
    ('NorthWest',       'North West'),
    ('NorthernCape',    'Northern Cape'),
    ('FreeState',       'Free State')
) AS source (id, label)
ON target.id = source.id
WHEN NOT MATCHED THEN
    INSERT (id, label) VALUES (source.id, source.label);

-- =============================================================================
-- SECTION 11 — APPLICATION USER PERMISSIONS
-- Run this AFTER creating the Managed Identity user for the Function App.
-- Replace [medbroker-api-prod] with your Function App name if different.
--
-- To create the Managed Identity user first, run:
--   CREATE USER [medbroker-api-prod] FROM EXTERNAL PROVIDER;
--
-- Then run the GRANT statements below.
-- =============================================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE TO [medbroker-api-prod];
-- (Uncomment and run after the Managed Identity user has been created)

/*
GRANT SELECT  ON [User]          TO [medbroker-api-prod];
GRANT SELECT  ON [BrokerRegion]  TO [medbroker-api-prod];
GRANT SELECT  ON [BrokerProduct] TO [medbroker-api-prod];
GRANT SELECT  ON [ProductType]   TO [medbroker-api-prod];
GRANT SELECT  ON [Region]        TO [medbroker-api-prod];

GRANT SELECT, INSERT, UPDATE ON Lead          TO [medbroker-api-prod];
GRANT SELECT, INSERT         ON CallAttempt   TO [medbroker-api-prod];
GRANT SELECT, INSERT, UPDATE ON Appointment   TO [medbroker-api-prod];
GRANT SELECT, INSERT         ON Deal          TO [medbroker-api-prod];
GRANT SELECT, INSERT         ON Event         TO [medbroker-api-prod];
GRANT SELECT, INSERT, UPDATE ON EventAttendee TO [medbroker-api-prod];
GRANT INSERT                 ON AuditLog      TO [medbroker-api-prod];
*/

-- =============================================================================
-- VERIFICATION
-- Run this block after execution to confirm all tables were created.
-- =============================================================================

SELECT
    t.name          AS TableName,
    p.rows          AS RowCount,
    SUM(a.total_pages) * 8 AS TotalSizeKB
FROM sys.tables t
JOIN sys.indexes i      ON t.object_id = i.object_id
JOIN sys.partitions p   ON i.object_id = p.object_id AND i.index_id = p.index_id
JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE i.index_id IN (0, 1)  -- heap or clustered index only
GROUP BY t.name, p.rows
ORDER BY t.name;
