-- Public admissions applications, submitted from the /apply page.
-- Applied on top of schema.sql (which DROPs tables — do not re-run that
-- against a live database).
CREATE TABLE IF NOT EXISTS applications (
  id        TEXT PRIMARY KEY,
  fullName  TEXT NOT NULL,
  email     TEXT NOT NULL,
  phone     TEXT,
  program   TEXT NOT NULL,
  message   TEXT,
  status    TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending','reviewing','accepted','rejected')),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_status_idx  ON applications (status);
CREATE INDEX IF NOT EXISTS applications_created_idx ON applications (createdAt DESC);
