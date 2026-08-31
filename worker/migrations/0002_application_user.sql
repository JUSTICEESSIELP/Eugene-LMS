-- Links an application to the student account that accepting it created.
-- Nullable: applications only get a userId once an admin accepts them, and it
-- is what stops a second accept from minting a second user.
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running this file against a
-- database that already has the column fails with "duplicate column name".
-- That is safe to ignore — it means the migration is already applied.
ALTER TABLE applications ADD COLUMN userId TEXT;

CREATE INDEX IF NOT EXISTS applications_user_idx ON applications (userId);
