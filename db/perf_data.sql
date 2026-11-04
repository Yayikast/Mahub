-- perf_data.sql - bulk test data for the EXPLAIN lab in docs/PERFORMANCE.md (issue #26).
-- ONLY for a scratch database, never Supabase: run it as the owner (postgres) after schema.sql and
-- functions.sql, and do not run seed.sql in the same database. About 1.2 million attendance rows.
--   createdb perf && psql perf -f db/schema.sql -f db/functions.sql -f db/perf_data.sql
-- The queries in PERFORMANCE.md use student 10100, session 7500 and section 500 from this data.
SET session_replication_role = replica;   -- skip the audit trigger for the bulk load (it would write 1.2M audit rows)

INSERT INTO users (email, full_name, role)
SELECT 'prof' || n || '@example.com', 'Instructor ' || n, 'instructor' FROM generate_series(1, 100) n;

INSERT INTO users (email, full_name, role, student_no)
SELECT 's' || n || '@g.siit.tu.ac.th', 'Student ' || n, 'student', lpad((6700000000 + n)::text, 10, '0')
FROM generate_series(1, 20000) n;

INSERT INTO courses (code, name) SELECT 'CSS' || (300 + n), 'Course ' || n FROM generate_series(1, 100) n;
INSERT INTO campuses (name, lat, lng, radius_m) VALUES ('Rangsit', 14.0693, 100.60778, 600);

-- 1000 sections: 100 courses x 10 section numbers
INSERT INTO sections (course_id, instructor_id, term, section_no)
SELECT (n - 1) % 100 + 1, (n - 1) % 100 + 1, '1/2025', (n - 1) / 100 + 1 FROM generate_series(1, 1000) n;

-- every student in 5 different sections: 100,000 enrollments
INSERT INTO enrollments (section_id, student_id)
SELECT ((s * 7 + k * 211) % 1000) + 1, 100 + s
FROM generate_series(1, 20000) s, generate_series(0, 4) k;

-- 15 closed sessions per section: 15,000 sessions
INSERT INTO class_sessions (section_id, campus_id, opened_by, opened_at, closed_at)
SELECT sec.id, 1, sec.instructor_id,
       timestamptz '2025-06-01 09:00+07' + (k * interval '7 days'),
       timestamptz '2025-06-01 11:00+07' + (k * interval '7 days')
FROM sections sec, generate_series(0, 14) k;

-- each enrolled student attended about 80% of their section's sessions: ~1.2M rows
INSERT INTO attendance (session_id, student_id, status, method, recorded_at, distance_m)
SELECT cs.id, e.student_id, 'present', 'qr', cs.opened_at + interval '5 minutes', (random() * 300)::int
FROM enrollments e JOIN class_sessions cs ON cs.section_id = e.section_id
WHERE random() < 0.8;

-- 600,000 check-in attempts spread over all sessions
INSERT INTO checkin_attempts (session_id, user_id, outcome, distance_m, accuracy_m, created_at)
SELECT 1 + (random() * 14999)::int, 100 + 1 + (random() * 19999)::int,
       (ARRAY['ok','ok','ok','too_far','low_accuracy','duplicate'])[1 + (random() * 5)::int],
       (random() * 500)::int, (random() * 100)::int,
       timestamptz '2025-06-01 09:00+07' + (random() * interval '120 days')
FROM generate_series(1, 600000);

RESET session_replication_role;
ANALYZE;
SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'sections', count(*) FROM sections UNION ALL SELECT 'enrollments', count(*) FROM enrollments
UNION ALL SELECT 'class_sessions', count(*) FROM class_sessions UNION ALL SELECT 'attendance', count(*) FROM attendance UNION ALL SELECT 'checkin_attempts', count(*) FROM checkin_attempts;
