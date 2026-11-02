const pool = require('../db');
const { idOf, ownSession } = require('../lib/ownership');
const { validateMark, buildRoster } = require('../lib/attendanceRules');

// Every enrolled student with a status, plus the counts. The screen asks every 3 seconds, and after
// the session closes the same reply is the summary. v_session_roster already lists only the students
// who are enrolled now, so a removed student never makes "absent" negative.
async function getRoster(req, res, next) {
  try {
    const own = await ownSession(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const header = await pool.query(
      `SELECT cs.id, cs.opened_at, cs.closed_at,
              s.id AS section_id, c.code AS course_code, c.name AS course_name, s.term, s.section_no,
              cp.id AS campus_id, cp.name AS campus_name
       FROM class_sessions cs
       JOIN sections s ON s.id = cs.section_id
       JOIN courses c ON c.id = s.course_id
       JOIN campuses cp ON cp.id = cs.campus_id
       WHERE cs.id = $1`,
      [own.session.id]
    );
    if (header.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const students = await pool.query(
      `SELECT student_id, full_name, student_no, status, method, recorded_at
       FROM v_session_roster
       WHERE session_id = $1
       ORDER BY student_no NULLS LAST, full_name, student_id`,
      [own.session.id]
    );
    return res.json(buildRoster(header.rows[0], students.rows));
  } catch (err) {
    next(err);
  }
}

// Mark a student by hand (dead phone, approved absence). One statement: it only inserts for a
// student who is enrolled in this session's section, and if a mark already exists it is taken over
// by this instructor (method manual, recorded_by me, no distance), so the audit entry names me.
async function putMark(req, res, next) {
  try {
    const own = await ownSession(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const { error, value } = validateMark(req.body);
    if (error) return res.status(400).json({ error });

    const studentId = idOf(req.params.studentId);
    const { rows } = studentId
      ? await pool.query(
          `INSERT INTO attendance (session_id, student_id, status, method, recorded_by, distance_m)
           SELECT $1::int, e.student_id, $3::text, 'manual', $4::int, NULL
           FROM enrollments e
           WHERE e.section_id = $2 AND e.student_id = $5
           ON CONFLICT (session_id, student_id) DO UPDATE
             SET status = EXCLUDED.status, method = 'manual', recorded_by = EXCLUDED.recorded_by,
                 recorded_at = now(), distance_m = NULL
           RETURNING student_id, status, method`,
          [own.session.id, own.session.section_id, value.status, req.user.id, studentId]
        )
      : { rows: [] };
    if (rows.length === 0) return res.status(404).json({ error: 'That student is not enrolled in this section' });
    return res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Clear a mark: the student goes back to absent. The audit trigger needs to know who did it, and a
// DELETE carries no recorded_by, so the id travels in app.user_id. set_config(..., true) lasts for
// this transaction only, and BEGIN, set_config and DELETE must share ONE connection.
async function clearMark(req, res, next) {
  try {
    const own = await ownSession(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const studentId = idOf(req.params.studentId);
    if (!studentId) return res.status(404).json({ error: 'There was no mark to clear' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true)", [String(req.user.id)]);
      const gone = await client.query(
        'DELETE FROM attendance WHERE session_id = $1 AND student_id = $2', [own.session.id, studentId]);
      if (gone.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'There was no mark to clear' });
      }
      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

// Every check-in attempt, failures included, newest first. Attempts are written by POST /api/checkin only.
async function listAttempts(req, res, next) {
  try {
    const own = await ownSession(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const { rows } = await pool.query(
      `SELECT ca.id, ca.user_id, u.full_name, ca.outcome, ca.distance_m, ca.accuracy_m, ca.created_at
       FROM checkin_attempts ca
       JOIN users u ON u.id = ca.user_id
       WHERE ca.session_id = $1
       ORDER BY ca.created_at DESC, ca.id DESC`,
      [own.session.id]
    );
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getRoster, putMark, clearMark, listAttempts };
