const test = require('node:test');
const assert = require('node:assert');
const { validateNewUser, validateUserEdit, SIIT_ERROR } = require('../lib/userRules');

const student = { email: 'ann@g.siit.tu.ac.th', full_name: 'Ann', role: 'student', student_no: '6722770001' };
const instructor = { email: 'prof@example.com', full_name: 'Prof', role: 'instructor', student_no: null };

test('a valid student, instructor and admin are accepted', () => {
  assert.deepEqual(validateNewUser(student).value, student);
  assert.deepEqual(validateNewUser(instructor).value, instructor);
  assert.equal(validateNewUser({ email: 'a@b.co', full_name: 'Boss', role: 'admin' }).value.student_no, null);
});

test('the email is trimmed and stored lowercase; the other fields are trimmed', () => {
  const { value } = validateNewUser({ ...student, email: '  ANN@G.SIIT.TU.AC.TH ', full_name: '  Ann  ' });
  assert.equal(value.email, 'ann@g.siit.tu.ac.th');
  assert.equal(value.full_name, 'Ann');
});

test('an empty student_no becomes null; unknown fields are dropped', () => {
  const { value } = validateNewUser({ ...student, student_no: '  ', id: 9, created_by: 1 });
  assert.equal(value.student_no, null);
  assert.deepEqual(Object.keys(value).sort(), ['email', 'full_name', 'role', 'student_no']);
});

test('bad email, empty name and bad role are refused', () => {
  assert.equal(validateNewUser({ ...instructor, email: 'not-an-email' }).error, 'Invalid email');
  assert.equal(validateNewUser({ ...instructor, email: undefined }).error, 'Invalid email');
  assert.equal(validateNewUser({ ...instructor, full_name: '   ' }).error, 'Name is required');
  assert.equal(validateNewUser({ ...instructor, role: 'teacher' }).error, 'Role must be admin, instructor or student');
  assert.equal(validateNewUser({ ...instructor, role: undefined }).error, 'Role must be admin, instructor or student');
  assert.equal(validateNewUser(null).error, 'Invalid email');
});

test('a student needs an SIIT email, in any letter case; admins and instructors do not', () => {
  assert.equal(validateNewUser({ ...student, email: 'ann@gmail.com' }).error, SIIT_ERROR);
  assert.equal(validateNewUser({ ...student, email: 'ann@g.siit.tu.ac.th.evil.com' }).error, SIIT_ERROR);
  assert.equal(validateNewUser({ ...student, email: 'Ann@G.SIIT.TU.AC.TH' }).error, undefined);
  assert.equal(validateNewUser({ ...instructor, email: 'x@gmail.com' }).error, undefined);
});

test('student_no is for students only, and must be 10 digits', () => {
  assert.equal(validateNewUser({ ...instructor, student_no: '6722770001' }).error, 'Only students have a student number');
  assert.equal(validateNewUser({ ...student, student_no: '12ab' }).error, 'Student number must be 10 digits');
  assert.equal(validateNewUser({ ...student, student_no: '672277000' }).error, 'Student number must be 10 digits');
  assert.equal(validateNewUser({ ...student, student_no: 6722770001 }).error, undefined);
});

test('an edit keeps what it does not mention', () => {
  const { value } = validateUserEdit({ full_name: 'Ann B' }, student);
  assert.deepEqual(value, { ...student, full_name: 'Ann B' });
});

test('an edit is checked on the user as it will be after the edit', () => {
  // becoming a student with a non-SIIT email
  assert.equal(validateUserEdit({ role: 'student' }, instructor).error, SIIT_ERROR);
  // a student getting a non-SIIT email
  assert.equal(validateUserEdit({ email: 'ann@gmail.com' }, student).error, SIIT_ERROR);
  // leaving the student role while a student_no is still set
  assert.equal(validateUserEdit({ role: 'instructor' }, student).error, 'Only students have a student number');
  // ...unless the number is cleared in the same edit
  assert.equal(validateUserEdit({ role: 'instructor', student_no: null }, student).value.student_no, null);
});

test('an edit can change a student into an instructor with a non-SIIT email', () => {
  const { value } = validateUserEdit({ role: 'instructor', email: 'Ann@Gmail.com', student_no: '' }, student);
  assert.deepEqual(value, { email: 'ann@gmail.com', full_name: 'Ann', role: 'instructor', student_no: null });
});

test('an empty edit, or one with only unknown fields, is refused', () => {
  assert.equal(validateUserEdit({}, student).error, 'Nothing to change');
  assert.equal(validateUserEdit({ id: 5, google_sub: 'x' }, student).error, 'Nothing to change');
  assert.equal(validateUserEdit(undefined, student).error, 'Nothing to change');
});
