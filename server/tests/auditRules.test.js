const test = require('node:test');
const assert = require('node:assert');
const { parseAuditQuery, shapeAuditRow, DEFAULT_LIMIT, MAX_LIMIT } = require('../lib/auditRules');

test('no query means the default limit and every type', () => {
  assert.deepEqual(parseAuditQuery({}), { limit: DEFAULT_LIMIT, type: null });
  assert.deepEqual(parseAuditQuery(undefined), { limit: DEFAULT_LIMIT, type: null });
  assert.deepEqual(parseAuditQuery({ limit: '', type: '' }), { limit: DEFAULT_LIMIT, type: null });
});

test('limit and type are read from the query', () => {
  assert.deepEqual(parseAuditQuery({ limit: '50' }), { limit: 50, type: null });
  assert.deepEqual(parseAuditQuery({ limit: String(MAX_LIMIT), type: 'import' }), { limit: MAX_LIMIT, type: 'import' });
  for (const type of ['attendance', 'enrollment', 'import']) assert.equal(parseAuditQuery({ type }).type, type);
});

test('a bad limit or type is refused', () => {
  for (const limit of ['0', '-5', '1.5', 'abc', String(MAX_LIMIT + 1), ['1', '2'], '1; DROP TABLE audit_log']) {
    assert.match(parseAuditQuery({ limit }).error, /^limit must be/, String(limit));
  }
  for (const type of ['other', 'ATTENDANCE', ['import', 'attendance'], "import' OR '1'='1"]) {
    assert.equal(parseAuditQuery({ type }).error, 'type must be attendance, enrollment or import', String(type));
  }
});

const base = { id: 7, action: 'INSERT', changed_by: 1, changed_at: '2026-11-02T09:00:00Z' };
const every = { session_id: 12, section_id: 3, student_id: 7, old_status: null, new_status: 'present', summary: { a: 1 } };

test('an attendance row carries session and status columns only', () => {
  assert.deepEqual(shapeAuditRow({ ...base, type: 'attendance', ...every }), {
    ...base, type: 'attendance', session_id: 12, student_id: 7, old_status: null, new_status: 'present',
  });
});

test('an enrollment row carries section and student only', () => {
  assert.deepEqual(shapeAuditRow({ ...base, type: 'enrollment', action: 'DELETE', ...every }), {
    ...base, type: 'enrollment', action: 'DELETE', section_id: 3, student_id: 7,
  });
});

test('an import row carries section and summary only; section_id may be null', () => {
  assert.deepEqual(shapeAuditRow({ ...base, type: 'import', action: 'IMPORT', ...every, section_id: null }), {
    ...base, type: 'import', action: 'IMPORT', section_id: null, summary: { a: 1 },
  });
});

test('a row with no type is treated as attendance', () => {
  assert.equal(shapeAuditRow({ ...base, ...every }).type, 'attendance');
});
