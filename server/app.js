// app.js - builds the Express app and exports it. It never calls listen():
// server.js does that on a laptop, and Vercel does it in production.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // first, so every file below can read .env
const express = require('express');
const cookieSession = require('cookie-session');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const sectionRoutes = require('./routes/sections');
const enrollmentImportRoutes = require('./routes/enrollmentImport');
const campusRoutes = require('./routes/campuses');
const auditRoutes = require('./routes/audit');
const attendanceRoutes = require('./routes/attendance');
const googleRoutes = require('./routes/google');
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
  // maxAge: ?    how long a login lasts, in milliseconds. Pick 8 hours: 8 * 60 * 60 * 1000
  maxAge: 8 * 60 * 60 * 1000
}));

// [ADDED 7]: mount the routes under /api, so GET /health in routes/health.js
// becomes GET /api/health. Hint: app.use('/api', ...)
app.use('/api', healthRoutes);

// [ADDED] 5: mount routes/auth.js. Its paths are written in full ('/auth/...', '/api/me'),
// so there is no prefix this time: just app.use(...) with the router's name.
// (Load it at the top first, next to healthRoutes: const authRoutes = require(...).)
app.use(authRoutes);
app.use('/api', sessionRoutes);
// TODO 6 (PR 5): mount Google sign-in, routes/google.js. Its paths are full (/auth/google...),
// so no prefix, like authRoutes. Load it at the top first: const googleRoutes = require(...);
app.use(googleRoutes);

// The admin and attendance routes. Each router guards its own routes (requireLogin and
// requireRole), so they can be mounted with a plain prefix. sectionRoutes and
// enrollmentImportRoutes share /api/sections; attendanceRoutes has full paths like sessionRoutes.
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/sections', enrollmentImportRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api', attendanceRoutes);

// [ADDED 8]: the last two stops. Which goes first, notFound or errorHandler, and why?
// Hint: both are app.use(...), and both must come after all the routes.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
