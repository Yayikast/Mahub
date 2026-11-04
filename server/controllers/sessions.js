const pool = require('../db');
const { validateOpenSession } = require('../lib/sessionRules');
const { QR_SECONDS, PREV_QR_SECONDS, newCode, scanUrl } = require('../lib/qr');
const { ownSection, ownSession } = require('../lib/ownership');

async function mySections(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, c.code AS course_code, c.name AS course_name, s.term, s.section_no
       FROM sections s JOIN courses c ON c.id = s.course_id
       WHERE s.instructor_id = $1
       ORDER BY s.term DESC, c.code, s.section_no`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Counts only include students who are enrolled now, so present + excused never passes enrolled_count.
async function listSessions(req, res, next) {
  try {
    const own = await ownSection(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const { rows } = await pool.query(
      `SELECT cs.id, cs.opened_at, cs.closed_at,
              (SELECT COUNT(*) FROM attendance a
                 JOIN enrollments e ON e.student_id = a.student_id AND e.section_id = cs.section_id
                 WHERE a.session_id = cs.id AND a.status = 'present')::int AS present_count,
              (SELECT COUNT(*) FROM attendance a
                 JOIN enrollments e ON e.student_id = a.student_id AND e.section_id = cs.section_id
                 WHERE a.session_id = cs.id AND a.status = 'excused')::int AS excused_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = cs.section_id)::int AS enrolled_count
       FROM class_sessions cs
       WHERE cs.section_id = $1
       ORDER BY cs.opened_at DESC, cs.id DESC`,
      [own.section.id]
    );
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function openSession(req, res, next) {
  try {
    const own = await ownSection(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const { error, value } = validateOpenSession(req.body);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `INSERT INTO class_sessions (section_id, campus_id, opened_by)
       VALUES ($1, $2, $3)
       RETURNING id, section_id, campus_id, opened_at`,
      [own.section.id, value.campus_id, req.user.id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    // 23505: the one-open-session-per-section index. 23503: there is no such campus.
    if (err.code === '23505') return res.status(409).json({ error: 'A session is already open for this section' });
    if (err.code === '23503') return res.status(400).json({ error: 'Choose a campus' });
    next(err);
  }
}

// The code is wiped too, so a photo of the screen is useless the moment the class ends.
async function closeSession(req, res, next) {
  try {
    const own = await ownSession(req);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const { rows } = await pool.query(
      `UPDATE class_sessions SET closed_at = now(), qr_code = NULL, prev_qr_code = NULL
       WHERE id = $1 AND closed_at IS NULL
       RETURNING id, closed_at`,
      [own.session.id]
    );
    if (rows.length === 0) return res.status(409).json({ error: 'Session is already closed' });
    return res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Nothing is kept in server variables: the code and its expiry are columns of the session.
// Making a new code is ONE conditional UPDATE, so two pages polling at the same moment cannot
// both win. The second UPDATE waits for the first, sees a code that has not expired, and changes
// nothing. It then reads the code the first one made.
// The code being replaced is kept as prev_qr_code for PREV_QR_SECONDS more: in an UPDATE the right-hand
// side sees the OLD row, so `qr_code` in `prev_qr_code = qr_code` is still the code that just ran out.
async function getQr(req, res, next) {
  try {
    const own = await ownSession(req);
    if (own.error) return res.status(own.status).json({ error: own.error });
    if (own.session.closed_at) return res.status(409).json({ error: 'Session is closed' });

    let current = (await pool.query(
      `UPDATE class_sessions
       SET prev_qr_code = qr_code,
           prev_qr_expires_at = now() + ($4::int * interval '1 second'),
           qr_code = $2,
           qr_expires_at = now() + ($3::int * interval '1 second')
       WHERE id = $1 AND closed_at IS NULL AND (qr_code IS NULL OR qr_expires_at <= now())
       RETURNING qr_code, qr_expires_at`,
      [own.session.id, newCode(), QR_SECONDS, PREV_QR_SECONDS]
    )).rows[0];

    if (!current) {
      // Someone else just refreshed it, or the session was closed a moment ago.
      const read = await pool.query(
        'SELECT qr_code, qr_expires_at, closed_at FROM class_sessions WHERE id = $1', [own.session.id]);
      if (read.rows[0].closed_at) return res.status(409).json({ error: 'Session is closed' });
      current = read.rows[0];
    }

    // Vercel serves the screens and the API at one address, so the request's own address is the site's.
    const origin = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    return res.json({
      scan_url: scanUrl(origin, own.session.id, current.qr_code),
      expires_at: current.qr_expires_at,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { mySections, listSessions, openSession, closeSession, getQr };
