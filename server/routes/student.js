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
  // TODO 2: one row per class I'm enrolled in, from the view v_student_attendance
  //   (db/functions.sql). It already has every column the reply needs:
  //   section_id, course_code, course_name, section_no, attended, total_sessions, rate
  //   and also student_id, which we filter on but don't send.
  //   SELECT the 7 columns FROM v_student_attendance WHERE student_id = $1 ORDER BY course_code, section_no
  //   with [req.user.id]
  const result = { rows: [] }; // <- replace this line with your await pool.query(...)
  return res.json(result.rows);
});

// requireEnrolled (TODO 1, middleware/auth.js) has already answered 404 or 403 if this isn't my class.
router.get('/api/my/classes/:id', student, requireEnrolled, async (req, res) => {
  const sectionId = Number(req.params.id); // requireEnrolled checked it's a real section id

  const section = (await pool.query(
    `SELECT s.id, c.code AS course_code, c.name AS course_name, s.section_no
     FROM sections s JOIN courses c ON c.id = s.course_id WHERE s.id = $1`,
    [sectionId]
  )).rows[0];

  // TODO 3: every session of this section, oldest first, with MY mark in it.
  //   The attendance table only has rows for check-ins that happened: a session I missed has
  //   NO row. So start from class_sessions and LEFT JOIN attendance (a LEFT JOIN keeps the
  //   session even when no attendance row matches; its a.* columns are then NULL).
  //   SELECT cs.id AS session_id, cs.opened_at, cs.closed_at, COALESCE(a.status, 'absent') AS status
  //   FROM class_sessions cs
  //   LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = <me>
  //   WHERE cs.section_id = <this section>
  //   ORDER BY cs.opened_at
  //   Values only through $1 and $2: which is which?
  //   Careful: "a.student_id = me" goes in the ON, not in the WHERE. (Why? Ask if unsure.)
  const sessions = { rows: [] }; // <- replace this line with your await pool.query(...)

  return res.json({ section, sessions: sessions.rows });
});

module.exports = router;
