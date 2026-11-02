const test = require('node:test');
const assert = require('node:assert');
const { validateMark, buildRoster } = require('../lib/attendanceRules');

test('a mark is present or excused, nothing else', () => {
  assert.deepEqual(validateMark({ status: 'present' }), { value: { status: 'present' } });
  assert.deepEqual(validateMark({ status: 'excused', extra: 1 }), { value: { status: 'excused' } });
  for (const body of [undefined, null, {}, { status: 'absent' }, { status: 'PRESENT' }, { status: '' }, { status: 1 }, { status: ['present'] }, 'present']) {
    assert.deepEqual(validateMark(body), { error: 'Status must be present or excused' }, JSON.stringify(body));
  }
});

const header = {
  id: 12, opened_at: '2026-11-02T09:00:00Z', closed_at: null,
  section_id: 3, course_code: 'CSS326', course_name: 'Database Programming Laboratory', term: '2026-1', section_no: 1,
  campus_id: 1, campus_name: 'Rangsit',
};
const row = (id, status, extra = {}) => ({
  student_id: id, full_name: `S${id}`, student_no: `67227700${id}`, status,
  method: status === 'absent' ? null : 'qr', recorded_at: status === 'absent' ? null : '2026-11-02T09:03:11Z', ...extra,
});

test('the roster has the contract shape, and is_open follows closed_at', () => {
  const r = buildRoster(header, [row(1, 'present'), row(2, 'excused'), row(3, 'absent')]);
  assert.deepEqual(Object.keys(r).sort(), ['campus', 'closed_at', 'counts', 'is_open', 'opened_at', 'section', 'session_id', 'students']);
  assert.deepEqual(r.section, { id: 3, course_code: 'CSS326', course_name: 'Database Programming Laboratory', term: '2026-1', section_no: 1 });
  assert.deepEqual(r.campus, { id: 1, name: 'Rangsit' });
  assert.equal(r.is_open, true);
  assert.equal(r.closed_at, null);
  assert.equal(buildRoster({ ...header, closed_at: '2026-11-02T10:30:00Z' }, []).is_open, false);
  assert.deepEqual(Object.keys(r.students[0]).sort(), ['full_name', 'method', 'recorded_at', 'status', 'student_id', 'student_no']);
});

test('counts add up to total, and an absent student has no method or time', () => {
  const r = buildRoster(header, [row(1, 'present'), row(2, 'present'), row(3, 'excused'), row(4, 'absent'), row(5, 'absent'), row(6, 'absent')]);
  assert.deepEqual(r.counts, { present: 2, excused: 1, absent: 3, total: 6 });
  assert.equal(r.counts.present + r.counts.excused + r.counts.absent, r.counts.total);
  const absent = r.students.find((s) => s.status === 'absent');
  assert.deepEqual([absent.method, absent.recorded_at], [null, null]);
});

test('an empty class gives zero counts, never a negative number', () => {
  assert.deepEqual(buildRoster(header, []).counts, { present: 0, excused: 0, absent: 0, total: 0 });
});

test('a missing method or time becomes null', () => {
  const r = buildRoster(header, [{ student_id: 1, full_name: 'A', student_no: null, status: 'absent' }]);
  assert.deepEqual([r.students[0].student_no, r.students[0].method, r.students[0].recorded_at], [null, null, null]);
});
