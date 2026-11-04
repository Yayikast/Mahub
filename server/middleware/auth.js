// auth.js - the guards in front of private routes (API.md: 401 and 403).
//   requireLogin        : who are you? sets req.user, or 401
//   requireRole(...)    : is your role allowed through this door? or 403
//   ownsSection(...)    : helper for controllers: are you THE teacher of this section? true/false
//   requireEnrolled     : for /api/my/classes/:id: is this section real (404) and am I in it (403)?
const pool = require('../db');
const { toInt } = require('../lib/fields');

// The gate guard. Put it first on every private route.
// cookie-session (app.js) has already checked the cookie's fingerprint: if the
// cookie was missing or faked, req.session is empty.
// Express 5: if the query throws, the error goes to errorHandler by itself.
async function requireLogin(req, res, next) {
  // No user id in the cookie (dev login and Google sign-in put it there): not signed in.
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  // Look the user up on every request, so a role change or a deletion works at once.
  const result = await pool.query( 'SELECT id, email, full_name, role FROM users WHERE id = $1' , [ req.session.userId ] );

  // The user was deleted since signing in.
  if (!result.rowCount) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  req.user = result.rows[0];
  next();
}

// The sign maker: requireRole('admin', 'instructor') makes a guard for that door.
// Always put it AFTER requireLogin, because it reads req.user.
function requireRole(...roles) {
  // `roles` is an array, e.g. ['admin', 'instructor'].
  return function (req, res, next) {
    if (roles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({ error: 'Not allowed' });
    }
  };
}

// Not a guard: controllers call it and get true or false.
//   if (!(await ownsSection(sectionId, req.user.id))) -> 403
async function ownsSection(sectionId, userId) {
  const result = await pool.query( 'SELECT 1 FROM sections WHERE id = $1 AND instructor_id = $2' , [ sectionId, userId ] );
  return (result.rowCount > 0);
}

// The student version of ownsSection (issue #11), as a guard: put it after requireLogin and
// requireRole('student'). :id is the section id from the URL, which the student can type
// anything into, so check it: 404 if there's no such section, 403 if I'm not enrolled in it.
async function requireEnrolled(req, res, next) {
  const sectionId = toInt(req.params.id); // a whole number from 1 to INT_MAX, or null

  // Not a real section: a bad id ("abc", -1, 99999999999), checked first so the query only
  // ever gets a valid INT, or an id with no section.
  if (!sectionId) {
    return res.status(404).json({ error: 'Section not found' });
  }
  const section = await pool.query( 'SELECT 1 FROM sections WHERE id = $1' , [sectionId] );
  if (!section.rowCount) {
    return res.status(404).json({ error: 'Section not found' });
  }

  // A real section, but am I enrolled in it? "I" is the login cookie's user, never the URL.
  const enrolled = await pool.query(
    'SELECT 1 FROM enrollments WHERE section_id = $1 AND student_id = $2',
    [sectionId, req.user.id]
  );
  if (!enrolled.rowCount) {
    return res.status(403).json({ error: "You're not enrolled in this class" });
  }

  next();
}

module.exports = { requireLogin, requireRole, ownsSection, requireEnrolled };
