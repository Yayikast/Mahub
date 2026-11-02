// Input rules for POST /api/sections/:id/sessions (docs/API.md, section 3). Pure: no database.
// Whether the campus exists needs the database; the controller gets that from the foreign key.

const { toInt } = require('./fields');

// Returns { error } or { value: { campus_id } }.
function validateOpenSession(body) {
  const b = body && typeof body === 'object' ? body : {};
  const campusId = toInt(b.campus_id);
  if (campusId === null) return { error: 'Choose a campus' };
  return { value: { campus_id: campusId } };
}

module.exports = { validateOpenSession };
