-- 019_add_notification_readat.sql
-- §99 — Mark noticed there was no way to clear notifications, and asked
-- whether they'd auto-expire a few days after being read. Neither
-- existed. This adds the timestamp a "read, then N days later" cleanup
-- policy actually needs — isRead alone can't tell you WHEN it was read,
-- only that it currently is.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

ALTER TABLE Notification ADD COLUMN IF NOT EXISTS readAt TIMESTAMPTZ NULL;
