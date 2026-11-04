// scan.js - what the projected QR code opens (issue #20, docs/API.md section 4).
// GET /scan?s=12&c=ab39f2 -> the code must be the session's CURRENT one; if so the scan is
// remembered in the signed cookie, and the student goes on to sign in or to /checkin.
// Nothing is written to checkin_attempts here: the student usually isn't signed in yet.
const express = require('express');
const pool = require('../db');
const { idOf } = require('../lib/ownership');

const router = express.Router();

const FAILED = '/scan-failed?reason=expired';

router.get('/scan', async (req, res) => {
  // Read the link. s must be a positive whole number and c some text; anything else is not
  // a code we made, so it fails the same way an old code does.
  const sessionId = idOf(req.query.s);
  const code = typeof req.query.c === 'string' ? req.query.c : null;
  if (!sessionId || !code) return res.redirect(FAILED);

  // [ADDED] 1: is this the session's current code? ONE query, values only through $1 and $2.
  // Find the class_sessions row whose id is sessionId, ONLY IF all three hold:
  //   - it's still open            (closed_at IS NULL)
  //   - c is its current code      (qr_code = $2)
  //   - that code hasn't run out   (qr_expires_at > now())
  // No row -> return res.redirect(FAILED);
  // const result = await pool.query('SELECT id FROM class_sessions WHERE ...', [sessionId, code]);
  const result = await pool.query(
    'SELECT id FROM class_sessions WHERE id = $1 AND closed_at IS NULL AND qr_code = $2 AND qr_expires_at > now()',
    [sessionId, code]
  );
  if (!result.rowCount) {
    return res.redirect(FAILED);
  }

  // [ADDED] 2: remember the scan in the signed cookie, for POST /api/checkin (it must be < 90 s old).
  //   req.session.scan = { session_id: ..., scanned_at: Date.now() };
  // Date.now() is the time in milliseconds, so the check-in can work out how old the scan is.
  req.session.scan = { session_id: sessionId, scanned_at: Date.now() };

  // [ADDED] 3: where next?
  //   not signed in (no req.session.userId) -> '/auth/google?returnTo=/checkin'
  //                                            (so they come back to the check-in, not their home page)
  //   signed in                             -> '/checkin'
  if (!req.session.userId) {
    return res.redirect('/auth/google?returnTo=/checkin');
  }
  return res.redirect('/checkin');
});

module.exports = router;
