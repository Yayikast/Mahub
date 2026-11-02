// app.js - builds the Express app and exports it. It never calls listen():
// server.js does that on a laptop, and Vercel does it in production.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // first, so every file below can read .env
const express = require('express');
const cookieSession = require('cookie-session');
const healthRoutes = require('./routes/health');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

// Every request goes through the app.use lines below IN ORDER, top to bottom.

// [ADDED 4]: trust exactly ONE proxy (Vercel's), so secure cookies work there.
// Hint: one line, app.set(...)
app.set('trust proxy', 1);

// [ADDED 5]: read JSON request bodies into req.body (same line as your Week 5 lab).
app.use(express.json());

// [ADDED 6]: the signed login cookie. Fill in the four options marked ?.
app.use(cookieSession({
  name: 'mahub',
  keys: [process.env.SESSION_SECRET], // the secret that makes the fingerprint (Lesson 1)
  // httpOnly: ?  true = page JavaScript can't read the cookie, so injected code can't steal it
  httpOnly: true,
  // secure: ?    only send over HTTPS. True when deployed, false on your laptop (plain http).
  //              Hint: process.env.NODE_ENV === 'production' (Vercel sets this)
  secure: process.env.NODE_ENV === 'production',
  // sameSite: ?  'lax' = sent when you arrive from another site by a normal link or
  //              redirect (like coming back from Google), but not on other sites' forms
  sameSite: 'lax',
  // maxAge: ?    how long a login lasts, in milliseconds. Pick 7 days: 7 * 24 * 60 * 60 * 1000
  maxAge: 7 * 24 * 60 * 60 * 1000
}));

// [ADDED 7]: mount the routes under /api, so GET /health in routes/health.js
// becomes GET /api/health. Hint: app.use('/api', ...)
// (Later lessons add the auth routes and Pinya's routes here.)
app.use('/api', healthRoutes);

// [ADDED 8]: the last two stops. Which goes first, notFound or errorHandler, and why?
// Hint: both are app.use(...), and both must come after all the routes.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
