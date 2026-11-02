// Field rules for POST /api/courses and PUT /api/courses/:id (docs/API.md, section 2: Courses).
// Pure: no database. Both functions return { error } or { value }, where value holds { code, name }.

const FIELDS = ['code', 'name'];
const MAX_CODE = 20;
const MAX_NAME = 200;

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

// Codes are stored in capitals so "css326" and "CSS326" can't both exist.
function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of FIELDS) {
    if (!(key in r)) continue;
    out[key] = key === 'code' ? text(r[key]).toUpperCase() : text(r[key]);
  }
  return out;
}

function check(course) {
  if (!course.code) return 'Course code is required';
  if (course.code.length > MAX_CODE) return 'Course code is too long';
  if (!course.name) return 'Course name is required';
  if (course.name.length > MAX_NAME) return 'Course name is too long';
  return null;
}

function validateNewCourse(body) {
  const course = { code: '', name: '', ...clean(body) };
  const error = check(course);
  return error ? { error } : { value: course };
}

// current: the row as it is now ({ code, name }).
function validateCourseEdit(body, current) {
  const changes = clean(body);
  if (Object.keys(changes).length === 0) return { error: 'Nothing to change' };
  const course = { code: current.code, name: current.name, ...changes };
  const error = check(course);
  return error ? { error } : { value: course };
}

module.exports = { MAX_CODE, MAX_NAME, validateNewCourse, validateCourseEdit };
