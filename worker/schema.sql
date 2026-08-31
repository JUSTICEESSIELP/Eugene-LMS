-- Edunexus D1 schema (port of the Mongoose models)
-- Ids are 24-char hex strings so they stay drop-in compatible with the
-- ObjectId strings the React frontend already passes around.

DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS timetables;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS academic_years;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  password       TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'student'
                 CHECK (role IN ('admin','teacher','student','parent')),
  isActive       INTEGER NOT NULL DEFAULT 1,
  studentClass   TEXT,
  teacherSubject TEXT NOT NULL DEFAULT '[]',   -- JSON array of subject ids
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE academic_years (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  fromYear  TEXT NOT NULL,
  toYear    TEXT NOT NULL,
  isCurrent INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX academic_years_range_idx ON academic_years (fromYear, toYear);

CREATE TABLE subjects (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  code      TEXT NOT NULL UNIQUE,
  teacher   TEXT NOT NULL DEFAULT '[]',        -- JSON array of user ids
  isActive  INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE classes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  academicYear TEXT NOT NULL,
  classTeacher TEXT,
  subjects     TEXT NOT NULL DEFAULT '[]',     -- JSON array of subject ids
  students     TEXT NOT NULL DEFAULT '[]',     -- JSON array of user ids
  capacity     INTEGER NOT NULL DEFAULT 40,
  createdAt    TEXT NOT NULL,
  updatedAt    TEXT NOT NULL
);
CREATE UNIQUE INDEX classes_name_year_idx ON classes (name, academicYear);

CREATE TABLE timetables (
  id           TEXT PRIMARY KEY,
  class        TEXT NOT NULL,
  academicYear TEXT NOT NULL,
  schedule     TEXT NOT NULL DEFAULT '[]',     -- JSON [{day, periods:[...]}]
  status       TEXT NOT NULL DEFAULT 'ready',  -- pending | ready | failed
  error        TEXT,
  createdAt    TEXT NOT NULL,
  updatedAt    TEXT NOT NULL
);
CREATE UNIQUE INDEX timetables_class_year_idx ON timetables (class, academicYear);

CREATE TABLE exams (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  subject   TEXT NOT NULL,
  class     TEXT NOT NULL,
  teacher   TEXT NOT NULL,
  duration  INTEGER NOT NULL DEFAULT 60,
  dueDate   TEXT NOT NULL,
  isActive  INTEGER NOT NULL DEFAULT 1,
  questions TEXT NOT NULL DEFAULT '[]',        -- JSON array of question objects
  status    TEXT NOT NULL DEFAULT 'ready',     -- pending | ready | failed
  error     TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX exams_class_idx ON exams (class);
CREATE INDEX exams_teacher_idx ON exams (teacher);

CREATE TABLE submissions (
  id          TEXT PRIMARY KEY,
  exam        TEXT NOT NULL,
  student     TEXT NOT NULL,
  answers     TEXT NOT NULL DEFAULT '[]',      -- JSON [{questionId, answer}]
  score       INTEGER NOT NULL DEFAULT 0,
  totalPoints INTEGER NOT NULL DEFAULT 0,
  submittedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX submissions_exam_student_idx ON submissions (exam, student);

CREATE TABLE activity_logs (
  id        TEXT PRIMARY KEY,
  user      TEXT NOT NULL,
  action    TEXT NOT NULL,
  details   TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX activity_logs_user_idx ON activity_logs (user);
CREATE INDEX activity_logs_created_idx ON activity_logs (createdAt DESC);

CREATE TABLE applications (
  id        TEXT PRIMARY KEY,
  fullName  TEXT NOT NULL,
  email     TEXT NOT NULL,
  phone     TEXT,
  program   TEXT NOT NULL,
  message   TEXT,
  status    TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending','reviewing','accepted','rejected')),
  userId    TEXT,                                -- set when an admin accepts
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX applications_status_idx  ON applications (status);
CREATE INDEX applications_created_idx ON applications (createdAt DESC);
CREATE INDEX applications_user_idx    ON applications (userId);
