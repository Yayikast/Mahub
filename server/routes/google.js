// google.js - Google sign-in (issue #10, docs/API.md section 1).
// GET /auth/google sends the browser to Google; Google sends it back to /auth/google/callback.
const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db');

const router = express.Router();

const google = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
});

const STUDENT_DOMAIN = 'g.siit.tu.ac.th';
const HOME = { admin: '/admin', instructor: '/instructor', student: '/me' };

// Where Google sends the browser back. It must be on the list in Google Console, exactly.
// Deployed: PUBLIC_URL (https://mahub.live). On a laptop: the address the browser is on
// (localhost:5173 through Vite, or localhost:3000). Google refuses any address not on its list.
function callbackUrl(req) {
  const origin = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${origin.replace(/\/+$/, '')}/auth/google/callback`;
}

// returnTo may only be a path on our own site: "/checkin" yes, "//evil.com" or "https://evil.com" no.
function safePath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\')
    ? p : null;
}

// A sign-in that went wrong (Cancel at Google, lost cookie, bad code) goes back to the sign-in
// page, which shows a message, instead of a raw JSON error on a blank page.
const SIGNIN_FAILED = '/?error=signin';

router.get('/auth/google', (req, res) => {
  // A random state, remembered in the signed cookie and sent to Google. The callback only
  // accepts it if it comes back unchanged, so nobody can sign you in to their account.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  req.session.returnTo = safePath(req.query.returnTo);
  const url = google.generateAuthUrl({
    redirect_uri: callbackUrl(req),
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
  return res.redirect(url);
});

router.get('/auth/google/callback', async (req, res) => {
  // The state must match the one we saved; then it's cleared, so it works only once.
  if (!req.session.oauthState || req.session.oauthState !== req.query.state) {
    return res.redirect(SIGNIN_FAILED);
  }
  req.session.oauthState = null;

  // Swap the one-time code for the ID token, and check the token: Google's signature, made for
  // OUR client ID (audience), not expired. If anything is wrong (or the user pressed Cancel at
  // Google, so there's no code), the library throws.
  let profile;
  try {
    const { tokens } = await google.getToken({ code: req.query.code, redirect_uri: callbackUrl(req) });
    const ticket = await google.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    profile = ticket.getPayload();
  } catch (err) {
    console.error({ error: err.message });
    return res.redirect(SIGNIN_FAILED);
  }
  if (!profile.email_verified) return res.redirect('/not-registered');

  const sub = profile.sub;                      // the Google account's permanent id
  const email = profile.email.toLowerCase();    // users.email is stored in lower case
  const hd = profile.hd;                        // the Workspace domain; undefined for personal Gmail

  // Find the user: by google_sub on every sign-in after the first.
  let result = await pool.query('SELECT id, role FROM users WHERE google_sub = $1', [sub]);

  // First sign-in: the admin only typed the email. "google_sub IS NULL" means an address
  // already linked to another Google account can't be taken over. Then save the sub.
  if (!result.rowCount) {
    result = await pool.query(
      'SELECT id, role FROM users WHERE email = $1 AND google_sub IS NULL', [email]);
    if (result.rowCount) {
      // [ADDED by Claude] (Boeing's review): two first sign-ins at the same moment can both get
      // here. The UPDATE checks google_sub IS NULL again, at the moment it writes, so only one
      // can link the row. rowCount 0 means the other sign-in won: this one isn't let in.
      const linked = await pool.query(
        'UPDATE users SET google_sub = $1 WHERE id = $2 AND google_sub IS NULL',
        [sub, result.rows[0].id]);
      if (linked.rowCount === 0) {
        return res.redirect('/not-registered');
      }
    }
  }

  if (!result.rowCount) {
    return res.redirect('/not-registered');
  }
  const user = result.rows[0];

  // A student must use the school account; staff may use any Google account.
  if (user.role === 'student' && hd !== STUDENT_DOMAIN) {
    return res.redirect('/not-registered');
  }

  // Signed in (the same as dev login), then on to returnTo once, or their home page.
  req.session.userId = user.id;
  const next = req.session.returnTo;
  req.session.returnTo = null;
  return res.redirect(next || HOME[user.role]);
});

module.exports = router;
