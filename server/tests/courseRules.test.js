const test = require('node:test');
const assert = require('node:assert');
const { validateNewCourse, validateCourseEdit, MAX_CODE, MAX_NAME } = require('../lib/courseRules');

const course = { code: 'CSS326', name: 'Database Programming Laboratory' };

test('a valid course is accepted; code is stored in capitals and both fields are trimmed', () => {
  assert.deepEqual(validateNewCourse(course).value, course);
  assert.deepEqual(validateNewCourse({ code: ' css326 ', name: '  Database Systems ' }).value,
    { code: 'CSS326', name: 'Database Systems' });
});

test('unknown fields are dropped', () => {
  assert.deepEqual(validateNewCourse({ ...course, id: 9, sections: [] }).value, course);
});

test('a missing, blank or non-text code or name is refused', () => {
  assert.equal(validateNewCourse({ name: 'X' }).error, 'Course code is required');
  assert.equal(validateNewCourse({ code: '  ', name: 'X' }).error, 'Course code is required');
  assert.equal(validateNewCourse({ code: 'X' }).error, 'Course name is required');
  assert.equal(validateNewCourse({ code: 'X', name: ['a'] }).error, 'Course name is required');
  assert.equal(validateNewCourse(null).error, 'Course code is required');
  assert.equal(validateNewCourse(undefined).error, 'Course code is required');
});

test('code and name have a length limit', () => {
  assert.equal(validateNewCourse({ code: 'A'.repeat(MAX_CODE), name: 'X' }).error, undefined);
  assert.equal(validateNewCourse({ code: 'A'.repeat(MAX_CODE + 1), name: 'X' }).error, 'Course code is too long');
  assert.equal(validateNewCourse({ code: 'X', name: 'N'.repeat(MAX_NAME) }).error, undefined);
  assert.equal(validateNewCourse({ code: 'X', name: 'N'.repeat(MAX_NAME + 1) }).error, 'Course name is too long');
});

test('an edit keeps what it does not mention', () => {
  assert.deepEqual(validateCourseEdit({ name: 'New name' }, course).value, { code: 'CSS326', name: 'New name' });
  assert.deepEqual(validateCourseEdit({ code: 'css327' }, course).value, { code: 'CSS327', name: course.name });
});

test('an edit cannot blank a field', () => {
  assert.equal(validateCourseEdit({ code: '' }, course).error, 'Course code is required');
  assert.equal(validateCourseEdit({ name: '   ' }, course).error, 'Course name is required');
});

test('an empty edit, or one with only unknown fields, is refused', () => {
  assert.equal(validateCourseEdit({}, course).error, 'Nothing to change');
  assert.equal(validateCourseEdit({ id: 3 }, course).error, 'Nothing to change');
  assert.equal(validateCourseEdit(undefined, course).error, 'Nothing to change');
});
