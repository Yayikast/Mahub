CREATE OR REPLACE FUNCTION log_attendance_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (type, action, session_id, student_id, old_status, new_status, changed_by)
    VALUES ('attendance', 'INSERT', NEW.session_id, NEW.student_id, NULL, NEW.status, NEW.recorded_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (type, action, session_id, student_id, old_status, new_status, changed_by)
    VALUES ('attendance', 'UPDATE', NEW.session_id, NEW.student_id, OLD.status, NEW.status, NEW.recorded_by);
    RETURN NEW;
  ELSE
    -- a delete has no "recorded_by", so the route tells us who via app.user_id (see #18)
    INSERT INTO audit_log (type, action, session_id, student_id, old_status, new_status, changed_by)
    VALUES ('attendance', 'DELETE', OLD.session_id, OLD.student_id, OLD.status, NULL,
            NULLIF(current_setting('app.user_id', true), '')::int);
    RETURN OLD;
  END IF;
END $$;

DROP TRIGGER IF EXISTS attendance_audit ON attendance;
CREATE TRIGGER attendance_audit
  AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION log_attendance_change();

-- present or excused ÷ CLOSED sessions, whole-number percent
CREATE OR REPLACE FUNCTION attendance_rate(p_student INT, p_section INT) RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN COUNT(cs.id) = 0 THEN 0
              ELSE ROUND(100.0 * COUNT(a.student_id) / COUNT(cs.id))::int END
  FROM class_sessions cs
  LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = p_student
  WHERE cs.section_id = p_section AND cs.closed_at IS NOT NULL;
$$;

-- every CURRENTLY enrolled student of a session; absent = no attendance row
CREATE OR REPLACE VIEW v_session_roster AS
SELECT cs.id AS session_id, u.id AS student_id, u.full_name, u.student_no,
       COALESCE(a.status, 'absent') AS status, a.method, a.recorded_at
FROM class_sessions cs
JOIN enrollments e ON e.section_id = cs.section_id
JOIN users u ON u.id = e.student_id
LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = u.id;

CREATE OR REPLACE VIEW v_student_attendance AS
SELECT e.student_id, s.id AS section_id, c.code AS course_code, c.name AS course_name, s.section_no,
       (SELECT COUNT(*) FROM class_sessions cs
          JOIN attendance a ON a.session_id = cs.id AND a.student_id = e.student_id
          WHERE cs.section_id = s.id AND cs.closed_at IS NOT NULL)::int AS attended,
       (SELECT COUNT(*) FROM class_sessions cs
          WHERE cs.section_id = s.id AND cs.closed_at IS NOT NULL)::int AS total_sessions,
       attendance_rate(e.student_id, s.id) AS rate
FROM enrollments e
JOIN sections s ON s.id = e.section_id
JOIN courses c ON c.id = s.course_id;
-- mahub_app can only SELECT from audit_log, so the server can't write import entries itself.
-- This runs as the table owner and can write nothing else.
CREATE OR REPLACE FUNCTION log_import(p_section INT, p_summary JSONB, p_user INT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO audit_log (type, action, section_id, summary, changed_by)
  VALUES ('import', 'IMPORT', p_section, p_summary, p_user);
$$;

REVOKE ALL ON FUNCTION log_import(INT, JSONB, INT) FROM PUBLIC;
-- Supabase also grants new functions to anon/authenticated; they must not forge audit rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION log_import(INT, JSONB, INT) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION log_import(INT, JSONB, INT) FROM authenticated;
  END IF;
END $$;
