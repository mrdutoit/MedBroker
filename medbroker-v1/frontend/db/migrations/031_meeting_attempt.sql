-- Migration 031 — Meeting/Appointment attempt-history redesign
-- 14 Aug 2026 (§138 spec, session 20; §164 build, session 23)
--
-- Full reasoning lives in Status_Vercel.md §164. Summary:
--   - Replaces meeting{1,2,3}Date/Status/Feedback (flat columns, a
--     reschedule silently overwrote history in place) with an
--     append-only MeetingAttempt row per attempt, matching CallAttempt's
--     established pattern.
--   - The old columns are NOT dropped here — left in place, unused by
--     application code from this point on, until the backfilled data
--     below is confirmed correct in production. A follow-up cleanup
--     migration drops them.
--   - The old model's third status value, 'Cancelled', has no equivalent
--     in the new four-value status enum — Claude's own reading of the
--     spec: Cancelled and Rescheduled lead to the identical next action
--     (a new row, same meeting number, no outcome form), so both
--     collapse to 'Rescheduled' below.
--   - The genuine judgment call: the old model never distinguished
--     "held, interested" from "held, not interested" at the per-meeting
--     level — only 'Seen'. Inferred here from the appointment's own
--     customerSigned outcome, applied only to whichever meeting number
--     is the LAST one with any data on that appointment (an earlier
--     meeting with data existing at all implies interest was shown,
--     since a follow-up was booked off the back of it) — the closest
--     defensible reconstruction, not a certainty. Flagged as inference,
--     not fact, in the table's own header comment too.

CREATE TABLE IF NOT EXISTS MeetingAttempt (
    id                UUID            NOT NULL DEFAULT gen_random_uuid(),
    organisationId    UUID            NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    appointmentId     UUID            NOT NULL,
    meetingNumber     INT             NOT NULL,
    date              DATE            NULL,
    status            VARCHAR(50)     NOT NULL DEFAULT 'Scheduled',
    followUpRequired  BOOLEAN         NULL,
    notes             VARCHAR(2000)   NULL,
    recordedById      UUID            NULL,
    createdAt         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_MeetingAttempt              PRIMARY KEY (id),
    CONSTRAINT FK_MeetingAttempt_Org          FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_MeetingAttempt_Appointment  FOREIGN KEY (appointmentId)  REFERENCES Appointment(id),
    CONSTRAINT FK_MeetingAttempt_RecordedBy   FOREIGN KEY (recordedById)   REFERENCES "User"(id),
    CONSTRAINT CK_MeetingAttempt_Number       CHECK (meetingNumber IN (1, 2, 3)),
    CONSTRAINT CK_MeetingAttempt_Status       CHECK (status IN ('Scheduled', 'HeldInterested', 'HeldNotInterested', 'Rescheduled'))
);
CREATE INDEX IF NOT EXISTS IX_MeetingAttempt_Appointment ON MeetingAttempt(appointmentId);

-- Backfill. Meeting 1 unconditionally gets a row for every appointment
-- (matches the new model's own invariant — meeting 1 always exists from
-- creation); meetings 2/3 only get a row if they actually have any data
-- in the old columns.
WITH unpivoted AS (
    SELECT a.id AS "appointmentId", a.organisationId, a.customerSigned,
           a.firstAppointmentDate,
           1 AS "meetingNumber", a.meeting1Date AS "oldDate", a.meeting1Status AS "oldStatus", a.meeting1Feedback AS "oldNotes"
    FROM Appointment a
    UNION ALL
    SELECT a.id, a.organisationId, a.customerSigned, a.firstAppointmentDate,
           2, a.meeting2Date, a.meeting2Status, a.meeting2Feedback
    FROM Appointment a
    WHERE a.meeting2Date IS NOT NULL OR a.meeting2Status IS NOT NULL OR a.meeting2Feedback IS NOT NULL
    UNION ALL
    SELECT a.id, a.organisationId, a.customerSigned, a.firstAppointmentDate,
           3, a.meeting3Date, a.meeting3Status, a.meeting3Feedback
    FROM Appointment a
    WHERE a.meeting3Date IS NOT NULL OR a.meeting3Status IS NOT NULL OR a.meeting3Feedback IS NOT NULL
),
with_terminal AS (
    SELECT u.*, MAX(u."meetingNumber") OVER (PARTITION BY u."appointmentId") AS "terminalMeetingNumber"
    FROM unpivoted u
)
INSERT INTO MeetingAttempt (appointmentId, organisationId, meetingNumber, date, status, notes, createdAt)
SELECT
    t."appointmentId",
    t.organisationId,
    t."meetingNumber",
    COALESCE(t."oldDate", CASE WHEN t."meetingNumber" = 1 THEN t.firstAppointmentDate ELSE NULL END) AS "date",
    CASE
        WHEN t."oldStatus" IS NULL THEN 'Scheduled'
        WHEN t."oldStatus" IN ('Rescheduled', 'Cancelled') THEN 'Rescheduled'
        WHEN t."oldStatus" = 'Seen' AND t."meetingNumber" < t."terminalMeetingNumber" THEN 'HeldInterested'
        WHEN t."oldStatus" = 'Seen' AND t."meetingNumber" = t."terminalMeetingNumber" AND t.customerSigned = TRUE  THEN 'HeldInterested'
        WHEN t."oldStatus" = 'Seen' AND t."meetingNumber" = t."terminalMeetingNumber" AND t.customerSigned = FALSE THEN 'HeldNotInterested'
        WHEN t."oldStatus" = 'Seen' AND t."meetingNumber" = t."terminalMeetingNumber" AND t.customerSigned IS NULL THEN 'HeldInterested'
        ELSE 'Scheduled'
    END AS "status",
    t."oldNotes" AS "notes",
    NOW() AS "createdAt"
FROM with_terminal t;
