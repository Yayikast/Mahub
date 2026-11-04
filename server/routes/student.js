// student.js - the student's own pages (issue #21, docs/API.md section 4).
//   GET /api/my/attendance    -> "My classes" (/me): my rate in each class
//   GET /api/my/classes/:id   -> "My class" (/me/classes/:id): every session of one class, with my mark
// "My" always means req.user.id, from the login cookie. No student id is ever read from the
// URL or the body, so a student can't ask for someone else's attendance.
const express = require('express');
const pool = require('../db');
const { requireLogin, requireRole, requireEnrolled } = require('../middleware/auth');

const router = express.Router();
const student = [requireLogin, requireRole('student')];

router.get('/api/my/attendance', student, async (req, res) => {
  // One row per class I'm in, from v_student_attendance (db/functions.sql), which already counts
  // closed sessions only. student_id is filtered on but not sent.
  const result = await pool.query(
    `SELECT section_id, course_code, course_name, section_no, attended, total_sessions, rate
     FROM v_student_attendance
     WHERE student_id = $1
     ORDER BY course_code, section_no`,
    [req.user.id]
  );
  return res.json(result.rows);
});

// requireEnrolled (middleware/auth.js) has already answered 404 or 403 if this isn't my class.
router.get('/api/my/classes/:id', student, requireEnrolled, async (req, res) => {
  const sectionId = Number(req.params.id); // requireEnrolled checked it's a real section id

  const section = (await pool.query(
    `SELECT s.id, c.code AS course_code, c.name AS course_name, s.section_no
     FROM sections s JOIN courses c ON c.id = s.course_id WHERE s.id = $1`,
    [sectionId]
  )).rows[0];

  // Every session of this section, oldest first, with my mark. A missed session has no
  // attendance row, so the LEFT JOIN keeps it with NULLs and COALESCE makes that 'absent'.
  // "Me" is in the ON, not the WHERE: in the WHERE, NULL = me would drop the missed sessions.
  const sessions = await pool.query(
    `SELECT cs.id AS session_id, cs.opened_at, cs.closed_at, COALESCE(a.status, 'absent') AS status
     FROM class_sessions cs
     LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = $1
     WHERE cs.section_id = $2
     ORDER BY cs.opened_at`,
    [req.user.id, sectionId]
  );

  return res.json({ section, sessions: sessions.rows });
});

module.exports = router;
