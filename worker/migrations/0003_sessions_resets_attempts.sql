-- Security + exam-timing tables.
--
-- Three unrelated-looking changes ship together because they are all "state the
-- API needed but had nowhere to put":
--
--   password_resets  single-use, short-expiry reset tokens (G-07). We store a
--                    SHA-256 of the token, never the token itself, so a leaked
--                    database row cannot be replayed as a reset link.
--   users.sessionEpoch  ms timestamp. Any JWT issued before it is refused (G-16),
--                    which is what makes logout, deactivation and a password
--                    change actually end a session.
--   exam_attempts    when a student first opened an exam, so the server can
--                    enforce `duration` instead of merely printing it (G-10).
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running this file fails with
-- "duplicate column name". That is safe to ignore — it means it is applied.

CREATE TABLE IF NOT EXISTS password_resets (
  tokenHash TEXT PRIMARY KEY,          -- SHA-256 hex of the emailed token
  userId    TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  usedAt    TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx    ON password_resets (userId);
CREATE INDEX IF NOT EXISTS password_resets_expires_idx ON password_resets (expiresAt);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id        TEXT PRIMARY KEY,
  exam      TEXT NOT NULL,
  student   TEXT NOT NULL,
  startedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_exam_student_idx
  ON exam_attempts (exam, student);

ALTER TABLE users ADD COLUMN sessionEpoch INTEGER;
