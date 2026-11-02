const test = require('node:test');
const assert = require('node:assert');
const { MAX_ROWS, classify, totalsOf, publicResults } = require('../lib/userImportRules');

const facts = (over = {}) => ({
  usersByEmail: new Map([['ann@g.siit.tu.ac.th', 1], ['prof@example.com', 4]]),
  ownerByNo: new Map([['6722770001', 1]]),
  ...over,
});
const one = (row, f) => classify([row], f)[0];
const student = { email: 'new@g.siit.tu.ac.th', full_name: 'New', role: 'student', student_no: '6722770099' };

test('a new student, instructor and admin are new_user; student_no is optional', () => {
  assert.equal(one(student, facts()).result, 'new_user');
  assert.equal(one({ ...student, student_no: '' }, facts()).student_no, null);
  assert.equal(one({ email: 'x@gmail.com', full_name: 'X', role: 'instructor' }, facts()).result, 'new_user');
  assert.equal(one({ email: 'y@gmail.com', full_name: 'Y', role: 'admin' }, facts()).result, 'new_user');
});

test('the email is matched in any letter case and with spaces around it', () => {
  assert.equal(one({ email: ' ANN@g.siit.tu.ac.th ' }, facts()).result, 'already_exists');
  assert.equal(one({ ...student, email: ' NEW@G.SIIT.TU.AC.TH ' }, facts()).email, 'new@g.siit.tu.ac.th');
});

test('an existing user is left alone, whatever else the row says', () => {
  const r = one({ email: 'ann@g.siit.tu.ac.th', full_name: '', role: 'nonsense', student_no: '6722770001' }, facts());
  assert.equal(r.result, 'already_exists');
  assert.equal(one({ email: 'prof@example.com', role: 'student', student_no: 'junk' }, facts()).result, 'already_exists');
});

test('every problem reason', () => {
  const f = facts();
  assert.equal(one({ ...student, email: 'nope' }, f).reason, 'invalid_email');
  assert.equal(one({ ...student, role: 'teacher' }, f).reason, 'invalid_role');
  assert.equal(one({ ...student, role: '' }, f).reason, 'invalid_role');
  assert.equal(one({ ...student, full_name: '  ' }, f).reason, 'name_required');
  assert.equal(one({ ...student, email: 'new@gmail.com' }, f).reason, 'not_siit_email');
  assert.equal(one({ ...student, email: 'new@g.siit.tu.ac.th.evil.com' }, f).reason, 'not_siit_email');
  assert.equal(one({ ...student, role: 'instructor' }, f).reason, 'student_no_only_for_students');
  assert.equal(one({ ...student, student_no: '12ab' }, f).reason, 'invalid_student_no');
  assert.equal(one(student, facts({ ownerByNo: new Map([['6722770099', 7]]) })).reason, 'student_no_mismatch');
});

test('an instructor or admin may use any email', () => {
  assert.equal(one({ email: 'z@gmail.com', full_name: 'Z', role: 'instructor' }, facts()).result, 'new_user');
});

test('a student_no held by another user is a mismatch, even when the email already exists', () => {
  const r = one({ email: 'ann@g.siit.tu.ac.th', student_no: '6722770002' }, facts({ ownerByNo: new Map([['6722770002', 9]]) }));
  assert.equal(r.reason, 'student_no_mismatch');
  // the same user holding their own number is fine
  assert.equal(one({ email: 'ann@g.siit.tu.ac.th', student_no: '6722770001' }, facts()).result, 'already_exists');
});

test('a repeated email or student_no is flagged on the later row; row numbers count from 1', () => {
  const rows = [
    student,
    { ...student },
    { ...student, email: 'other@g.siit.tu.ac.th' },
    { ...student, email: 'third@g.siit.tu.ac.th', student_no: '6722770055' },
  ];
  const out = classify(rows, facts());
  assert.deepEqual(out.map((o) => o.row), [1, 2, 3, 4]);
  assert.deepEqual(out.map((o) => o.reason ?? o.result), ['new_user', 'duplicate_row', 'duplicate_row', 'new_user']);
});

test('bad rows do not crash', () => {
  for (const bad of [null, undefined, 5, 'text', [], {}]) {
    assert.equal(classify([bad], facts())[0].reason, 'invalid_email');
  }
});

test('totals count every result, and public results carry no names, roles or numbers', () => {
  const checked = classify([student, { email: 'ann@g.siit.tu.ac.th' }, { email: 'bad' }], facts());
  assert.deepEqual(totalsOf(checked), { new_user: 1, already_exists: 1, problem: 1 });
  const pub = publicResults(checked);
  assert.deepEqual(pub[0], { row: 1, email: 'new@g.siit.tu.ac.th', result: 'new_user' });
  assert.deepEqual(pub[2], { row: 3, email: 'bad', result: 'problem', reason: 'invalid_email' });
  for (const p of pub) assert.ok(!('full_name' in p) && !('role' in p) && !('student_no' in p));
});

test('the row limit matches docs/API.md', () => {
  assert.equal(MAX_ROWS, 500);
});
