const test = require('node:test');
const assert = require('node:assert');
const { validateNewSection, validateSectionEdit, MAX_TERM, MAX_SECTION_NO } = require('../lib/sectionRules');
const { toInt, toNumber, INT_MAX } = require('../lib/fields');

const section = { course_id: 1, instructor_id: 2, term: '2026-1', section_no: 1 };

test('toInt and toNumber accept numbers and numeric strings only', () => {
  assert.equal(toInt(5), 5);
  assert.equal(toInt(' 5 '), 5);
  for (const bad of [0, -1, 1.5, '1.5', '', '  ', 'abc', null, undefined, true, [], {}, NaN, Infinity, INT_MAX + 1]) {
    assert.equal(toInt(bad), null, String(bad));
  }
  assert.equal(toInt(0, 0, 10), 0);
  assert.equal(toNumber('14.07'), 14.07);
  assert.equal(toNumber(-3), -3);
  for (const bad of ['', 'x', null, undefined, NaN, Infinity, true, {}]) assert.equal(toNumber(bad), null, String(bad));
});

test('a valid section is accepted; term is trimmed; ids may arrive as digit strings', () => {
  assert.deepEqual(validateNewSection(section).value, section);
  assert.deepEqual(validateNewSection({ course_id: '1', instructor_id: '2', term: ' 2026-1 ', section_no: '1' }).value, section);
});

test('unknown fields are dropped', () => {
  assert.deepEqual(Object.keys(validateNewSection({ ...section, id: 9, course_code: 'X' }).value).sort(),
    ['course_id', 'instructor_id', 'section_no', 'term']);
});

test('every missing or wrong field is refused', () => {
  assert.equal(validateNewSection({ ...section, course_id: undefined }).error, 'course_id must be a course id');
  assert.equal(validateNewSection({ ...section, course_id: 'abc' }).error, 'course_id must be a course id');
  assert.equal(validateNewSection({ ...section, course_id: 0 }).error, 'course_id must be a course id');
  assert.equal(validateNewSection({ ...section, instructor_id: -1 }).error, 'instructor_id must be a user id');
  assert.equal(validateNewSection({ ...section, instructor_id: 1.5 }).error, 'instructor_id must be a user id');
  assert.equal(validateNewSection({ ...section, term: '   ' }).error, 'Term is required');
  assert.equal(validateNewSection({ ...section, term: 'T'.repeat(MAX_TERM + 1) }).error, 'Term is too long');
  assert.match(validateNewSection({ ...section, section_no: 0 }).error, /^Section number/);
  assert.match(validateNewSection({ ...section, section_no: MAX_SECTION_NO + 1 }).error, /^Section number/);
  assert.match(validateNewSection({ ...section, section_no: 'one' }).error, /^Section number/);
  assert.equal(validateNewSection(null).error, 'course_id must be a course id');
});

test('an edit keeps what it does not mention', () => {
  assert.deepEqual(validateSectionEdit({ section_no: 2 }, section).value, { ...section, section_no: 2 });
  assert.deepEqual(validateSectionEdit({ term: '2026-2', instructor_id: 5 }, section).value,
    { ...section, term: '2026-2', instructor_id: 5 });
});

test('an edit cannot blank or break a field', () => {
  assert.equal(validateSectionEdit({ term: '' }, section).error, 'Term is required');
  assert.equal(validateSectionEdit({ course_id: 'x' }, section).error, 'course_id must be a course id');
  assert.match(validateSectionEdit({ section_no: 0 }, section).error, /^Section number/);
});

test('an empty edit, or one with only unknown fields, is refused', () => {
  assert.equal(validateSectionEdit({}, section).error, 'Nothing to change');
  assert.equal(validateSectionEdit({ id: 3 }, section).error, 'Nothing to change');
  assert.equal(validateSectionEdit(undefined, section).error, 'Nothing to change');
});
