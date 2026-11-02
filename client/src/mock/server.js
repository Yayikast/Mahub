// A fake Express server that lives in the browser. It answers the same URLs as docs/API.md,
// with the same JSON shapes, status codes and error bodies. api.js calls mockFetch instead of
// fetch when VITE_MOCK is set; no React in here, so `node --test` can exercise it directly.

import { db, save, resetDb, nextId } from './db.js'

export { resetDb }

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fail = (status, error, reason) => json(status, reason ? { error, reason } : { error })
const OK = () => json(200, { ok: true })
const redirect = (to) => new Response(null, { status: 302, headers: { Location: to } })

const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const QR_SECONDS = 10
const SCAN_VALID_SECONDS = 120 // shortcut: real lifetime of the scan cookie is Yayika's call (#20)

// ---------- views: turn stored rows into the exact shapes in API.md ----------

const user = (id) => db.users.find((u) => u.id === id)
const course = (id) => db.courses.find((c) => c.id === id)
const section = (id) => db.sections.find((s) => s.id === id)
const session = (id) => db.sessions.find((s) => s.id === id)
const campus = (id) => db.campuses.find((c) => c.id === id)

// created_by / created_at (docs/API.md): null on seeded rows; enrollments send them to the admin only.
const userView = (u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, student_no: u.student_no,
  created_by: u.created_by ?? null, created_at: u.created_at ?? null })
const meView = (u) => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role })
const sectionView = (s) => {
  const c = course(s.course_id)
  return { id: s.id, course_id: s.course_id, course_code: c.code, course_name: c.name,
    instructor_id: s.instructor_id, instructor_name: user(s.instructor_id).full_name, term: s.term, section_no: s.section_no }
}
const enrolledStudents = (sectionId) =>
  db.enrollments.filter((e) => e.section_id === sectionId).map((e) => user(e.student_id))
const studentView = (u) => ({ student_id: u.id, full_name: u.full_name, email: u.email, student_no: u.student_no })
const enrollmentView = (e, admin) => ({ ...studentView(user(e.student_id)),
  ...(admin && { created_by: e.created_by ?? null, created_at: e.created_at ?? null }) })
const markOf = (sessionId, studentId) =>
  db.attendance.find((a) => a.session_id === sessionId && a.student_id === studentId)

function rosterView(s) {
  const students = enrolledStudents(s.section_id)
    .sort((a, b) => a.student_no.localeCompare(b.student_no))
    .map((u) => {
      const m = markOf(s.id, u.id)
      return { student_id: u.id, full_name: u.full_name, student_no: u.student_no,
        status: m?.status ?? 'absent', method: m?.method ?? null, recorded_at: m?.recorded_at ?? null }
    })
  const present = students.filter((x) => x.status === 'present').length
  const excused = students.filter((x) => x.status === 'excused').length
  const c = campus(s.campus_id)
  const { id, course_code, course_name, term, section_no } = sectionView(section(s.section_id))
  return { session_id: s.id, is_open: !s.closed_at, opened_at: s.opened_at, closed_at: s.closed_at ?? null, section: { id, course_code, course_name, term, section_no }, campus: { id: c.id, name: c.name },
    counts: { present, excused, absent: students.length - present - excused, total: students.length }, students }
}

// ---------- audit / attendance writes ----------

function writeMark(sessionId, studentId, status, method, actorId) {
  const old = markOf(sessionId, studentId)
  const at = now()
  db.audit.push({ id: nextId('audit'), type: 'attendance', action: old ? 'UPDATE' : 'INSERT', session_id: sessionId, student_id: studentId,
    old_status: old?.status ?? null, new_status: status, changed_by: actorId, changed_at: at })
  if (old) Object.assign(old, { status, method, recorded_at: at })
  else db.attendance.push({ session_id: sessionId, student_id: studentId, status, method, recorded_at: at })
}

function clearMark(sessionId, studentId, actorId) {
  const i = db.attendance.findIndex((a) => a.session_id === sessionId && a.student_id === studentId)
  if (i < 0) return false
  db.audit.push({ id: nextId('audit'), type: 'attendance', action: 'DELETE', session_id: sessionId, student_id: studentId,
    old_status: db.attendance[i].status, new_status: null, changed_by: actorId, changed_at: now() })
  db.attendance.splice(i, 1)
  return true
}

function logAttempt(sessionId, userId, outcome, distance_m = null, accuracy_m = null) {
  db.attempts.push({ id: nextId('attempt'), session_id: sessionId, user_id: userId, outcome,
    distance_m, accuracy_m, created_at: now() })
}

// ---------- guards ----------

// Returns the section row, or an error Response (404 unknown, 403 someone else's).
function ownSection(me, id) {
  const s = section(Number(id))
  if (!s) return fail(404, 'Section not found')
  if (s.instructor_id !== me.id) return fail(403, 'Not allowed')
  return s
}
function ownSession(me, id) {
  const s = session(Number(id))
  if (!s) return fail(404, 'Session not found')
  if (section(s.section_id).instructor_id !== me.id) return fail(403, 'Not allowed')
  return s
}
const isResponse = (x) => x instanceof Response

const str = (v) => typeof v === 'string' && v.trim() !== ''
const ROLES = ['admin', 'instructor', 'student']
// Students sign in with their SIIT Google account (docs/API.md). Admins and instructors can use any email.
const siit = (email) => email.trim().toLowerCase().endsWith('@g.siit.tu.ac.th')
const NOT_SIIT = 'Student emails must end in @g.siit.tu.ac.th'

// ---------- routes ----------
// [method, path pattern, who may call ('any' = signed in, null = anyone), handler(ctx)]

const routes = []
const route = (method, path, who, handler) => {
  const re = new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$')
  const names = [...path.matchAll(/:(\w+)/g)].map((m) => m[1])
  routes.push({ method, re, names, who, handler })
}

// --- sign-in
route('POST', '/auth/logout', 'any', () => { db.me = null; return OK() })
route('GET', '/api/me', 'any', ({ me }) => json(200, meView(me)))
route('GET', '/auth/dev-users', null, () => json(200, db.users.map(meView)))
route('POST', '/auth/dev-login', null, ({ body }) => {
  if (body.user_id == null) return fail(400, 'user_id is required')
  const u = user(Number(body.user_id))
  if (!u) return fail(400, 'Unknown user')
  db.me = u.id
  return json(200, meView(u))
})

// --- admin: users
route('GET', '/api/users', ['admin'], () => json(200, db.users.map(userView)))
route('POST', '/api/users', ['admin'], ({ me, body }) => {
  const { email, full_name, role } = body
  if (!str(email) || !email.includes('@')) return fail(400, 'A valid email is required')
  if (!str(full_name)) return fail(400, 'Name is required')
  if (!ROLES.includes(role)) return fail(400, 'Role must be admin, instructor or student')
  if (role === 'student' && !siit(email)) return fail(400, NOT_SIIT)
  if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) return fail(409, 'Email already exists')
  const u = { id: nextId('user'), email: email.trim(), full_name: full_name.trim(), role,
    student_no: role === 'student' && str(body.student_no) ? body.student_no.trim() : null, created_by: me.id, created_at: now() }
  db.users.push(u)
  return json(201, userView(u))
})
route('PUT', '/api/users/:id', ['admin'], ({ params, body }) => {
  const u = user(Number(params.id))
  if (!u) return fail(404, 'User not found')
  if ('email' in body && (!str(body.email) || !body.email.includes('@'))) return fail(400, 'A valid email is required')
  if ('full_name' in body && !str(body.full_name)) return fail(400, 'Name is required')
  if ('role' in body && !ROLES.includes(body.role)) return fail(400, 'Role must be admin, instructor or student')
  if ((body.role ?? u.role) === 'student' && !siit(body.email ?? u.email)) return fail(400, NOT_SIIT) // checked on the user after the edit
  if (body.email && db.users.some((x) => x.id !== u.id && x.email.toLowerCase() === body.email.trim().toLowerCase()))
    return fail(409, 'Email already exists')
  for (const k of ['email', 'full_name', 'role', 'student_no']) if (k in body) u[k] = typeof body[k] === 'string' ? body[k].trim() || null : body[k]
  if (u.role !== 'student') u.student_no = null
  return json(200, userView(u))
})
route('DELETE', '/api/users/:id', ['admin'], ({ params }) => {
  const id = Number(params.id)
  const u = user(id)
  if (!u) return fail(404, 'User not found')
  if (db.sections.some((s) => s.instructor_id === id) || db.attendance.some((a) => a.student_id === id))
    return fail(409, 'This user is still used by a section or attendance record')
  // assumption: enrollments are removed with the student (ON DELETE CASCADE); API.md doesn't say
  db.enrollments = db.enrollments.filter((e) => e.student_id !== id)
  db.users = db.users.filter((x) => x.id !== id)
  return OK()
})

// --- admin: courses
route('GET', '/api/courses', ['admin'], () => json(200, db.courses))
route('POST', '/api/courses', ['admin'], ({ body }) => {
  if (!str(body.code) || !str(body.name)) return fail(400, 'Code and name are required')
  const code = body.code.trim().toUpperCase() // the server stores codes in capitals
  if (code.length > 20) return fail(400, 'Course code is too long')
  if (db.courses.some((c) => c.code === code)) return fail(409, 'That course code already exists')
  const c = { id: nextId('course'), code, name: body.name.trim() }
  db.courses.push(c)
  return json(201, c)
})
route('PUT', '/api/courses/:id', ['admin'], ({ params, body }) => {
  const c = course(Number(params.id))
  if (!c) return fail(404, 'Course not found')
  if (('code' in body && !str(body.code)) || ('name' in body && !str(body.name))) return fail(400, 'Code and name cannot be empty')
  const code = body.code?.trim().toUpperCase()
  if (code && code.length > 20) return fail(400, 'Course code is too long')
  if (code && db.courses.some((x) => x.id !== c.id && x.code === code)) return fail(409, 'That course code already exists')
  if ('code' in body) c.code = code
  if ('name' in body) c.name = body.name.trim()
  return json(200, c)
})
route('DELETE', '/api/courses/:id', ['admin'], ({ params }) => {
  const id = Number(params.id)
  if (!course(id)) return fail(404, 'Course not found')
  if (db.sections.some((s) => s.course_id === id)) return fail(409, 'This course still has sections')
  db.courses = db.courses.filter((c) => c.id !== id)
  return OK()
})

// --- admin: sections
const sectionProblem = (b) => {
  if (b.course_id !== undefined && !course(Number(b.course_id))) return fail(400, 'Choose a course')
  if (b.instructor_id !== undefined && user(Number(b.instructor_id))?.role !== 'instructor') return fail(400, 'Choose an instructor')
  if (b.term !== undefined && !str(b.term)) return fail(400, 'Term is required')
  if (b.section_no !== undefined && !(Number.isInteger(Number(b.section_no)) && Number(b.section_no) > 0)) return fail(400, 'Section number must be a positive whole number')
  return null
}
const sectionDup = (s, selfId) =>
  db.sections.some((x) => x.id !== selfId && x.course_id === s.course_id && x.term === s.term && x.section_no === s.section_no)

route('GET', '/api/sections', ['admin'], () => json(200, db.sections.map(sectionView)))
route('POST', '/api/sections', ['admin'], ({ body }) => {
  for (const k of ['course_id', 'instructor_id', 'term', 'section_no']) if (body[k] === undefined || body[k] === '') return fail(400, `${k} is required`)
  const bad = sectionProblem(body)
  if (bad) return bad
  const s = { id: nextId('section'), course_id: Number(body.course_id), instructor_id: Number(body.instructor_id),
    term: body.term.trim(), section_no: Number(body.section_no) }
  if (sectionDup(s)) return fail(409, 'That course, term and section number already exist')
  db.sections.push(s)
  return json(201, sectionView(s))
})
route('PUT', '/api/sections/:id', ['admin'], ({ params, body }) => {
  const s = section(Number(params.id))
  if (!s) return fail(404, 'Section not found')
  const bad = sectionProblem(body)
  if (bad) return bad
  const next = { ...s }
  for (const k of ['course_id', 'instructor_id', 'section_no']) if (k in body) next[k] = Number(body[k])
  if ('term' in body) next.term = body.term.trim()
  if (sectionDup(next, s.id)) return fail(409, 'That course, term and section number already exist')
  Object.assign(s, next)
  return json(200, sectionView(s))
})
route('DELETE', '/api/sections/:id', ['admin'], ({ params }) => {
  const id = Number(params.id)
  if (!section(id)) return fail(404, 'Section not found')
  if (db.sessions.some((s) => s.section_id === id)) return fail(409, 'This section still has sessions')
  db.enrollments = db.enrollments.filter((e) => e.section_id !== id)
  db.sections = db.sections.filter((s) => s.id !== id)
  return OK()
})

// --- admin: enrollments
// Admin: any section. Instructor: only their own.
const audit = (row, me) => db.audit.push({ id: nextId('audit'), ...row, changed_by: me.id, changed_at: now() })
const sectionFor = (me, id) => me.role === 'admin' ? section(Number(id)) ?? fail(404, 'Section not found') : ownSection(me, id)

route('GET', '/api/sections/:id/enrollments', ['admin', 'instructor'], ({ me, params }) => {
  const s = sectionFor(me, params.id)
  if (isResponse(s)) return s
  return json(200, db.enrollments.filter((e) => e.section_id === s.id).map((e) => enrollmentView(e, me.role === 'admin')))
})
route('POST', '/api/sections/:id/enrollments', ['admin'], ({ me, params, body }) => {
  const sid = Number(params.id)
  if (!section(sid)) return fail(404, 'Section not found')
  const u = user(Number(body.student_id))
  if (!u || u.role !== 'student') return fail(400, 'Choose a student')
  if (db.enrollments.some((e) => e.section_id === sid && e.student_id === u.id)) return fail(409, 'Already enrolled')
  db.enrollments.push({ section_id: sid, student_id: u.id, created_by: me.id, created_at: now() })
  audit({ type: 'enrollment', action: 'INSERT', section_id: sid, student_id: u.id }, me)
  return json(201, studentView(u))
})
route('DELETE', '/api/sections/:id/enrollments/:studentId', ['admin'], ({ me, params }) => {
  const [sid, uid] = [Number(params.id), Number(params.studentId)]
  const before = db.enrollments.length
  db.enrollments = db.enrollments.filter((e) => !(e.section_id === sid && e.student_id === uid))
  if (db.enrollments.length === before) return fail(404, 'Enrollment not found')
  audit({ type: 'enrollment', action: 'DELETE', section_id: sid, student_id: uid }, me)
  return OK()
})

// --- CSV imports (docs/API.md). The client sends parsed rows as JSON.
// dry_run: true only reports; false re-checks every row and is all or nothing: any problem row -> 400, nothing saved.
const IMPORT_MAX = 500
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function importBody(body) {
  if (typeof body.dry_run !== 'boolean') return fail(400, 'dry_run must be true or false')
  if (!Array.isArray(body.rows) || body.rows.length === 0) return fail(400, 'No rows to import')
  if (body.rows.length > IMPORT_MAX) return fail(400, `Import at most ${IMPORT_MAX} rows at a time`)
  return null
}
const clean = (r) => ({ email: String(r?.email ?? '').trim().toLowerCase(), full_name: String(r?.full_name ?? '').trim(),
  student_no: String(r?.student_no ?? '').trim(), role: String(r?.role ?? '').trim().toLowerCase() })
const tally = (results, keys) => Object.fromEntries(keys.map((k) => [k, results.filter((r) => r.result === k).length]))

// Shared row checks, in order. `seen` catches the same email or student number twice in one file.
// A student_no owned by a different user than the row's email is always a problem.
function rowProblem(r, seen) {
  if (!EMAIL.test(r.email)) return 'invalid_email'
  if (seen.has(r.email) || (r.student_no && seen.has(`#${r.student_no}`))) return 'duplicate_row'
  seen.add(r.email)
  if (r.student_no) seen.add(`#${r.student_no}`)
  const u = db.users.find((x) => x.email.toLowerCase() === r.email)
  const owner = r.student_no && db.users.find((x) => x.student_no === r.student_no)
  if (owner && owner !== u) return 'student_no_mismatch'
  return null
}

function checkEnrollments(rows, sectionId, canCreate) {
  const seen = new Set()
  return rows.map(clean).map((r, i) => {
    const out = { row: i + 1, email: r.email }
    const problem = rowProblem(r, seen)
    if (problem) return { ...out, result: 'problem', reason: problem }
    const u = db.users.find((x) => x.email.toLowerCase() === r.email)
    if (u) {
      if (u.role !== 'student') return { ...out, result: 'problem', reason: 'not_a_student' }
      const inIt = db.enrollments.some((e) => e.section_id === sectionId && e.student_id === u.id)
      return { ...out, result: inIt ? 'already_enrolled' : 'enroll', student_id: u.id }
    }
    if (!canCreate) return { ...out, result: 'problem', reason: 'not_a_user' } // instructors never create users
    if (!siit(r.email)) return { ...out, result: 'problem', reason: 'not_siit_email' }
    if (!r.full_name) return { ...out, result: 'problem', reason: 'name_required' }
    if (r.student_no && !/^\d{10}$/.test(r.student_no)) return { ...out, result: 'problem', reason: 'invalid_student_no' }
    return { ...out, result: 'new_user', full_name: r.full_name, student_no: r.student_no || null }
  })
}

route('POST', '/api/sections/:id/enrollments/import', ['admin', 'instructor'], ({ me, params, body }) => {
  const s = sectionFor(me, params.id)
  if (isResponse(s)) return s
  const bad = importBody(body)
  if (bad) return bad
  const checked = checkEnrollments(body.rows, s.id, me.role === 'admin') // re-checked on the real run too
  const reply = importReply(body.dry_run, checked, ['enroll', 'new_user', 'already_enrolled', 'problem'])
  if (reply.stop) return reply.res
  const at = now()
  for (const r of checked) {
    if (r.result === 'new_user') {
      const u = { id: nextId('user'), email: r.email, full_name: r.full_name, role: 'student', student_no: r.student_no, created_by: me.id, created_at: at }
      db.users.push(u)
      r.student_id = u.id
    }
    if (r.result === 'new_user' || r.result === 'enroll') db.enrollments.push({ section_id: s.id, student_id: r.student_id, created_by: me.id, created_at: at })
  }
  const { enroll, new_user, already_enrolled } = reply.totals
  if (enroll + new_user) audit({ type: 'import', action: 'IMPORT', section_id: s.id, summary: { enroll, new_user, already_enrolled } }, me)
  return reply.res
})

// One reply shape for both imports. A real run with any problem row is refused whole (400, same results).
function importReply(dryRun, checked, keys) {
  const results = checked.map((r) => ({ row: r.row, email: r.email, result: r.result, ...(r.reason && { reason: r.reason }) }))
  const totals = tally(results, keys)
  const refused = !dryRun && totals.problem > 0
  const error = refused && `Nothing was saved: ${totals.problem} ${totals.problem === 1 ? 'row has a problem' : 'rows have problems'}`
  return { stop: dryRun || refused, totals, res: json(refused ? 400 : 200, { ...(error && { error }), dry_run: dryRun, results, totals }) }
}

route('POST', '/api/users/import', ['admin'], ({ me, body }) => {
  const bad = importBody(body)
  if (bad) return bad
  const seen = new Set()
  const results = body.rows.map(clean).map((r, i) => {
    const out = { row: i + 1, email: r.email }
    // Same order as the server (server/lib/userImportRules.js).
    const problem = rowProblem(r, seen)
    if (problem) return { ...out, result: 'problem', reason: problem }
    if (db.users.some((x) => x.email.toLowerCase() === r.email)) return { ...out, result: 'already_exists' } // never overwritten
    if (!ROLES.includes(r.role)) return { ...out, result: 'problem', reason: 'invalid_role' }
    if (r.student_no && r.role !== 'student') return { ...out, result: 'problem', reason: 'student_no_only_for_students' }
    if (!r.full_name) return { ...out, result: 'problem', reason: 'name_required' }
    if (r.role === 'student' && !siit(r.email)) return { ...out, result: 'problem', reason: 'not_siit_email' }
    if (r.student_no && !/^\d{10}$/.test(r.student_no)) return { ...out, result: 'problem', reason: 'invalid_student_no' }
    return { ...out, result: 'new_user', r }
  })
  const reply = importReply(body.dry_run, results, ['new_user', 'already_exists', 'problem'])
  if (reply.stop) return reply.res
  for (const x of results.filter((x) => x.result === 'new_user')) {
    db.users.push({ id: nextId('user'), email: x.r.email, full_name: x.r.full_name, role: x.r.role,
      student_no: x.r.role === 'student' ? x.r.student_no || null : null, created_by: me.id, created_at: now() })
  }
  const { new_user, already_exists } = reply.totals
  if (new_user) audit({ type: 'import', action: 'IMPORT', section_id: null, summary: { new_user, already_exists } }, me)
  return reply.res
})

// --- admin: campuses (read: admin + instructor)
const campusProblem = (b) => {
  if ('name' in b && !str(b.name)) return fail(400, 'Name is required')
  if ('lat' in b && !(typeof b.lat === 'number' && b.lat >= -90 && b.lat <= 90)) return fail(400, 'Latitude must be a number from -90 to 90')
  if ('lng' in b && !(typeof b.lng === 'number' && b.lng >= -180 && b.lng <= 180)) return fail(400, 'Longitude must be a number from -180 to 180')
  if ('radius_m' in b && !(Number.isInteger(b.radius_m) && b.radius_m >= 10 && b.radius_m <= 5000)) return fail(400, 'Radius must be between 10 and 5000 metres') // db CHECK
  return null
}
route('GET', '/api/campuses', ['admin', 'instructor'], () => json(200, db.campuses))
route('POST', '/api/campuses', ['admin'], ({ body }) => {
  for (const k of ['name', 'lat', 'lng', 'radius_m']) if (!(k in body)) return fail(400, `${k} is required`)
  const bad = campusProblem(body)
  if (bad) return bad
  if (db.campuses.some((c) => c.name.toLowerCase() === body.name.trim().toLowerCase())) return fail(409, 'Campus name already exists')
  const c = { id: nextId('campus'), name: body.name.trim(), lat: body.lat, lng: body.lng, radius_m: body.radius_m }
  db.campuses.push(c)
  return json(201, c)
})
route('PUT', '/api/campuses/:id', ['admin'], ({ params, body }) => {
  const c = campus(Number(params.id))
  if (!c) return fail(404, 'Campus not found')
  const bad = campusProblem(body)
  if (bad) return bad
  if (body.name && db.campuses.some((x) => x.id !== c.id && x.name.toLowerCase() === body.name.trim().toLowerCase()))
    return fail(409, 'Campus name already exists')
  for (const k of ['name', 'lat', 'lng', 'radius_m']) if (k in body) c[k] = k === 'name' ? body[k].trim() : body[k]
  return json(200, c)
})
route('DELETE', '/api/campuses/:id', ['admin'], ({ params }) => {
  const id = Number(params.id)
  if (!campus(id)) return fail(404, 'Campus not found')
  if (db.sessions.some((s) => s.campus_id === id)) return fail(409, 'A session uses this campus')
  db.campuses = db.campuses.filter((c) => c.id !== id)
  return OK()
})

// --- admin: audit
route('GET', '/api/audit', ['admin'], ({ query }) => {
  const limit = Number(query.get('limit')) > 0 ? Number(query.get('limit')) : 100
  const type = query.get('type')
  return json(200, db.audit.filter((a) => !type || (a.type ?? 'attendance') === type).sort((a, b) => b.changed_at.localeCompare(a.changed_at) || b.id - a.id).slice(0, limit)) // newest first, like docs/API.md
})

// --- instructor
route('GET', '/api/my/sections', ['instructor'], ({ me }) =>
  json(200, db.sections.filter((s) => s.instructor_id === me.id).map((s) => {
    const v = sectionView(s)
    return { id: v.id, course_code: v.course_code, course_name: v.course_name, term: v.term, section_no: v.section_no }
  })))

route('GET', '/api/sections/:id/sessions', ['instructor'], ({ me, params }) => {
  const s = ownSection(me, params.id)
  if (isResponse(s)) return s
  // Counted over students enrolled now, so a removed student never makes absent negative or the rate over 100%.
  // Their marks are kept: re-enrolling them brings their history back. A closed session's numbers can change.
  const ids = new Set(enrolledStudents(s.id).map((u) => u.id))
  const count = (x, status) => db.attendance.filter((a) => a.session_id === x.id && a.status === status && ids.has(a.student_id)).length
  return json(200, db.sessions.filter((x) => x.section_id === s.id).sort((a, b) => b.id - a.id).map((x) => ({
    id: x.id, opened_at: x.opened_at, closed_at: x.closed_at,
    present_count: count(x, 'present'), excused_count: count(x, 'excused'), enrolled_count: ids.size })))
})

route('POST', '/api/sections/:id/sessions', ['instructor'], ({ me, params, body }) => {
  const s = ownSection(me, params.id)
  if (isResponse(s)) return s
  if (!campus(Number(body.campus_id))) return fail(400, 'Choose a campus')
  if (db.sessions.some((x) => x.section_id === s.id && !x.closed_at)) return fail(409, 'A session is already open for this section')
  const x = { id: nextId('session'), section_id: s.id, campus_id: Number(body.campus_id), opened_at: now(),
    closed_at: null, code: null, code_expires_at: null }
  db.sessions.push(x)
  return json(201, { id: x.id, section_id: x.section_id, campus_id: x.campus_id, opened_at: x.opened_at })
})

route('POST', '/api/sessions/:id/close', ['instructor'], ({ me, params }) => {
  const s = ownSession(me, params.id)
  if (isResponse(s)) return s
  if (s.closed_at) return fail(409, 'Already closed')
  s.closed_at = now()
  s.code = null
  return json(200, { id: s.id, closed_at: s.closed_at })
})

route('GET', '/api/sessions/:id/qr', ['instructor'], ({ me, params }) => {
  const s = ownSession(me, params.id)
  if (isResponse(s)) return s
  if (s.closed_at) return fail(409, 'Session is closed')
  if (!s.code || Date.parse(s.code_expires_at) <= Date.now()) {
    s.code = Math.random().toString(16).slice(2, 8).padEnd(6, '0')
    s.code_expires_at = new Date(Date.now() + QR_SECONDS * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  }
  // In mock mode the QR opens the SPA's own /scan page (which calls the mock's GET /scan).
  const origin = globalThis.location?.origin ?? 'http://localhost:5173'
  return json(200, { scan_url: `${origin}/scan?s=${s.id}&c=${s.code}`, expires_at: s.code_expires_at })
})

route('GET', '/api/sessions/:id/roster', ['instructor'], ({ me, params }) => {
  const s = ownSession(me, params.id)
  return isResponse(s) ? s : json(200, rosterView(s))
})

route('PUT', '/api/sessions/:id/attendance/:studentId', ['instructor'], ({ me, params, body }) => {
  const s = ownSession(me, params.id)
  if (isResponse(s)) return s
  if (!['present', 'excused'].includes(body.status)) return fail(400, 'Status must be present or excused')
  const stu = Number(params.studentId)
  if (!enrolledStudents(s.section_id).some((u) => u.id === stu)) return fail(404, 'Student is not enrolled in this section')
  writeMark(s.id, stu, body.status, 'manual', me.id)
  return json(200, { student_id: stu, status: body.status, method: 'manual' })
})

route('DELETE', '/api/sessions/:id/attendance/:studentId', ['instructor'], ({ me, params }) => {
  const s = ownSession(me, params.id)
  if (isResponse(s)) return s
  return clearMark(s.id, Number(params.studentId), me.id) ? OK() : fail(404, 'There was no mark to clear')
})

route('GET', '/api/sessions/:id/attempts', ['instructor'], ({ me, params }) => {
  const s = ownSession(me, params.id)
  if (isResponse(s)) return s
  return json(200, db.attempts.filter((a) => a.session_id === s.id).sort((a, b) => b.id - a.id).map((a) => ({
    id: a.id, user_id: a.user_id, full_name: user(a.user_id)?.full_name ?? 'Unknown', outcome: a.outcome,
    distance_m: a.distance_m, accuracy_m: a.accuracy_m, created_at: a.created_at })))
})

// --- student
// GET /scan is not JSON: it answers with a redirect, like the real route.
route('GET', '/scan', null, ({ query }) => {
  const s = session(Number(query.get('s')))
  const valid = s && !s.closed_at && s.code && s.code === query.get('c') && Date.parse(s.code_expires_at) > Date.now()
  if (!valid) return redirect('/scan-failed?reason=expired')
  db.scan = { session_id: s.id, scanned_at: now() }
  return redirect(db.me ? '/checkin' : '/')
})

// Reasons from the table in API.md: [status, server message].
const CHECKIN_REFUSALS = {
  not_enrolled: [403, 'Not enrolled in this class'],
  already_checked_in: [409, 'Already checked in'],
  expired: [422, 'QR expired'],
  no_scan: [422, 'No scan found'],
  closed: [422, 'Check-in is closed'],
  too_far: [422, 'Off campus'],
  low_accuracy: [422, 'Location is not precise enough'],
}
const OUTCOME = { already_checked_in: 'duplicate' } // checkin_attempts uses "duplicate"

// The class and campus on the check-in 200 and the already_checked_in 409 (docs/API.md).
const checkinInfo = (sess) => {
  const s = section(sess.section_id)
  const c = course(s.course_id)
  const cp = campus(sess.campus_id)
  return { section_id: s.id, course_code: c.code, course_name: c.name, section_no: s.section_no, campus: { id: cp.id, name: cp.name } }
}

function refuse(reason, me, sessionId, distance, accuracy) {
  const [status, message] = CHECKIN_REFUSALS[reason]
  if (sessionId) logAttempt(sessionId, me.id, OUTCOME[reason] ?? reason, distance, accuracy)
  if (reason === 'already_checked_in' && sessionId) return json(status, { error: message, reason, ...checkinInfo(session(sessionId)) })
  return fail(status, message, reason)
}

function haversineM(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)))
}

route('POST', '/api/checkin', ['student'], ({ me, body }) => {
  const { lat, lng, accuracy } = body
  if (![lat, lng, accuracy].every((n) => typeof n === 'number' && Number.isFinite(n)) || accuracy < 0)
    return fail(400, 'Invalid location')

  const sc = db.scan
  const sess = sc && session(sc.session_id)

  if (db.dev.forceCheckin) {
    const reason = db.dev.forceCheckin
    db.dev.forceCheckin = null
    return refuse(reason, me, sess?.id, null, Math.round(accuracy))
  }

  // Already marked (in the scanned session, or any open one) wins over no_scan and expired: the scan is used up after a check-in.
  const marked = [sess, ...db.sessions.filter((x) => !x.closed_at)].find((x) => x && markOf(x.id, me.id))
  if (marked) return refuse('already_checked_in', me, marked.id, null, Math.round(accuracy))

  if (!sc || !sess) return refuse('no_scan', me)
  if (sess.closed_at) return refuse('closed', me, sess.id, null, Math.round(accuracy))
  if (Date.now() - Date.parse(sc.scanned_at) > SCAN_VALID_SECONDS * 1000) return refuse('expired', me, sess.id, null, Math.round(accuracy))
  if (!enrolledStudents(sess.section_id).some((u) => u.id === me.id)) return refuse('not_enrolled', me, sess.id, null, Math.round(accuracy))

  // docs/API.md: accuracy over 200 m is low_accuracy; otherwise accepted within radius + accuracy, else too_far.
  const c = campus(sess.campus_id)
  const distance = haversineM(lat, lng, c.lat, c.lng)
  const acc = Math.round(accuracy)
  if (accuracy > 200) return refuse('low_accuracy', me, sess.id, distance, acc)
  if (distance > c.radius_m + accuracy) return refuse('too_far', me, sess.id, distance, acc)

  writeMark(sess.id, me.id, 'present', 'qr', me.id)
  logAttempt(sess.id, me.id, 'ok', distance, acc)
  db.scan = null
  return json(200, { status: 'checked_in', session_id: sess.id, ...checkinInfo(sess) })
})

route('GET', '/api/my/attendance', ['student'], ({ me }) =>
  json(200, db.enrollments.filter((e) => e.student_id === me.id).map((e) => {
    const v = sectionView(section(e.section_id))
    const closed = db.sessions.filter((s) => s.section_id === e.section_id && s.closed_at)
    const attended = closed.filter((s) => markOf(s.id, me.id)).length // present and excused both count
    return { section_id: v.id, course_code: v.course_code, course_name: v.course_name, section_no: v.section_no,
      attended, total_sessions: closed.length, rate: closed.length ? Math.round((attended / closed.length) * 100) : 0 }
  })))

route('GET', '/api/my/classes/:id', ['student'], ({ me, params }) => {
  const s = section(Number(params.id))
  if (!s) return fail(404, 'Class not found')
  if (!db.enrollments.some((e) => e.section_id === s.id && e.student_id === me.id)) return fail(403, 'Not allowed')
  const v = sectionView(s)
  return json(200, {
    section: { id: v.id, course_code: v.course_code, course_name: v.course_name, section_no: v.section_no },
    sessions: db.sessions.filter((x) => x.section_id === s.id).sort((a, b) => b.id - a.id)
      // `closed_at` is in docs/API.md (GET /api/my/classes/:id): null while the check-in is open.
      .map((x) => ({ session_id: x.id, opened_at: x.opened_at, closed_at: x.closed_at, status: markOf(x.id, me.id)?.status ?? 'absent' })),
  })
})

// ---------- the fetch stand-in ----------

export async function mockFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, 'http://mock.local')
  const method = (init.method ?? 'GET').toUpperCase()
  if (db.dev.delayMs) await sleep(db.dev.delayMs)

  if (db.dev.failNext) {
    db.dev.failNext = false
    save()
    return fail(500, 'Something went wrong')
  }

  try {
    const hit = routes.find((r) => r.method === method && r.re.test(url.pathname))
    if (!hit) return fail(404, 'Not found')

    const me = db.me != null ? user(db.me) : null
    if (hit.who && !me) return fail(401, 'Please sign in')
    if (Array.isArray(hit.who) && !hit.who.includes(me.role)) return fail(403, 'Not allowed')

    let body = {}
    if (init.body) {
      try { body = JSON.parse(init.body) } catch { return fail(400, 'Bad request') }
    }
    const values = url.pathname.match(hit.re).slice(1)
    const params = Object.fromEntries(hit.names.map((n, i) => [n, decodeURIComponent(values[i])]))
    return hit.handler({ me, params, query: url.searchParams, body })
  } catch {
    return fail(500, 'Something went wrong') // never leak internals, same as the real server
  } finally {
    save()
  }
}

// ---------- helpers for the dev panel (not part of API.md) ----------

export function configure(patch) { Object.assign(db.dev, patch); save() }
export const hasPendingScan = () => db.scan != null

// Check in up to n random absent students, as if their phones had scanned.
export function simulateCheckins(sessionId, n = 1) {
  const s = session(sessionId)
  if (!s || s.closed_at) return 0
  const pool = enrolledStudents(s.section_id).filter((u) => !markOf(s.id, u.id))
  let added = 0
  while (added < n && pool.length) {
    const [u] = pool.splice(Math.floor(Math.random() * pool.length), 1)
    // Some students fail first (off campus or a rough location), so the failed-attempts list has something in it.
    if (Math.random() < 0.3) logAttempt(s.id, u.id, Math.random() < 0.5 ? 'too_far' : 'low_accuracy', 600 + Math.floor(Math.random() * 400), 20 + Math.floor(Math.random() * 120))
    writeMark(s.id, u.id, 'present', 'qr', u.id)
    logAttempt(s.id, u.id, 'ok', Math.floor(Math.random() * 300), 10 + Math.floor(Math.random() * 40))
    added++
  }
  save()
  return added
}
