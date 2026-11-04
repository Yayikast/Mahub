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
  // [ADDED] 1a: no user id in the cookie -> 401 { "error": "Not signed in" } and stop.
  //          The id is in req.session.userId (dev login and Google sign-in put it there).
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  // [ADDED] 1b: look the user up EVERY time (role changes and deletions work at once).
  //          SELECT id, email, full_name, role FROM users WHERE id = $1
  //          Use pool.query(sql, [ ... ]), the $1 placeholder like your labs.
  const result = await pool.query( 'SELECT id, email, full_name, role FROM users WHERE id = $1' , [ req.session.userId ] );

  // [ADDED] 1c: no row (the user was deleted) -> 401 { "error": "Not signed in" } and stop.
  if (!result.rowCount) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  // [ADDED] 1d: save the row as req.user, then let them through with next().
  req.user = result.rows[0];
  next();
}

// The sign maker: requireRole('admin', 'instructor') makes a guard for that door.
// Always put it AFTER requireLogin, because it reads req.user.
function requireRole(...roles) {
  // `roles` is an array, e.g. ['admin', 'instructor'].
  return function (req, res, next) {
    // [ADDED] 2: req.user.role is in `roles` -> next().
    //         Otherwise -> 403 { "error": "Not allowed" }.
    //         Hint: arrays have .includes(...)
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
  // [ADDED] 3: ask the database whether this user is the teacher of this section:
  //           SELECT 1 FROM sections WHERE id = $1 AND instructor_id = $2
  //         Return true if a row came back, false if not.
  //         Hint: the result has .rows (an array). How do you check it's not empty?
  const result = await pool.query( 'SELECT 1 FROM sections WHERE id = $1 AND instructor_id = $2' , [ sectionId, userId ] );
  return (result.rowCount > 0);
}

// The student version of ownsSection (issue #11), as a guard: put it after requireLogin and
// requireRole('student'). :id is the section id from the URL, which the student can type
// anything into, so check it: 404 if there's no such section, 403 if I'm not enrolled in it.
async function requireEnrolled(req, res, next) {
  const sectionId = toInt(req.params.id); // a whole number from 1 to INT_MAX, or null

  // [ADDED] 1a: not a real section -> 404 { "error": "Section not found" } and stop.
  //   Two ways to be "not real": sectionId is null ("abc", -1, 99999999999), or no row for
  //   SELECT 1 FROM sections WHERE id = $1
  //   (Check the null first: then the query only ever gets a valid INT.)
  if (!sectionId) {
    return res.status(404).json({ error: 'Section not found' });
  }
  const section = await pool.query( 'SELECT 1 FROM sections WHERE id = $1' , [sectionId] );
  if (!section.rowCount) {
    return res.status(404).json({ error: 'Section not found' });
  }

  // [ADDED] 1b: real, but am I in it? SELECT 1 FROM enrollments WHERE section_id = $1 AND student_id = $2
  //   with [sectionId, req.user.id]. No row -> 403 { "error": "You're not enrolled in this class" } and stop.
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
