-- 026_add_appointment_meeting_type.sql
-- §140d (12 Aug 2026) — meeting type (in-person vs virtual), drives which
-- of address/meeting-link is required at booking time. Mark's request
-- after finding the Address field wasn't mandatory at all.
--
-- Two additive columns, safe defaults, no data loss risk on an existing
-- database. meetingType defaults to 'InPerson' for any existing row (the
-- only kind of meeting this app supported before this migration existed),
-- so historical appointments don't end up in an unrepresented state.

ALTER TABLE Appointment ADD COLUMN IF NOT EXISTS meetingType VARCHAR(20) NOT NULL DEFAULT 'InPerson';
ALTER TABLE Appointment ADD COLUMN IF NOT EXISTS virtualMeetingLink VARCHAR(500) NULL;

ALTER TABLE Appointment DROP CONSTRAINT IF EXISTS CK_Appointment_MeetingType;
ALTER TABLE Appointment ADD CONSTRAINT CK_Appointment_MeetingType CHECK (meetingType IN ('InPerson', 'Virtual'));
