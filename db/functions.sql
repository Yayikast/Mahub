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

-- present or excused ÷ CLOSED sessions, whole-number percent.
-- Only counts a student who is CURRENTLY enrolled (0 otherwise); their attendance rows are kept
-- after a removal and count again if they are re-enrolled.
CREATE OR REPLACE FUNCTION attendance_rate(p_student INT, p_section INT) RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN COUNT(cs.id) = 0 THEN 0
              ELSE ROUND(100.0 * COUNT(a.student_id) / COUNT(cs.id))::int END
  FROM class_sessions cs
  LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = p_student
  WHERE cs.section_id = p_section AND cs.closed_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM enrollments e
                WHERE e.section_id = p_section AND e.student_id = p_student);
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

-- Same idea for the admin enrol / remove routes: one 'enrollment' entry per change.
-- p_action is 'INSERT' (enrolled) or 'DELETE' (removed); the audit_log CHECK rejects anything else.
CREATE OR REPLACE FUNCTION log_enrollment(p_section INT, p_student INT, p_action TEXT, p_user INT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO audit_log (type, action, section_id, student_id, changed_by)
  VALUES ('enrollment', p_action, p_section, p_student, p_user);
$$;

REVOKE ALL ON FUNCTION log_enrollment(INT, INT, TEXT, INT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION log_enrollment(INT, INT, TEXT, INT) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION log_enrollment(INT, INT, TEXT, INT) FROM authenticated;
  END IF;
END $$;

-- Distance in metres between two points on the Earth (Haversine, "as the crow flies").
-- Used by check_in (check 4). Test it on its own: SELECT haversine_m(14.06930, 100.60778, 14.07430, 100.60778);
-- should give about 556 (0.005 degrees of latitude).
CREATE OR REPLACE FUNCTION haversine_m(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
                                       lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  r     CONSTANT DOUBLE PRECISION := 6371000;  -- the Earth's radius in metres
  dlat  DOUBLE PRECISION;
  dlng  DOUBLE PRECISION;
  a     DOUBLE PRECISION;
BEGIN
  -- [ADDED] 1: the two differences, in radians. Hint: radians(lat2 - lat1)
  -- dlat := ...;
  -- dlng := ...;
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);

  -- [ADDED] 2: the haversine part:  a = sin²(dlat/2) + cos(lat1) · cos(lat2) · sin²(dlng/2)
  -- Hints: "squared" is power(x, 2); cos needs radians too: cos(radians(lat1))
  -- a := ...;
  a := power(sin(dlat/2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(dlng/2), 2);

  -- [ADDED] 3: the distance:  2 · r · asin(√a). Hint: sqrt(a)
  -- RETURN ...;
  RETURN 2 * r * asin(sqrt(a));
END $$;

-- check_in: every QR check-in goes through here (issue #19, rubric: stored procedure).
-- The checks run in order; the first one that fails stops everything with
-- RAISE EXCEPTION '<reason>', which the route (POST /api/checkin) reads as err.message.
-- Rules from docs/API.md: accuracy over 200 m -> low_accuracy; accepted if the distance to the
-- campus centre is at most radius_m + accuracy.
-- A second check-in fails on attendance's primary key (error 23505); no check needed for that.
-- Try it in the SQL editor: CALL check_in(1, 4, 14.06930, 100.60778, 20);
CREATE OR REPLACE PROCEDURE check_in(p_session INT, p_student INT,
                                     p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
                                     p_accuracy DOUBLE PRECISION)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_section   INT;               -- the session's section
  v_closed    TIMESTAMPTZ;       -- when the session was closed (NULL = still open)
  v_lat       DOUBLE PRECISION;  -- the campus centre
  v_lng       DOUBLE PRECISION;
  v_radius    INT;               -- the campus radius_m
  v_distance  INT;               -- phone to campus centre, whole metres
BEGIN
  -- Look up the session and its campus in one go. SELECT ... INTO copies the row's
  -- values into the variables above. If there's no such session, FOUND is false.
  SELECT cs.section_id, cs.closed_at, c.lat, c.lng, c.radius_m
    INTO v_section, v_closed, v_lat, v_lng, v_radius
  FROM class_sessions cs
  JOIN campuses c ON c.id = cs.campus_id
  WHERE cs.id = p_session;

  -- TODO 4 (check 1): no such session, or it's closed -> 'closed'
  -- Hint: IF NOT FOUND OR ... THEN RAISE EXCEPTION '...'; END IF;

  -- TODO 5 (check 2): the student isn't in enrollments for v_section -> 'not_enrolled'
  -- Hint: IF NOT EXISTS (SELECT 1 FROM enrollments WHERE ... AND ...) THEN ... END IF;

  -- TODO 6 (check 3): accuracy over 200 m -> 'low_accuracy'

  -- TODO 7 (check 4): work out the distance with haversine_m (phone -> campus centre),
  -- rounded to whole metres, into v_distance. Then, if it's more than radius + accuracy
  -- -> 'too_far', with the distance in DETAIL (DETAIL must be text):
  --   RAISE EXCEPTION 'too_far' USING DETAIL = v_distance::text;
  -- v_distance := round(haversine_m(...));

  -- TODO 8 (check 5): all passed, so write the attendance row:
  -- status 'present', method 'qr', recorded_by = the student, distance_m = v_distance.
  -- (Pinya's trigger then writes audit_log by itself.)
  -- INSERT INTO attendance (session_id, student_id, status, method, recorded_by, distance_m)
  -- VALUES (...);
END $$;
