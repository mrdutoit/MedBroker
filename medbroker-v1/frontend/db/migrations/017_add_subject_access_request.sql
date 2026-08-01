-- 017_add_subject_access_request.sql
-- POPIA Subject Access Request tracking (§79). A SAR is always tied to
-- a Lead — MedBroker's primary holder of personal information about a
-- data subject. If someone requesting access isn't in the system as a
-- Lead at all, there's nothing here to compile in the first place, so
-- leadId is required, not optional.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS SubjectAccessRequest (
    id             UUID          NOT NULL DEFAULT gen_random_uuid(),
    organisationId UUID          NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    leadId         UUID          NOT NULL,
    requestorName  VARCHAR(200)  NOT NULL,
    requestorEmail VARCHAR(255)  NOT NULL,
    receivedAt     DATE          NOT NULL,
    dueDate        DATE          NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'Received',
    notes          VARCHAR(2000) NULL,
    fulfilledAt    TIMESTAMPTZ   NULL,
    fulfilledById  UUID          NULL,
    createdById    UUID          NOT NULL,
    createdAt      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updatedAt      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_SubjectAccessRequest         PRIMARY KEY (id),
    CONSTRAINT FK_SubjectAccessRequest_Org     FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_SubjectAccessRequest_Lead    FOREIGN KEY (leadId) REFERENCES Lead(id),
    CONSTRAINT FK_SubjectAccessRequest_Creator FOREIGN KEY (createdById) REFERENCES "User"(id),
    CONSTRAINT FK_SubjectAccessRequest_Fulfiller FOREIGN KEY (fulfilledById) REFERENCES "User"(id),
    CONSTRAINT CK_SubjectAccessRequest_Status  CHECK (status IN ('Received', 'InProgress', 'Fulfilled', 'Rejected'))
);

CREATE INDEX IF NOT EXISTS IX_SubjectAccessRequest_Lead ON SubjectAccessRequest (leadId);
CREATE INDEX IF NOT EXISTS IX_SubjectAccessRequest_Status ON SubjectAccessRequest (organisationId, status);
