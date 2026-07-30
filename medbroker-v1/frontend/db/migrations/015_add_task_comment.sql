-- 015_add_task_comment.sql
-- Task discussion threads (§71) — Mark's request. A comment belongs to
-- one Task, has an author, a body, and a timestamp — nothing more. No
-- edit/delete on comments (a discussion thread is a record of what was
-- said and when, not a document to revise) — matches the same
-- philosophy AuditLog already follows for the same reason.
--
-- ON DELETE CASCADE on taskId: if a Task is ever deleted (manual
-- deletion, or cascade-cleanup from a Lead/Appointment change), its
-- comments go with it rather than becoming orphaned rows nothing can
-- ever reach again.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS TaskComment (
    id             UUID          NOT NULL DEFAULT gen_random_uuid(),
    organisationId UUID          NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
    taskId         UUID          NOT NULL,
    authorId       UUID          NOT NULL,
    body           VARCHAR(2000) NOT NULL,
    createdAt      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_TaskComment        PRIMARY KEY (id),
    CONSTRAINT FK_TaskComment_Org    FOREIGN KEY (organisationId) REFERENCES Organisation(id),
    CONSTRAINT FK_TaskComment_Task   FOREIGN KEY (taskId) REFERENCES Task(id) ON DELETE CASCADE,
    CONSTRAINT FK_TaskComment_Author FOREIGN KEY (authorId) REFERENCES "User"(id)
);

CREATE INDEX IF NOT EXISTS IX_TaskComment_Task ON TaskComment (taskId, createdAt);
