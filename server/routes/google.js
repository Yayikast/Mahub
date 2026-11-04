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

router.get('/auth/google', (req, res) => {
  // TODO 1: make a random state and remember it in the login cookie.
  //   - 16 random bytes as hex, like your SESSION_SECRET: crypto.randomBytes(16).toString('hex')
  //   - save it as req.session.oauthState
  // The code below sends it to Google as `state`, so the variable must be called state.
  // const state = ...;
  // req.session.oauthState = ...;

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
  // TODO 2: the state check (Lesson 9A). Google sends it back as req.query.state; ours is in
  // req.session.oauthState. If ours is missing OR they differ:
  //   return res.status(400).json({ error: 'Sign-in failed, try again' });
  // After the check, set req.session.oauthState = null, so the same state can't be used twice.

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
    return res.status(400).json({ error: 'Sign-in failed, try again' });
  }
  if (!profile.email_verified) return res.redirect('/not-registered');

  const sub = profile.sub;                      // the Google account's permanent id
  const email = profile.email.toLowerCase();    // users.email is stored in lower case
  const hd = profile.hd;                        // the Workspace domain; undefined for personal Gmail

  // TODO 3: find the user (Lesson 9A, part 2).
  //   a) SELECT id, role FROM users WHERE google_sub = $1          (every sign-in after the first)
  //   b) not found? SELECT id, role FROM users WHERE email = $1 AND google_sub IS NULL
  //      (first sign-in: the admin only typed the email. "google_sub IS NULL" means an address
  //      already linked to another Google account can't be taken over.)
  //      Found? Save the sub: UPDATE users SET google_sub = $1 WHERE id = $2
  //   c) still nothing? return res.redirect('/not-registered');
  // Keep the row you found in a variable called user.

  // TODO 4: the domain rule. A student must use the school account:
  //   if the role is 'student' and hd isn't STUDENT_DOMAIN -> return res.redirect('/not-registered');

  // TODO 5: sign them in, like dev login: req.session.userId = user.id
  // Then send them on: to returnTo if there is one (and clear it), otherwise their home page:
  //   const next = req.session.returnTo;
  //   req.session.returnTo = null;
  //   return res.redirect(next || HOME[user.role]);
});

module.exports = router;
