-- Supabase gives its public API roles (anon, authenticated) full access to everything new in
-- public. Take that away first, so every table below is created closed, whatever the Data API
-- switch says. The roles only exist on Supabase, so on a plain Postgres this does nothing.
-- Default privileges belong to the role that runs this file (postgres on Supabase).
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;

CREATE TABLE users (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  google_sub  TEXT UNIQUE, --user's permanent google ID
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
  student_no  VARCHAR(10) UNIQUE CHECK (student_no ~ '^[0-9]{10}$'),
  created_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role = 'student' OR student_no IS NULL)
);

CREATE TABLE courses (
  id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE campuses (
  id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  lat       DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng       DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m  INT NOT NULL CHECK (radius_m BETWEEN 10 AND 5000)
);

CREATE TABLE sections (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id      INT NOT NULL REFERENCES courses(id),
  instructor_id  INT NOT NULL REFERENCES users(id),
  term           TEXT NOT NULL,
  section_no     INT NOT NULL,
  UNIQUE (course_id, term, section_no)
);

CREATE TABLE enrollments (
  section_id  INT NOT NULL REFERENCES sections(id),
  student_id  INT NOT NULL REFERENCES users(id),
  created_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, student_id)
);

CREATE TABLE class_sessions (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  section_id     INT NOT NULL REFERENCES sections(id),
  campus_id      INT NOT NULL REFERENCES campuses(id),
  opened_by      INT NOT NULL REFERENCES users(id),
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ,
  qr_code        TEXT,
  qr_expires_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- only one open session per section
CREATE UNIQUE INDEX one_open_session_per_section
  ON class_sessions (section_id) WHERE closed_at IS NULL;

CREATE TABLE attendance (
  session_id   INT NOT NULL REFERENCES class_sessions(id),
  student_id   INT NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL CHECK (status IN ('present', 'excused')),
  method       TEXT NOT NULL CHECK (method IN ('qr', 'manual')),
  recorded_by  INT REFERENCES users(id),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  distance_m   INT,
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE checkin_attempts (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  INT NOT NULL REFERENCES class_sessions(id),
  user_id     INT NOT NULL REFERENCES users(id),
  outcome     TEXT NOT NULL CHECK (outcome IN
              ('ok','expired','not_enrolled','closed','duplicate','too_far','low_accuracy')),
  distance_m  INT,
  accuracy_m  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- no foreign keys here on purpose: history must survive deletes
CREATE TABLE audit_log (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'attendance'
              CHECK (type IN ('attendance', 'enrollment', 'import')),
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','IMPORT')),
  session_id  INT,
  section_id  INT,
  student_id  INT,
  old_status  TEXT,
  new_status  TEXT,
  summary     JSONB,
  changed_by  INT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the lookups the screens make (before and after in docs/PERFORMANCE.md).
-- The primary keys already cover attendance by session and enrollments by section, but they can't
-- find a row by the SECOND column alone, and a foreign key does not get an index by itself in Postgres.
-- IF NOT EXISTS so the file (or just this block) can be run again on a database that has them.
CREATE INDEX IF NOT EXISTS enrollments_student_id_idx      ON enrollments (student_id);      -- "my classes"
CREATE INDEX IF NOT EXISTS class_sessions_section_id_idx   ON class_sessions (section_id);   -- a section's sessions and its rate
CREATE INDEX IF NOT EXISTS checkin_attempts_session_id_idx ON checkin_attempts (session_id); -- who tried in a session