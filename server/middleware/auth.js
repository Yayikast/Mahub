// auth.js - the guards in front of private routes (API.md: 401 and 403).
//   requireLogin        : who are you? sets req.user, or 401
//   requireRole(...)    : is your role allowed through this door? or 403
//   ownsSection(...)    : helper for controllers: are you THE teacher of this section? true/false
const pool = require('../db');

// The gate guard. Put it first on every private route.
// cookie-session (app.js) has already checked the cookie's fingerprint: if the
// cookie was missing or faked, req.session is empty.
// Express 5: if the query throws, the error goes to errorHandler by itself.
async function requireLogin(req, res, next) {
  // TODO 1a: no user id in the cookie -> 401 { "error": "Not signed in" } and stop.
  //          The id is in req.session.userId (dev login and Google sign-in put it there).

  // TODO 1b: look the user up EVERY time (role changes and deletions work at once).
  //          SELECT id, email, full_name, role FROM users WHERE id = $1
  //          Use pool.query(sql, [ ... ]), the $1 placeholder like your labs.

  // TODO 1c: no row (the user was deleted) -> 401 { "error": "Not signed in" } and stop.

  // TODO 1d: save the row as req.user, then let them through with next().
}

// The sign maker: requireRole('admin', 'instructor') makes a guard for that door.
// Always put it AFTER requireLogin, because it reads req.user.
function requireRole(...roles) {
  // `roles` is an array, e.g. ['admin', 'instructor'].
  return function (req, res, next) {
    // TODO 2: req.user.role is in `roles` -> next().
    //         Otherwise -> 403 { "error": "Not allowed" }.
    //         Hint: arrays have .includes(...)
  };
}

// Not a guard: controllers call it and get true or false.
//   if (!(await ownsSection(sectionId, req.user.id))) -> 403
async function ownsSection(sectionId, userId) {
  // TODO 3: ask the database whether this user is the teacher of this section:
  //           SELECT 1 FROM sections WHERE id = $1 AND instructor_id = $2
  //         Return true if a row came back, false if not.
  //         Hint: the result has .rows (an array). How do you check it's not empty?
}

module.exports = { requireLogin, requireRole, ownsSection };
