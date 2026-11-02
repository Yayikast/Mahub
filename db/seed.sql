INSERT INTO users (email, full_name, role) VALUES
  ('6722771886@g.siit.tu.ac.th', 'Pinya Postscrippt',  'admin'),
  ('6722782164@g.siit.tu.ac.th',   'Dr. Touching Boeingxd',    'instructor'),
  ('6722781026@g.siit.tu.ac.th',  'Dr. Yayika Tinner',   'instructor')
ON CONFLICT DO NOTHING;

INSERT INTO users (email, full_name, role, student_no)
SELECT 'student' || n || '@g.siit.tu.ac.th', 'Student ' || n, 'student',
       '67227700' || lpad(n::text, 2, '0')
FROM generate_series(1, 30) AS n
ON CONFLICT DO NOTHING;

INSERT INTO courses (code, name) VALUES
  ('CSS326', 'Database Programming Laboratory'),
  ('CSS325', 'Database Systems')
ON CONFLICT DO NOTHING;

-- Radii are starting guesses until each campus is walked. To change one, edit it here and
-- re-run this file (the upsert updates existing rows), or use the admin Campuses tab.
INSERT INTO campuses (name, lat, lng, radius_m) VALUES
  ('Rangsit',  14.06930, 100.60778, 600),
  ('Bangkadi', 13.98065, 100.55479, 300)
ON CONFLICT (name) DO UPDATE
  SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, radius_m = EXCLUDED.radius_m;

INSERT INTO sections (course_id, instructor_id, term, section_no)
SELECT c.id, u.id, '2026-1', s.no
FROM (VALUES ('CSS326','6722782164@g.siit.tu.ac.th',1),
             ('CSS326','6722781026@g.siit.tu.ac.th',2),
             ('CSS325','6722782164@g.siit.tu.ac.th',1)) AS s(code, email, no)
JOIN courses c ON c.code = s.code
JOIN users u ON u.email = s.email
ON CONFLICT DO NOTHING;

-- students 1-20 in the first section, 11-30 in the second, 1-10 in the third
INSERT INTO enrollments (section_id, student_id)
SELECT sec.id, u.id
FROM sections sec
JOIN courses c ON c.id = sec.course_id
JOIN users u ON u.role = 'student'
WHERE (c.code = 'CSS326' AND sec.section_no = 1 AND u.student_no::bigint % 100 BETWEEN 1 AND 20)
   OR (c.code = 'CSS326' AND sec.section_no = 2 AND u.student_no::bigint % 100 BETWEEN 11 AND 30)
   OR (c.code = 'CSS325'                         AND u.student_no::bigint % 100 BETWEEN 1 AND 10)
ON CONFLICT DO NOTHING;

-- 3 closed past sessions for CSS326 section 1, ~80% of students present.
-- The guard makes a second run do nothing.
DO $$
DECLARE sec_id INT; inst_id INT; camp_id INT; sess_id INT; i INT;
BEGIN
  IF EXISTS (SELECT 1 FROM class_sessions) THEN RETURN; END IF;
  SELECT s.id INTO sec_id FROM sections s JOIN courses c ON c.id = s.course_id
    WHERE c.code = 'CSS326' AND s.section_no = 1;
  SELECT id INTO inst_id FROM users WHERE email = '6722782164@g.siit.tu.ac.th';
  SELECT id INTO camp_id FROM campuses WHERE name = 'Rangsit';
  FOR i IN 1..3 LOOP
    INSERT INTO class_sessions (section_id, campus_id, opened_by, opened_at, closed_at)
    VALUES (sec_id, camp_id, inst_id,
            now() - (i * interval '7 days'),
            now() - (i * interval '7 days') + interval '1 hour')
    RETURNING id INTO sess_id;
    INSERT INTO attendance (session_id, student_id, status, method, recorded_by)
    SELECT sess_id, e.student_id, 'present', 'qr', e.student_id
    FROM enrollments e WHERE e.section_id = sec_id AND random() < 0.8;
  END LOOP;
END $$;