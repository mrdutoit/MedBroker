-- Migration 034 — Cancelled/Missed as real MeetingAttempt statuses,
-- plus a structured cancelReason
-- 15 Aug 2026 (§172) — reverses part of migration 031's own design
-- decision (14 Aug 2026): that migration collapsed the old model's
-- 'Cancelled' into the new model's 'Rescheduled', reasoning they led to
-- the identical next action. Mark's real-world case shows that
-- collapse lost something worth reporting on: a client cancelling (or
-- simply not showing) with no notice and no reschedule happening at
-- that moment is genuinely different from one being actively rebooked,
-- even though the MECHANICS (new row, same meeting number, no outcome
-- form) are identical for all three. Full reasoning in
-- Status_Vercel.md §172.

ALTER TABLE MeetingAttempt
    DROP CONSTRAINT IF EXISTS CK_MeetingAttempt_Status;

ALTER TABLE MeetingAttempt
    ADD CONSTRAINT CK_MeetingAttempt_Status CHECK (status IN (
        'Scheduled', 'HeldInterested', 'HeldNotInterested', 'Rescheduled', 'Cancelled', 'Missed'
    ));

ALTER TABLE MeetingAttempt
    ADD COLUMN IF NOT EXISTS cancelReason VARCHAR(50) NULL;

ALTER TABLE MeetingAttempt
    ADD CONSTRAINT CK_MeetingAttempt_CancelReason CHECK (cancelReason IS NULL OR cancelReason IN (
        'NoLongerInterested', 'FoundAlternative', 'SchedulingConflict', 'Uncontactable', 'Other'
    ));

-- DATA CORRECTION — a genuine recovery, not a guess. Migration 031's
-- own backfill mapped the old flat columns' 'Cancelled' status into the
-- new model's 'Rescheduled', because 'Cancelled' didn't exist as a
-- distinct outcome yet at the time. The OLD flat columns
-- (Appointment.meeting{1,2,3}Status) were deliberately never dropped —
-- migration 031's own header explains why: kept in place until the
-- backfill was confirmed correct in production. That means the
-- original 'Cancelled' value is still sitting right there, so this
-- corrects any row migration 031 collapsed, restoring exactly what was
-- lost rather than leaving it silently wrong now that the distinction
-- exists again. Matches meetingNumber to the corresponding flat column
-- explicitly (1/2/3) — the old model could only ever hold one row's
-- worth of data per meeting number (no history), so at most one
-- MeetingAttempt row per appointment/meetingNumber can ever match this,
-- no ambiguity about which row a given flat-column value belongs to.
UPDATE MeetingAttempt ma
SET status = 'Cancelled'
FROM Appointment a
WHERE ma.appointmentId = a.id
  AND ma.status = 'Rescheduled'
  AND (
    (ma.meetingNumber = 1 AND a.meeting1Status = 'Cancelled') OR
    (ma.meetingNumber = 2 AND a.meeting2Status = 'Cancelled') OR
    (ma.meetingNumber = 3 AND a.meeting3Status = 'Cancelled')
  );
