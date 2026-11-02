// Field rules for POST /api/users and PUT /api/users/:id (docs/API.md, section 2: Users).
// Pure: no database. The controller loads the current row, this decides if the result is allowed.
// Both functions return { error } or { value }, where value holds only the four allowed fields.

const ROLES = ['admin', 'instructor', 'student'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIIT = /@g\.siit\.tu\.ac\.th$/;
const STUDENT_NO = /^[0-9]{10}$/;
const FIELDS = ['email', 'full_name', 'role', 'student_no'];
const SIIT_ERROR = 'Student emails must end in @g.siit.tu.ac.th';

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

// Trims every field. The email is stored lowercase and an empty student_no becomes null.
function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of FIELDS) {
    if (!(key in r)) continue;
    out[key] = key === 'email' ? text(r[key]).toLowerCase() : text(r[key]);
  }
  if ('student_no' in out && out.student_no === '') out.student_no = null;
  return out;
}

// The rules look at the whole user, so an edit is checked as the user will be after it.
function check(user) {
  if (user.email.length > 254 || !EMAIL.test(user.email)) return 'Invalid email';
  if (!user.full_name) return 'Name is required';
  if (user.full_name.length > 200) return 'Name is too long';
  if (!ROLES.includes(user.role)) return 'Role must be admin, instructor or student';
  if (user.student_no && user.role !== 'student') return 'Only students have a student number';
  if (user.student_no && !STUDENT_NO.test(user.student_no)) return 'Student number must be 10 digits';
  if (user.role === 'student' && !SIIT.test(user.email)) return SIIT_ERROR;
  return null;
}

function validateNewUser(body) {
  const user = { email: '', full_name: '', role: '', student_no: null, ...clean(body) };
  const error = check(user);
  return error ? { error } : { value: user };
}

// current: the row as it is now ({ email, full_name, role, student_no }).
function validateUserEdit(body, current) {
  const changes = clean(body);
  if (Object.keys(changes).length === 0) return { error: 'Nothing to change' };
  const user = {
    email: current.email,
    full_name: current.full_name,
    role: current.role,
    student_no: current.student_no ?? null,
    ...changes,
  };
  const error = check(user);
  return error ? { error } : { value: user };
}

module.exports = { ROLES, SIIT, STUDENT_NO, EMAIL, SIIT_ERROR, text, validateNewUser, validateUserEdit };
