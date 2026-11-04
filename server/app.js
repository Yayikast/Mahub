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

// Trust exactly ONE proxy (Vercel's), so secure cookies and req.protocol work there.
app.set('trust proxy', 1);

// Read JSON request bodies into req.body.
app.use(express.json());

// The signed login cookie.
app.use(cookieSession({
  name: 'mahub',
  keys: [process.env.SESSION_SECRET],           // the secret that makes the fingerprint
  httpOnly: true,                               // page JavaScript can't read it, so injected code can't steal it
  secure: process.env.NODE_ENV === 'production', // HTTPS only when deployed (Vercel sets NODE_ENV)
  sameSite: 'lax',                              // still sent when Google redirects back, not on other sites' forms
  maxAge: 8 * 60 * 60 * 1000                    // a login lasts 8 hours
}));

// GET /health in routes/health.js becomes GET /api/health.
app.use('/api', healthRoutes);

// These routers write their paths in full ('/auth/...', '/api/me'), so they have no prefix.
app.use(authRoutes);
app.use(googleRoutes);
// TODO 4 (PR 6): mount routes/scan.js. Its path is the full '/scan', so no prefix.
// Load it at the top first: const scanRoutes = require(...);
app.use('/api', sessionRoutes);

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

// The last two stops, after all the routes: notFound answers 404 when no route matched;
// errorHandler (four arguments) catches every error a route threw or passed to next(err).
app.use(notFound);
app.use(errorHandler);

module.exports = app;
