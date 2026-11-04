-- roles.sql - mahub_app, the only login the server uses (issue #4, Lab 10).
-- Least privilege: it can read and change the data, but never the structure,
-- and it can only READ the audit log.
--
-- Run it in the Supabase SQL editor after schema.sql and functions.sql
-- (order: schema -> functions -> roles -> seed). Safe to run again; run it again
-- after any new table, view or function is added.
--
-- No password in this file (it is on GitHub). Set it once by hand:
--   ALTER ROLE mahub_app WITH PASSWORD '...';
-- and keep it only in the password manager, server/.env and Vercel.

-- 1. Create the login, only if it doesn't exist yet (so the file can run twice).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mahub_app') THEN
    CREATE ROLE mahub_app LOGIN;
  END IF;
END $$;

-- 2. [ADDED] 1: let mahub_app into the "public" schema (the folder that holds our tables).
--    Without this it can't even see the tables.
--    GRANT USAGE ON SCHEMA ... TO ...;
GRANT USAGE ON SCHEMA public TO mahub_app;


-- 3. [ADDED] 2a: the tables. Read and change rows, nothing else
--    (no TRUNCATE, no DROP, no ALTER: those are never granted).
--    "ALL TABLES IN SCHEMA public" covers every table at once.
--    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ...;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mahub_app;

--    [ADDED] 2b: the id counters. Each GENERATED ... AS IDENTITY column takes its next
--    number from a sequence; an INSERT needs permission to use it.
--    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ...;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mahub_app;


-- 4. [ADDED] 3: audit_log is read-only. Step 3 gave INSERT, UPDATE and DELETE on it too,
--    so take those three back. Only the trigger and log_import / log_enrollment
--    (SECURITY DEFINER) write it.
--    REVOKE ... ON audit_log FROM ...;
REVOKE INSERT, UPDATE, DELETE ON audit_log FROM mahub_app;


-- 5. [ADDED] 4: the views are lists to read. Step 3 also covered them (a view counts
--    as a table there), so take back INSERT, UPDATE and DELETE on both:
--    v_session_roster and v_student_attendance.
REVOKE INSERT, UPDATE, DELETE ON v_session_roster, v_student_attendance FROM mahub_app;


-- 6. [ADDED] 5: functions.sql locked log_import and log_enrollment (REVOKE ... FROM PUBLIC),
--    and PUBLIC means everyone, mahub_app included. Give EXECUTE back to mahub_app only.
--    Write the argument types too, like functions.sql does:
--      log_import(INT, JSONB, INT)   log_enrollment(INT, INT, TEXT, INT)   attendance_rate(INT, INT)
--    GRANT EXECUTE ON FUNCTION ... TO ...;
--    (check_in is added here in PR 4, when it exists: GRANT EXECUTE ON PROCEDURE ...)
GRANT EXECUTE ON FUNCTION log_import(INT, JSONB, INT) TO mahub_app;
GRANT EXECUTE ON FUNCTION log_enrollment(INT, INT, TEXT, INT) TO mahub_app;
GRANT EXECUTE ON FUNCTION attendance_rate(INT, INT) TO mahub_app;


-- 7. Extra layer: Supabase's own API roles get nothing on what already exists
--    (schema.sql already closed everything created later). They only exist on
--    Supabase, so on a plain Postgres this does nothing.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- 8. PUBLIC means everyone, and Postgres gives PUBLIC EXECUTE on every function it creates.
--    Revoking from anon above does not take that away, so a SECURITY DEFINER function such
--    as check_in could still be called through /rest/v1/rpc. Take it back for the functions
--    that exist and for the ones created later. The owner keeps EXECUTE, and mahub_app has
--    its own grants in step 6: add a GRANT there for every new function the server calls.
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
--    No "IN SCHEMA" on the next line on purpose: the PUBLIC grant is a built-in default for
--    every schema, and a per-schema ALTER DEFAULT PRIVILEGES can only add to it, never remove it.
--    It covers functions created from now on by the role that runs this file.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
