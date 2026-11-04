// routes/auth.js - who am I, sign out, and the dev login (API.md section 1).
// The paths are written in full ('/auth/...', '/api/me'), so app.js mounts this
// router without a prefix.
const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');
const { toInt } = require('../lib/fields');

const router = express.Router();

// GET /api/me - who am I? The screens call this when they load.
router.get('/api/me', requireLogin, (req, res) => {
  // [ADDED] 4: reply with the signed-in user. requireLogin already loaded it.
  return res.json(req.user);
});

// POST /auth/logout - sign out.
router.post('/auth/logout', requireLogin, (req, res) => {
  // [ADDED] 3: empty the login cookie, then reply { "ok": true }.
  //         With cookie-session you empty it by setting req.session to null.
  req.session = null;
  return res.json({ 'ok': true });
});

// The dev login exists ONLY when DEV_LOGIN=1 (your laptop). On Vercel it is never
// set, so these two routes are never created: a request for them reaches notFound
// and gets 404, exactly as if they didn't exist.
// Second lock (Boeing's review): even if someone sets DEV_LOGIN=1 on Vercel by
// mistake, NODE_ENV is 'production' and VERCEL is set there, so it stays off.
const devLogin = process.env.DEV_LOGIN === '1'
  && process.env.NODE_ENV !== 'production'
  && !process.env.VERCEL;

if (devLogin) {
  // GET /auth/dev-users - the users the login screen shows as buttons.
  router.get('/auth/dev-users', async (req, res) => {
    // [ADDED] 2: SELECT id, full_name, email, role FROM users ORDER BY id
    //         and reply with all the rows (an array).
    const result = await pool.query( 'SELECT id, full_name, email, role FROM users ORDER BY id' );
    return res.json(result.rows);
  });

  // POST /auth/dev-login { "user_id": 7 } - sign in as that user, no Google.
  router.post('/auth/dev-login', async (req, res) => {
    // [ADDED] 1a: read user_id from the body (req.body). If it isn't a whole number
    //          -> 400 { "error": "user_id is required" } and stop.
    //          Hint: Number.isInteger(x) is true for 7, false for "7", undefined, 1.5
    // [ADDED] 9 (PR 7, from Pinya's #95): an id above 2147483647 doesn't fit an INT column and makes
    // Postgres answer with a 500. Use toInt from ../lib/fields (1 up to INT_MAX, or null) instead
    // of the Number.isInteger check below: const userId = toInt((req.body || {}).user_id);
    const userId = toInt((req.body || {}).user_id);
    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // [ADDED] 1b: find that user: SELECT id, full_name, email, role FROM users WHERE id = $1
    //          No row -> 400 { "error": "Unknown user" } and stop.
    const result = await pool.query( 'SELECT id, full_name, email, role FROM users WHERE id = $1' , [ userId ] );
    if (!result.rowCount) {
      return res.status(400).json({ error: 'Unknown user' });
    }

    // [ADDED] 1c: sign them in: put their id into the cookie, in req.session.userId
    //          (the same place requireLogin reads it from), then reply with the user.
    req.session.userId = result.rows[0].id;
    return res.json( result.rows[0] );
  });
}

module.exports = router;
