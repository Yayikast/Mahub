// "Does it exist, and is it mine?" for the instructor routes, in one query each, so the 404 and
// the 403 can never disagree with the data the controller goes on to use.
// Each returns { section } / { session }, or { status, error } for the controller to send.
// The caller is already known to be an instructor (the route checks that), and req.user.id is theirs.

const pool = require('../db');
const { toInt } = require('./fields');

// 1 up to INT_MAX, or null. A bigger number would make Postgres throw (22003) and send a 500.
const idOf = (v) => toInt(v);

async function ownSection(req) {
  const id = idOf(req.params.id);
  const { rows } = id ? await pool.query('SELECT id, instructor_id FROM sections WHERE id = $1', [id]) : { rows: [] };
  if (rows.length === 0) return { status: 404, error: 'Section not found' };
  if (rows[0].instructor_id !== req.user.id) return { status: 403, error: 'Not your section' };
  return { section: rows[0] };
}

async function ownSession(req) {
  const id = idOf(req.params.id);
  const { rows } = id
    ? await pool.query(
        `SELECT cs.id, cs.section_id, cs.closed_at, s.instructor_id
         FROM class_sessions cs JOIN sections s ON s.id = cs.section_id
         WHERE cs.id = $1`,
        [id]
      )
    : { rows: [] };
  if (rows.length === 0) return { status: 404, error: 'Session not found' };
  if (rows[0].instructor_id !== req.user.id) return { status: 403, error: 'Not your session' };
  return { session: rows[0] };
}

module.exports = { idOf, ownSection, ownSession };
