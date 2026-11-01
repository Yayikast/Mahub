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
  const dup = await call('POST', '/api/users', { email: 'NOK@example.com', full_name: 'X', role: 'student' })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error, 'Email already exists')
  assert.equal((await call('POST', '/api/users', { email: 'n@x.com', full_name: 'N', role: 'boss' })).status, 400)
  const ok = await call('POST', '/api/users', { email: 'n@x.com', full_name: 'N', role: 'student', student_no: '1' })
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
  assert.deepEqual(ok.body, { status: 'checked_in', session_id: id })
  // scan cookie is used up
  assert.equal((await call('POST', '/api/checkin', here)).body.reason, 'no_scan')

  await login(NOK)
  const roster = (await call('GET', `/api/sessions/${id}/roster`)).body
  assert.equal(roster.counts.present, 1)
  assert.equal(roster.campus.name, 'Rangsit')
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
  const stranger = (await call('POST', '/api/users', { email: 's@x.com', full_name: 'S', role: 'student', student_no: '9' })).body
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
  await call('POST', '/api/users', { email: 'z@x.com', full_name: 'Z', role: 'student', student_no: '5' })
  const z = (await call('GET', '/api/users')).body.find((u) => u.email === 'z@x.com')
  await login(z.id)
  assert.equal((await call('GET', '/api/my/classes/1')).status, 403)
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
