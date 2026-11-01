import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mockFetch, resetDb, configure } from './server.js'

// Tiny client: returns { status, body } and follows nothing.
async function call(method, url, body) {
  const res = await mockFetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, location: res.headers.get('Location') }
}
const login = (id) => call('POST', '/auth/dev-login', { user_id: id })
const ADMIN = 1, NOK = 2, PREECHA = 3, STUDENT = 4 // student 4 is enrolled in sections 1, 2, 3

beforeEach(() => {
  resetDb()
  configure({ delayMs: 0 })
})

test('401 when signed out, 403 for the wrong role', async () => {
  assert.equal((await call('GET', '/api/me')).status, 401)
  await login(STUDENT)
  assert.equal((await call('GET', '/api/users')).status, 403)
  assert.equal((await call('GET', '/api/my/sections')).status, 403)
})

test('dev login, /api/me and logout', async () => {
  assert.equal((await login(NOK)).body.role, 'instructor')
  assert.equal((await call('GET', '/api/me')).body.full_name, 'Dr. Nok')
  await call('POST', '/auth/logout')
  assert.equal((await call('GET', '/api/me')).status, 401)
  assert.equal((await call('POST', '/auth/dev-login', {})).status, 400)
})

test('admin: duplicate email is 409, bad role is 400, delete of a used course is 409', async () => {
  await login(ADMIN)
  const dup = await call('POST', '/api/users', { email: 'NOK@example.com', full_name: 'X', role: 'instructor' })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error, 'Email already exists')
  assert.equal((await call('POST', '/api/users', { email: 'n@x.com', full_name: 'N', role: 'boss' })).status, 400)
  const ok = await call('POST', '/api/users', { email: 'n@g.siit.tu.ac.th', full_name: 'N', role: 'student', student_no: '1' })
  assert.equal(ok.status, 201)
  assert.equal((await call('DELETE', `/api/users/${ok.body.id}`)).status, 200)
  assert.equal((await call('DELETE', '/api/courses/1')).status, 409)
  assert.equal((await call('DELETE', '/api/users/999')).status, 404)
})

test('admin: section needs a real instructor; duplicate section is 409', async () => {
  await login(ADMIN)
  const bad = await call('POST', '/api/sections', { course_id: 1, instructor_id: STUDENT, term: '2026-1', section_no: 9 })
  assert.equal(bad.status, 400)
  const dup = await call('POST', '/api/sections', { course_id: 1, instructor_id: NOK, term: '2026-1', section_no: 1 })
  assert.equal(dup.status, 409)
})

test('instructor sees only their own sections; someone else\'s section is 403', async () => {
  await login(PREECHA)
  const mine = await call('GET', '/api/my/sections')
  assert.deepEqual(mine.body.map((s) => s.id), [2])
  assert.equal((await call('GET', '/api/sections/1/sessions')).status, 403)
  assert.equal((await call('GET', '/api/sections/999/sessions')).status, 404)
})

async function openSession(campusId = 1) {
  await login(NOK)
  const s = await call('POST', '/api/sections/1/sessions', { campus_id: campusId })
  assert.equal(s.status, 201)
  return s.body.id
}
async function scanAndSignInAsStudent(sessionId, studentId = STUDENT) {
  const qr = (await call('GET', `/api/sessions/${sessionId}/qr`)).body
  const url = new URL(qr.scan_url)
  await call('POST', '/auth/logout') // a student scans before signing in
  const scan = await call('GET', `/scan${url.search}`)
  await login(studentId)
  return scan
}

test('session: campus required, second open is 409, close twice is 409', async () => {
  await login(NOK)
  assert.equal((await call('POST', '/api/sections/1/sessions', {})).status, 400)
  const id = await openSession()
  assert.equal((await call('POST', '/api/sections/1/sessions', { campus_id: 1 })).status, 409)
  await login(NOK)
  assert.equal((await call('POST', `/api/sessions/${id}/close`)).status, 200)
  assert.equal((await call('POST', `/api/sessions/${id}/close`)).status, 409)
  assert.equal((await call('GET', `/api/sessions/${id}/qr`)).status, 409)
})

test('QR code stays the same until it expires, then /scan rejects the old one', async () => {
  const id = await openSession()
  const a = (await call('GET', `/api/sessions/${id}/qr`)).body
  const b = (await call('GET', `/api/sessions/${id}/qr`)).body
  assert.equal(a.scan_url, b.scan_url)
  const old = new URL(a.scan_url).search
  // force expiry by rewinding the stored deadline, then ask for a fresh code
  const { db } = await import('./db.js')
  db.sessions.find((s) => s.id === id).code_expires_at = '2000-01-01T00:00:00Z'
  const c = (await call('GET', `/api/sessions/${id}/qr`)).body
  assert.notEqual(c.scan_url, a.scan_url)
  const res = await call('GET', `/scan${old}`)
  assert.equal(res.status, 302)
  assert.equal(res.location, '/scan-failed?reason=expired')
})

test('check-in: success shows in roster and audit, scan is used up', async () => {
  const id = await openSession()
  const scan = await scanAndSignInAsStudent(id)
  assert.equal(scan.location, '/' ) // signed out when scanning -> sign in first
  await login(STUDENT)
  const here = { lat: 14.0693, lng: 100.60778, accuracy: 15 }
  const ok = await call('POST', '/api/checkin', here)
  assert.deepEqual(ok.body, { status: 'checked_in', session_id: id, section_id: 1, course_code: 'CSS326', course_name: 'Database Programming Laboratory', section_no: 1, campus: { id: 1, name: 'Rangsit' } }) // class + campus are proposed, not in API.md yet
  // scan cookie is used up
  assert.equal((await call('POST', '/api/checkin', here)).body.reason, 'no_scan')

  await login(NOK)
  const roster = (await call('GET', `/api/sessions/${id}/roster`)).body
  assert.equal(roster.counts.present, 1)
  assert.equal(roster.campus.name, 'Rangsit')
  assert.deepEqual(roster.section, { id: 1, course_code: 'CSS326', course_name: 'Database Programming Laboratory', term: '2026-1', section_no: 1 })
  assert.equal(roster.students.find((s) => s.student_id === STUDENT).method, 'qr')
  await login(ADMIN)
  const audit = (await call('GET', '/api/audit?limit=1')).body
  assert.equal(audit[0].action, 'INSERT')
  assert.equal(audit[0].new_status, 'present')
})

test('check-in refusals: too_far, low_accuracy, not_enrolled, closed, bad input', async () => {
  const id = await openSession()
  await scanAndSignInAsStudent(id)
  const far = await call('POST', '/api/checkin', { lat: 13.75, lng: 100.5, accuracy: 20 })
  assert.deepEqual([far.status, far.body.reason], [422, 'too_far'])
  // just outside the radius with a poor fix: can't tell, so ask for precise location
  const rough = await call('POST', '/api/checkin', { lat: 14.0693 + 0.0065, lng: 100.60778, accuracy: 500 })
  assert.equal(rough.body.reason, 'low_accuracy')
  assert.equal((await call('POST', '/api/checkin', { lat: 'x' })).status, 400)

  // student 4..33 are all enrolled in section 1; make a stranger via the admin
  await login(ADMIN)
  const stranger = (await call('POST', '/api/users', { email: 's@g.siit.tu.ac.th', full_name: 'S', role: 'student', student_no: '9' })).body
  await login(stranger.id)
  const no = await call('POST', '/api/checkin', { lat: 14.0693, lng: 100.60778, accuracy: 10 })
  assert.deepEqual([no.status, no.body.reason], [403, 'not_enrolled'])

  await login(NOK)
  await call('POST', `/api/sessions/${id}/close`)
  await login(STUDENT)
  const closed = await call('POST', '/api/checkin', { lat: 14.0693, lng: 100.60778, accuracy: 10 })
  assert.equal(closed.body.reason, 'closed')

  await login(NOK)
  const attempts = (await call('GET', `/api/sessions/${id}/attempts`)).body
  assert.deepEqual(attempts.map((a) => a.outcome), ['closed', 'not_enrolled', 'low_accuracy', 'too_far'])
})

test('manual marks write the audit log; clearing a missing mark is 404', async () => {
  const id = await openSession()
  const mark = await call('PUT', `/api/sessions/${id}/attendance/${STUDENT}`, { status: 'excused' })
  assert.deepEqual(mark.body, { student_id: STUDENT, status: 'excused', method: 'manual' })
  assert.equal((await call('PUT', `/api/sessions/${id}/attendance/${STUDENT}`, { status: 'late' })).status, 400)
  assert.equal((await call('DELETE', `/api/sessions/${id}/attendance/${STUDENT}`)).status, 200)
  assert.equal((await call('DELETE', `/api/sessions/${id}/attendance/${STUDENT}`)).status, 404)
  await login(ADMIN)
  const actions = (await call('GET', '/api/audit?limit=2')).body.map((a) => a.action)
  assert.deepEqual(actions, ['DELETE', 'INSERT'])
})

test('student routes: rate counts present and excused; other class is 403', async () => {
  await login(STUDENT)
  const mine = (await call('GET', '/api/my/attendance')).body
  assert.equal(mine.length, 3)
  const css = mine.find((c) => c.section_id === 1)
  assert.equal(css.total_sessions, 3)
  assert.equal(css.rate, Math.round((css.attended / 3) * 100))
  const detail = await call('GET', '/api/my/classes/1')
  assert.equal(detail.body.sessions.length, 3)
  await login(ADMIN)
  await call('POST', '/api/users', { email: 'z@g.siit.tu.ac.th', full_name: 'Z', role: 'student', student_no: '5' })
  const z = (await call('GET', '/api/users')).body.find((u) => u.email === 'z@g.siit.tu.ac.th')
  await login(z.id)
  assert.equal((await call('GET', '/api/my/classes/1')).status, 403)
})

test('student class view: an open session has closed_at null and is left out of the rate', async () => {
  const id = await openSession()
  await login(STUDENT)
  const open = (await call('GET', '/api/my/classes/1')).body.sessions.find((x) => x.session_id === id)
  assert.equal(open.closed_at, null)
  assert.equal((await call('GET', '/api/my/attendance')).body.find((c) => c.section_id === 1).total_sessions, 3)
})

test('dev switches: forced check-in reason and a forced 500', async () => {
  const id = await openSession()
  await scanAndSignInAsStudent(id)
  configure({ forceCheckin: 'low_accuracy' })
  const r = await call('POST', '/api/checkin', { lat: 14.0693, lng: 100.60778, accuracy: 10 })
  assert.equal(r.body.reason, 'low_accuracy')
  configure({ failNext: true })
  const boom = await call('GET', '/api/me')
  assert.deepEqual([boom.status, boom.body], [500, { error: 'Something went wrong' }])
})

test('removing a student never makes absent negative or the rate over 100%; re-enrolling brings history back', async () => {
  await login(ADMIN)
  const newbie = (await call('POST', '/api/users', { email: 'x@g.siit.tu.ac.th', full_name: 'X', role: 'student', student_no: '6700000001' })).body.id
  await call('POST', '/api/sections/1/enrollments', { student_id: newbie })
  const id = await openSession()
  assert.equal((await call('PUT', `/api/sessions/${id}/attendance/${newbie}`, { status: 'present' })).status, 200)
  await login(ADMIN)
  await call('DELETE', `/api/sections/1/enrollments/${newbie}`)
  await login(NOK)
  for (const x of (await call('GET', '/api/sections/1/sessions')).body) {
    assert.ok(x.enrolled_count - x.present_count - x.excused_count >= 0, `session ${x.id}: absent < 0`)
    assert.ok(x.present_count + x.excused_count <= x.enrolled_count, `session ${x.id}: rate > 100%`)
  }
  const before = (await call('GET', '/api/sections/1/sessions')).body.find((x) => x.id === id).present_count
  assert.equal(before, 0) // the removed student's mark is kept but not counted
  await login(ADMIN)
  await call('POST', '/api/sections/1/enrollments', { student_id: newbie })
  await login(NOK)
  assert.equal((await call('GET', '/api/sections/1/sessions')).body.find((x) => x.id === id).present_count, before + 1)
})

test('enrollments: instructor reads own section only, without created_by; delete stays admin', async () => {
  await login(NOK)
  const list = await call('GET', '/api/sections/1/enrollments')
  assert.equal(list.status, 200)
  assert.ok(!('created_by' in list.body[0]))
  assert.equal((await call('GET', '/api/sections/2/enrollments')).status, 403)
  assert.equal((await call('DELETE', `/api/sections/1/enrollments/${STUDENT}`)).status, 403)
  await login(ADMIN)
  assert.ok('created_by' in (await call('GET', '/api/sections/1/enrollments')).body[0])
})

test('enrollment import: dry run saves nothing, problems are named, real run is all or nothing', async () => {
  const rows = [
    { email: 'somchai@g.siit.tu.ac.th' },                                   // already enrolled
    { email: 'new@g.siit.tu.ac.th', full_name: 'New P.', student_no: '6799999999' },
    { email: 'not-an-email' },
    { email: 'new@g.siit.tu.ac.th', full_name: 'Again' },                   // duplicate row
    { email: 'nok@example.com' },                                           // an instructor
    { email: 'other@g.siit.tu.ac.th', full_name: 'O', student_no: '6722771007' }, // Malee's number
    { email: 'noname@g.siit.tu.ac.th' },                                    // would be created, no name
  ]
  const imp = (dry_run, list) => call('POST', '/api/sections/1/enrollments/import', { dry_run, rows: list })
  await login(NOK)
  assert.equal((await imp(true, rows)).body.results[1].reason, 'not_a_user') // instructors never create users
  await login(ADMIN)
  const dry = await imp(true, rows)
  assert.deepEqual(dry.body.results.map((r) => r.reason ?? r.result),
    ['already_enrolled', 'new_user', 'invalid_email', 'duplicate_row', 'not_a_student', 'student_no_mismatch', 'name_required'])
  assert.deepEqual(dry.body.totals, { enroll: 0, new_user: 1, already_enrolled: 1, problem: 5 })
  const auditBefore = (await call('GET', '/api/audit?type=import')).body.length
  // any problem row refuses the whole real run
  const refused = await imp(false, rows)
  assert.equal(refused.status, 400)
  assert.equal(refused.body.totals.problem, 5)
  assert.ok(!(await call('GET', '/api/users')).body.some((u) => u.email === 'new@g.siit.tu.ac.th'))
  const real = await imp(false, rows.slice(0, 2))
  assert.equal(real.status, 200)
  const created = (await call('GET', '/api/users')).body.find((u) => u.email === 'new@g.siit.tu.ac.th')
  assert.deepEqual([created.role, created.created_by], ['student', ADMIN])
  const log = (await call('GET', '/api/audit?type=import')).body
  assert.equal(log.length, auditBefore + 1)
  assert.deepEqual([log[0].section_id, log[0].summary], [1, { enroll: 0, new_user: 1, already_enrolled: 1 }])
  // running the same file again changes nothing and writes no audit row
  assert.deepEqual((await imp(false, rows.slice(0, 2))).body.totals, { enroll: 0, new_user: 0, already_enrolled: 2, problem: 0 })
  assert.equal((await call('GET', '/api/audit?type=import')).body.length, auditBefore + 1)
  assert.equal((await call('POST', '/api/sections/1/enrollments/import', { rows })).status, 400) // dry_run required
  const big = Array.from({ length: 501 }, (_, i) => ({ email: `s${i}@g.siit.tu.ac.th` }))
  assert.equal((await imp(true, big)).status, 400)
})

test('users import: admin only, existing users are never overwritten, role must be valid', async () => {
  const rows = [
    { email: 'nok@example.com', full_name: 'Changed', role: 'student' },
    { email: 't@uni.example', full_name: 'Teacher T.', role: 'instructor' },
    { email: 'y@g.siit.tu.ac.th', full_name: 'Y', role: 'boss' },
    { email: 'z@uni.example', full_name: 'Z', role: 'admin', student_no: '6700000001' },
    { email: 'x@uni.example', full_name: 'X', role: 'student' },
    { email: 'Q@G.SIIT.TU.AC.TH', full_name: 'Q', role: 'student' },     // capitals don't matter
  ]
  await login(NOK)
  assert.equal((await call('POST', '/api/users/import', { dry_run: true, rows })).status, 403)
  await login(ADMIN)
  const dry = (await call('POST', '/api/users/import', { dry_run: true, rows })).body
  assert.deepEqual(dry.results.map((r) => r.reason ?? r.result), ['already_exists', 'new_user', 'invalid_role', 'student_no_only_for_students', 'not_siit_email', 'new_user'])
  assert.equal((await call('POST', '/api/users/import', { dry_run: false, rows: rows.slice(0, 2) })).status, 200)
  const users = (await call('GET', '/api/users')).body
  assert.equal(users.find((u) => u.email === 'nok@example.com').full_name, 'Dr. Nok')
  assert.equal(users.find((u) => u.email === 't@uni.example').role, 'instructor')
  assert.deepEqual((await call('GET', '/api/audit?limit=1')).body[0].summary, { new_user: 1, already_exists: 1 })
})

test('single enroll and remove write enrollment audit rows', async () => {
  await login(ADMIN)
  assert.equal((await call('DELETE', `/api/sections/1/enrollments/${STUDENT}`)).status, 200)
  assert.equal((await call('POST', '/api/sections/1/enrollments', { student_id: STUDENT })).status, 201)
  const log = (await call('GET', '/api/audit?type=enrollment&limit=2')).body
  assert.deepEqual(log.map((a) => [a.type, a.action, a.section_id, a.student_id, a.changed_by]),
    [['enrollment', 'INSERT', 1, STUDENT, ADMIN], ['enrollment', 'DELETE', 1, STUDENT, ADMIN]])
})

test('student emails must be SIIT, checked on the user after an edit', async () => {
  await login(ADMIN)
  const add = (b) => call('POST', '/api/users', { full_name: 'P', ...b })
  assert.equal((await add({ email: 'p@gmail.com', role: 'student' })).status, 400)
  assert.equal((await add({ email: 'p@gmail.com', role: 'instructor' })).status, 201)
  const teacher = (await call('GET', '/api/users')).body.find((u) => u.email === 'p@gmail.com')
  assert.equal((await call('PUT', `/api/users/${teacher.id}`, { role: 'student' })).body.error, 'Student emails must end in @g.siit.tu.ac.th')
  assert.equal((await call('PUT', `/api/users/${STUDENT}`, { email: 'somchai@gmail.com' })).status, 400)
  assert.equal((await call('PUT', `/api/users/${STUDENT}`, { full_name: 'Somchai Q.' })).status, 200)
  await login(ADMIN)
  const r = (await call('POST', '/api/sections/1/enrollments/import', { dry_run: true, rows: [{ email: 'new@gmail.com', full_name: 'N' }] })).body
  assert.equal(r.results[0].reason, 'not_siit_email')
})
