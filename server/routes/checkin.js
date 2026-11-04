// checkin.js - POST /api/checkin, the student's check-in (issue #21, docs/API.md section 4).
// The phone sends only its location. Who it is comes from the login cookie (req.user) and which
// session, and when it was scanned, from the scan cookie that GET /scan saved (req.session.scan).
// The rules themselves live in the database: the check_in procedure (db/functions.sql).
const express = require('express');
const pool = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { toNumber } = require('../lib/fields');

const router = express.Router();

const SCAN_MS = 90 * 1000; // a scan is good for 90 seconds (time for a first Google sign-in)

// Every "no" in docs/API.md: the status and the message the screen shows.
const REASONS = {
  already_checked_in: [409, "You're already checked in"],
  no_scan:            [422, 'Scan the QR code first'],
  expired:            [422, 'QR expired, scan again'],
  closed:             [422, 'Check-in is closed'],
  not_enrolled:       [403, "You're not enrolled in this class"],
  low_accuracy:       [422, 'Turn on precise location for Chrome'],
  too_far:            [422, 'You seem to be off campus'],
};

// Sends { error, reason } with the right status. extra adds fields (the 409 also sends the class).
function fail(res, reason, extra = {}) {
  const [status, error] = REASONS[reason];
  return res.status(status).json({ error, reason, ...extra });
}

// The class and campus of a session, in the shape the 200 and the 409 send.
async function classInfo(sessionId) {
  const { rows } = await pool.query(
    `SELECT cs.id AS session_id, s.id AS section_id, c.code AS course_code, c.name AS course_name,
            s.section_no, ca.id AS campus_id, ca.name AS campus_name
     FROM class_sessions cs
     JOIN sections s  ON s.id = cs.section_id
     JOIN courses c   ON c.id = s.course_id
     JOIN campuses ca ON ca.id = cs.campus_id
     WHERE cs.id = $1`,
    [sessionId]
  );
  const r = rows[0];
  return {
    session_id: r.session_id, section_id: r.section_id, course_code: r.course_code,
    course_name: r.course_name, section_no: r.section_no,
    campus: { id: r.campus_id, name: r.campus_name },
  };
}

// [ADDED] 7: write one row into checkin_attempts (the instructor's "who tried" list).
//   Columns: session_id, user_id, outcome, distance_m, accuracy_m. Values only through $1..$5.
//   accuracy_m and distance_m are whole numbers (INT): Math.round(accuracy); distance may be null.
async function recordAttempt(sessionId, userId, outcome, distance, accuracy) {
  // await pool.query('INSERT INTO checkin_attempts (...) VALUES (...)', [...]);
  await pool.query(
    'INSERT INTO checkin_attempts (session_id, user_id, outcome, distance_m, accuracy_m) VALUES ($1, $2, $3, $4, $5)',
    [sessionId, userId, outcome, distance, Math.round(accuracy)]
  );
}

router.post('/api/checkin', requireLogin, requireRole('student'), async (req, res, next) => {
  const body = req.body || {};
  const lat = toNumber(body.lat);           // a number, or null if it isn't one
  const lng = toNumber(body.lng);
  const accuracy = toNumber(body.accuracy);
  const scan = req.session.scan;            // { session_id, scanned_at } or undefined

  // [ADDED] 1 (step 2): the location must be usable, else
  //   return res.status(400).json({ error: "Couldn't read your location" });
  // Usable = none of the three is null, lat from -90 to 90, lng from -180 to 180, accuracy >= 0.
  if (lat === null || lng === null || accuracy === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || accuracy < 0) {
    return res.status(400).json({ error: "Couldn't read your location" });
  }

  // [ADDED] 2 (step 3): already checked in? Look for an attendance row of THIS student
  // (req.user.id) in the scan's session OR in any session that is still open:
  //   SELECT a.session_id FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id
  //   WHERE a.student_id = $1 AND (a.session_id = $2 OR cs.closed_at IS NULL) LIMIT 1
  //   with [req.user.id, scan ? scan.session_id : null]
  // Found -> return fail(res, 'already_checked_in', await classInfo(<the row's session_id>));
  const marked = await pool.query(
    `SELECT a.session_id FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id
    WHERE a.student_id = $1 AND (a.session_id = $2 OR cs.closed_at IS NULL) LIMIT 1`,
    [req.user.id, scan ? scan.session_id : null]
  );
  if (marked.rowCount) {
    return fail(res, 'already_checked_in', await classInfo(marked.rows[0].session_id));
  }

  // [ADDED] 3 (step 4): no scan in the cookie -> return fail(res, 'no_scan');
  // (No attempt is recorded: without a scan we don't know which session it was.)
  if (!scan) {
    return fail(res, 'no_scan');
  }

  // [ADDED] 4 (step 5): the scan is older than SCAN_MS (Date.now() - scan.scanned_at) ->
  //   record the attempt as 'expired' (no distance), then return fail(res, 'expired');
  if (Date.now() - scan.scanned_at > SCAN_MS) {
    await recordAttempt(scan.session_id, req.user.id, 'expired', null, accuracy);
    return fail(res, 'expired');
  }

  // [ADDED] 5 (step 6): CALL check_in($1, $2, $3, $4, $5) with
  //   [scan.session_id, req.user.id, lat, lng, accuracy], inside try { ... } catch (err) { ... }.
  // In the catch, look at err.code:
  //   'P0001' -> one of OUR reasons, in err.message ('closed', 'not_enrolled', 'low_accuracy',
  //              'too_far'). Record it (distance: Number(err.detail) for too_far, else null),
  //              then return fail(res, err.message);
  //   '23505' -> two taps at once: the primary key refused the second. Record 'duplicate',
  //              then return fail(res, 'already_checked_in', await classInfo(scan.session_id));
  //   anything else -> a real bug: return next(err);  (500, details only in the server log)
  try {
    await pool.query('CALL check_in($1, $2, $3, $4, $5)',
      [scan.session_id, req.user.id, lat, lng, accuracy]);
  } catch (err) {
    if (err.code === 'P0001') {
      const distance = err.message === 'too_far' ? Number(err.detail) : null;
      await recordAttempt(scan.session_id, req.user.id, err.message, distance, accuracy);
      return fail(res, err.message);
    }
    if (err.code === '23505') {
      await recordAttempt(scan.session_id, req.user.id, 'duplicate', null, accuracy);
      return fail(res, 'already_checked_in', await classInfo(scan.session_id));
    }
    return next(err);
  }

  // [ADDED] 6 (step 7): it worked. Record 'ok' (no distance), clear the scan
  // (req.session.scan = null, so a reload is answered by TODO 2), then reply 200:
  //   return res.json({ status: 'checked_in', ...(await classInfo(scan.session_id)) });
  await recordAttempt(scan.session_id, req.user.id, 'ok', null, accuracy);
  req.session.scan = null;
  return res.json({ status: 'checked_in', ...(await classInfo(scan.session_id)) });
});

module.exports = router;
