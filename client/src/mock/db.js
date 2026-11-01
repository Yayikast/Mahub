// In-memory fake database for mock mode. Shapes follow docs/API.md.
// Saved to localStorage in the browser (so a refresh keeps your edits); plain memory under node --test.

const KEY = 'mahub-mock-v1'
const store = globalThis.localStorage ?? {
  _m: {},
  getItem(k) { return this._m[k] ?? null },
  setItem(k, v) { this._m[k] = v },
  removeItem(k) { delete this._m[k] },
}

const iso = (s) => new Date(s).toISOString().replace('.000Z', 'Z')

function seed() {
  const first = ['Somchai', 'Malee', 'Anan', 'Pimchanok', 'Kittipong', 'Suda', 'Wichai', 'Narin', 'Orn', 'Preecha',
    'Ratree', 'Thanakorn', 'Siriporn', 'Chai', 'Napat', 'Lalita', 'Piyawat', 'Jirapa', 'Sakda', 'Nicha',
    'Teerapat', 'Aree', 'Boonmee', 'Chanida', 'Dechawat', 'Ekkarat', 'Fah', 'Gamon', 'Hathai', 'Itsara']
  const users = [
    { id: 1, email: 'admin@example.com', full_name: 'Ada Admin', role: 'admin', student_no: null },
    { id: 2, email: 'nok@example.com', full_name: 'Dr. Nok', role: 'instructor', student_no: null },
    { id: 3, email: 'preecha@example.com', full_name: 'Dr. Preecha', role: 'instructor', student_no: null },
    ...first.map((n, i) => ({
      id: 4 + i,
      email: `${n.toLowerCase()}@g.siit.tu.ac.th`,
      full_name: `${n} ${String.fromCharCode(65 + (i % 26))}.`,
      role: 'student',
      student_no: String(6722771000 + i * 7),
    })),
  ]
  const students = users.filter((u) => u.role === 'student')
  const sections = [
    { id: 1, course_id: 1, instructor_id: 2, term: '2026-1', section_no: 1 },
    { id: 2, course_id: 1, instructor_id: 3, term: '2026-1', section_no: 2 },
    { id: 3, course_id: 2, instructor_id: 2, term: '2026-1', section_no: 1 },
  ]
  const enrollments = [
    ...students.map((s) => ({ section_id: 1, student_id: s.id })),
    ...students.slice(0, 15).map((s) => ({ section_id: 2, student_id: s.id })),
    ...students.slice(0, 20).map((s) => ({ section_id: 3, student_id: s.id })),
  ]

  // Three finished sessions per section 1 and 3, with a deterministic pattern of marks.
  const sessions = []
  const attendance = []
  const audit = []
  let sid = 1
  let aid = 1
  for (const [sectionId, campusId, days] of [[1, 1, ['2026-10-05', '2026-10-12', '2026-10-19']], [3, 2, ['2026-10-06', '2026-10-13']]]) {
    for (const day of days) {
      const opened = iso(`${day}T09:00:00Z`)
      sessions.push({ id: sid, section_id: sectionId, campus_id: campusId, opened_at: opened,
        closed_at: iso(`${day}T10:30:00Z`), code: null, code_expires_at: null })
      enrollments.filter((e) => e.section_id === sectionId).forEach((e, i) => {
        const n = (i * 5 + sid * 3) % 10 // 0..9
        if (n === 9) return // absent
        const status = n === 8 ? 'excused' : 'present'
        const method = status === 'excused' ? 'manual' : 'qr'
        const at = iso(`${day}T09:0${(i % 8) + 1}:00Z`)
        attendance.push({ session_id: sid, student_id: e.student_id, status, method, recorded_at: at })
        audit.push({ id: aid++, action: 'INSERT', session_id: sid, student_id: e.student_id,
          old_status: null, new_status: status, changed_by: method === 'qr' ? e.student_id : 2, changed_at: at })
      })
      sid++
    }
  }

  return {
    users,
    courses: [
      { id: 1, code: 'CSS326', name: 'Database Programming Laboratory' },
      { id: 2, code: 'CSS227', name: 'Web Programming' },
    ],
    sections,
    enrollments,
    campuses: [
      { id: 1, name: 'Rangsit', lat: 14.0693, lng: 100.60778, radius_m: 600 },
      { id: 2, name: 'Bangkadi', lat: 13.98065, lng: 100.55479, radius_m: 300 },
    ],
    sessions,
    attendance,
    attempts: [],
    audit,
    next: { user: 100, course: 100, section: 100, campus: 100, session: sid, audit: aid, attempt: 1 },
    me: null, // the "login cookie": a user id
    scan: null, // the "scan cookie": { session_id, scanned_at }
    dev: { delayMs: 150, failNext: false, forceCheckin: null },
  }
}

export let db = load()

function load() {
  try {
    const raw = store.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt storage: fall through to a fresh seed */ }
  return seed()
}

export const save = () => store.setItem(KEY, JSON.stringify(db))

export function resetDb() {
  db = seed()
  save()
}

export const nextId = (kind) => db.next[kind]++
