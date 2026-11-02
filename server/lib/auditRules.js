// Query and row shapes for GET /api/audit (docs/API.md, section 2: Audit log).
// Pure: no database.

const { toInt } = require('./fields');

const TYPES = ['attendance', 'enrollment', 'import'];
const DEFAULT_LIMIT = 100; // the same default the screens' fake server uses
const MAX_LIMIT = 500;

const blank = (v) => v === undefined || v === '';

// query is req.query. Returns { limit, type } (type is null for "all"), or { error }.
function parseAuditQuery(query) {
  const q = query && typeof query === 'object' ? query : {};

  let limit = DEFAULT_LIMIT;
  if (!blank(q.limit)) {
    limit = toInt(q.limit, 1, MAX_LIMIT);
    if (limit === null) return { error: `limit must be a whole number from 1 to ${MAX_LIMIT}` };
  }

  let type = null;
  if (!blank(q.type)) {
    if (!TYPES.includes(q.type)) return { error: 'type must be attendance, enrollment or import' };
    type = q.type;
  }
  return { limit, type };
}

// Each type has its own shape, so a screen never sees a column that doesn't apply.
function shapeAuditRow(row) {
  const { id, type, action, changed_by, changed_at } = row;
  if (type === 'enrollment') {
    return { id, type, action, section_id: row.section_id, student_id: row.student_id, changed_by, changed_at };
  }
  if (type === 'import') {
    return { id, type, action, section_id: row.section_id, summary: row.summary, changed_by, changed_at };
  }
  return {
    id, type: 'attendance', action,
    session_id: row.session_id, student_id: row.student_id,
    old_status: row.old_status, new_status: row.new_status,
    changed_by, changed_at,
  };
}

module.exports = { TYPES, DEFAULT_LIMIT, MAX_LIMIT, parseAuditQuery, shapeAuditRow };
