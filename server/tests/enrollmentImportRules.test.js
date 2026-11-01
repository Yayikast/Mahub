const test = require('node:test');
const assert = require('node:assert');
const { classify, totalsOf, publicResults } = require('../lib/enrollmentImportRules');

const facts = (over = {}) => ({
  usersByEmail: new Map([
    ['ann@g.siit.tu.ac.th', { id: 1, role: 'student' }],
    ['mali@g.siit.tu.ac.th', { id: 2, role: 'student' }],
    ['boss@g.siit.tu.ac.th', { id: 3, role: 'admin' }],
    ['prof@example.com', { id: 4, role: 'instructor' }],
  ]),
  ownerByNo: new Map([['6722770001', 1], ['6722770002', 2]]),
  enrolled: new Set([2]),
  canCreate: false,
  ...over,
});
const one = (row, f) => classify([row], f)[0];

test('existing student is enrolled; already enrolled is left alone', () => {
  assert.equal(one({ email: 'ann@g.siit.tu.ac.th' }, facts()).result, 'enroll');
  assert.equal(one({ email: ' MALI@g.siit.tu.ac.th ' }, facts()).result, 'already_enrolled');
});

test('instructor never creates users', () => {
  const r = one({ email: 'new@g.siit.tu.ac.th', full_name: 'New' }, facts());
  assert.deepEqual([r.result, r.reason], ['problem', 'not_a_user']);
});

test('admin creates a SIIT student, with the rules on name, domain and number', () => {
  const f = facts({ canCreate: true });
  assert.equal(one({ email: 'new@g.siit.tu.ac.th', full_name: 'New', student_no: '6722770099' }, f).result, 'new_user');
  assert.equal(one({ email: 'new@g.siit.tu.ac.th', full_name: 'New' }, f).student_no, null);
  assert.equal(one({ email: 'new@gmail.com', full_name: 'New' }, f).reason, 'not_siit_email');
  assert.equal(one({ email: 'new@g.siit.tu.ac.th', full_name: '  ' }, f).reason, 'name_required');
  assert.equal(one({ email: 'new@g.siit.tu.ac.th', full_name: 'N', student_no: '12ab' }, f).reason, 'invalid_student_no');
  assert.equal(one({ email: 'x@g.siit.tu.ac.th.evil.com', full_name: 'N' }, f).reason, 'not_siit_email');
});

test('admins and instructors are refused, for either caller', () => {
  for (const canCreate of [false, true]) {
    assert.equal(one({ email: 'boss@g.siit.tu.ac.th' }, facts({ canCreate })).reason, 'not_a_student');
    assert.equal(one({ email: 'prof@example.com' }, facts({ canCreate })).reason, 'not_a_student');
  }
});

test('student_no held by someone else is a mismatch, even for an existing student', () => {
  assert.equal(one({ email: 'ann@g.siit.tu.ac.th', student_no: '6722770002' }, facts()).reason, 'student_no_mismatch');
  assert.equal(one({ email: 'new@g.siit.tu.ac.th', full_name: 'N', student_no: '6722770001' }, facts({ canCreate: true })).reason, 'student_no_mismatch');
});

test('an existing student keeps their data: a different or junk student_no/name is ignored', () => {
  assert.equal(one({ email: 'ann@g.siit.tu.ac.th', student_no: '6722779999', full_name: 'Other' }, facts()).result, 'enroll');
  assert.equal(one({ email: 'ann@g.siit.tu.ac.th', student_no: '6722770001' }, facts()).result, 'enroll');
  assert.equal(one({ email: 'ann@g.siit.tu.ac.th', student_no: 'N/A' }, facts()).result, 'enroll');
});

test('duplicate email or student_no is flagged on the later row', () => {
  const f = facts({ canCreate: true });
  const r = classify([
    { email: 'a@g.siit.tu.ac.th', full_name: 'A', student_no: '6722770050' },
    { email: 'A@g.siit.tu.ac.th', full_name: 'A' },
    { email: 'b@g.siit.tu.ac.th', full_name: 'B', student_no: '6722770050' },
  ], f);
  assert.deepEqual(r.map((x) => x.result), ['new_user', 'problem', 'problem']);
  assert.deepEqual(r.slice(1).map((x) => x.reason), ['duplicate_row', 'duplicate_row']);
});

test('bad rows do not crash', () => {
  for (const row of [null, 5, 'x', {}, { email: 7 }, { email: 'a'.repeat(300) + '@g.siit.tu.ac.th' }, { email: 'a@@b.c' }]) {
    assert.equal(one(row, facts()).reason, 'invalid_email');
  }
});

test('totals and public results carry no ids or names', () => {
  const checked = classify([{ email: 'ann@g.siit.tu.ac.th' }, { email: 'bad' }], facts());
  assert.deepEqual(totalsOf(checked), { enroll: 1, new_user: 0, already_enrolled: 0, problem: 1 });
  assert.deepEqual(publicResults(checked)[0], { row: 1, email: 'ann@g.siit.tu.ac.th', result: 'enroll' });
});
