import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { fmtDate, fmtTime, useLoad } from '../useLoad.js'
import Crud, { Rows } from '../components/Crud.jsx'
import { useAuth } from '../auth.jsx'
import CourseTable from '../components/CourseTable.jsx'
import StatusPill from '../components/StatusPill.jsx'
import { ENROLL, USERS as USERS_IMPORT } from '../components/ImportDialog.jsx'
import { csvDate, csvTime } from '../csv.js'

const ROLES = [['student', 'Student'], ['instructor', 'Instructor'], ['admin', 'Admin']]
const roleName = Object.fromEntries(ROLES)
const two = (a, b) => <span className="cell-2"><strong>{a}</strong><span>{b}</span></span>
const SIIT = /@g\.siit\.tu\.ac\.th$/i // docs/API.md: student emails only; the server checks it too

const USERS = {
  path: '/api/users', noun: 'user', plural: 'users', search: 'Name, email or student no.',
  text: (u) => `${u.full_name} ${u.email} ${u.student_no ?? ''}`,
  filter: { key: 'role', label: 'Show role', options: [['all', 'All'], ['student', 'Students'], ['instructor', 'Instructors'], ['admin', 'Admins']] },
  columns: [
    { label: 'Name', cell: (u) => two(u.full_name, u.email) },
    { label: 'Role', cell: (u) => roleName[u.role] },
    { label: 'Student no.', cell: (u) => u.student_no, className: 'num' },
  ],
  fields: [
    { name: 'full_name', label: 'Full name', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true,
      hint: (v) => v.role === 'student' ? 'Students sign in with their @g.siit.tu.ac.th Google account.' : 'They sign in with this Google account.',
      check: (email, v) => v.role === 'student' && email && !SIIT.test(email) ? 'Student emails must end in @g.siit.tu.ac.th.' : undefined },
    { name: 'role', label: 'Role', required: true, options: ROLES },
    { name: 'student_no', label: 'Student number', inputMode: 'numeric', when: (v) => v.role === 'student', hiddenValue: null, hint: '10 digits.',
      check: (no) => no && !/^\d{10}$/.test(no) ? 'Student numbers are 10 digits.' : undefined },
  ],
  unique: 'email',
  importer: { kind: USERS_IMPORT, path: '/api/users/import' },
  csv: [['Full name', (u) => u.full_name], ['Email', (u) => u.email], ['Role', (u) => roleName[u.role]], ['Student no.', (u) => u.student_no]],
  name: (u) => u.full_name,
  consequence: "They won't be able to sign in any more. This can't be undone.",
  empty: 'No users yet. Add someone here before they try to sign in.',
}

// The signed-in admin's own row says "(you)", has no Delete and a fixed role, so nobody locks themselves out.
function UsersTab(p) {
  const me = useAuth().user?.id
  const cfg = {
    ...USERS, keep: (u) => u.id === me,
    // Changing your own role away from Admin would lock you out just like deleting yourself.
    fields: USERS.fields.map((f) => f.name === 'role' ? { ...f, lock: (u) => u?.id === me && "You can't change your own role." } : f),
    columns: [{ label: 'Name', cell: (u) => two(<>{u.full_name}{u.id === me && <span className="you"> (you)</span>}</>, u.email) }, ...USERS.columns.slice(1)],
  }
  return <Crud cfg={cfg} {...p} />
}

const sectionName = (s) => `${s.course_code} · Section ${s.section_no}`

function EnrollmentsTab({ notify }) {
  const sections = useLoad('/api/sections').data
  const users = useLoad('/api/users').data ?? []
  const [params] = useSearchParams()
  const [picked, setPicked] = useState(params.get('section') ?? '') // the Courses tab links here with ?section=
  const section = sections?.find((s) => String(s.id) === picked) ?? sections?.[0]

  if (!sections) return <section className="card crud"><Rows label="sections" /></section>
  if (!section) return <p className="card empty">No sections yet. <Link className="cell-link" to="?tab=courses">Add one in Courses<ArrowRight size={16} aria-hidden="true" /></Link></p>

  return <Crud key={section.id} notify={notify}
    tools={(
      <label className="pick">Section
        <select className="select" value={section.id} onChange={(e) => setPicked(e.target.value)}>
          {[...new Set(sections.map((s) => s.term))].sort().reverse().map((t) => ( // newest term first
            <optgroup key={t} label={t}>
              {sections.filter((s) => s.term === t).map((s) => <option key={s.id} value={s.id}>{sectionName(s)} · {s.instructor_name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
    )}
    cfg={{
      path: `/api/sections/${section.id}/enrollments`, noun: 'student', plural: 'students', search: 'Name or student no.',
      idOf: (s) => s.student_id, edit: false, importer: { kind: ENROLL, path: `/api/sections/${section.id}/enrollments/import` }, addLabel: 'Enroll student', removeVerb: 'Remove',
      text: (s) => `${s.full_name} ${s.email} ${s.student_no}`,
      columns: [
        { label: 'Student', cell: (s) => two(s.full_name, s.email) },
        { label: 'Student no.', cell: (s) => s.student_no, className: 'num' },
      ],
      fields: [{
        name: 'student_id', label: 'Student', required: true, number: true, combo: true, placeholder: 'Name or student no.',
        hint: 'Students already in this section are not listed.',
        options: (enrolled) => users
          .filter((u) => u.role === 'student' && !enrolled.some((e) => e.student_id === u.id))
          .map((u) => [u.id, `${u.full_name} · ${u.student_no ?? 'no student no.'}`]),
      }],
      name: (s) => `${s.full_name} from ${sectionName(section)}`,
      csv: [['Student no.', (s) => s.student_no], ['Full name', (s) => s.full_name], ['Email', (s) => s.email]],
      file: `${sectionName(section)} ${section.term} students`,
      consequence: "They won't be able to check in to this section.",
      empty: 'Nobody is enrolled yet. Enroll students so they can check in.',
    }} />
}

const CAMPUSES = {
  path: '/api/campuses', noun: 'campus', plural: 'campuses', search: 'Campus name',
  text: (c) => c.name,
  columns: [
    { label: 'Campus', cell: (c) => <strong>{c.name}</strong> },
    { label: 'Centre (lat, lng)', cell: (c) => `${Number(c.lat).toFixed(5)}, ${Number(c.lng).toFixed(5)}`, className: 'num' },
    { label: 'Radius', cell: (c) => `${c.radius_m} m`, className: 'num r' },
  ],
  fields: [
    { name: 'name', label: 'Name', required: true },
    { name: 'lat', label: 'Latitude', required: true, number: true, step: 'any', placeholder: '14.06930', hint: 'Right-click the campus centre in Google Maps to copy it.' },
    { name: 'lng', label: 'Longitude', required: true, number: true, step: 'any', placeholder: '100.60778' },
    { name: 'radius_m', label: 'Check-in radius (metres)', required: true, number: true, min: 10, max: 5000,
      check: (m) => m && (Number(m) < 10 || Number(m) > 5000) ? 'Radius must be between 10 and 5000 metres.' : undefined, hint: "Students further than this from the centre are refused, after allowing for their phone's GPS accuracy." },
  ],
  unique: 'name',
  csv: [['Name', (c) => c.name], ['Latitude', (c) => c.lat], ['Longitude', (c) => c.lng], ['Radius (m)', (c) => c.radius_m]],
  name: (c) => `${c.name} campus`,
  consequence: "Instructors can't pick it for check-in any more. This can't be undone.",
  empty: 'No campuses yet. Instructors need one to start a check-in.',
}

// Audit rows come in three shapes (docs/API.md). Rows from before `type` existed are attendance rows.
const TYPES = [['all', 'All'], ['attendance', 'Attendance'], ['enrollment', 'Enrollments'], ['import', 'Imports']]
const typeOf = (a) => a.type ?? 'attendance'
const MARK_ACTION = { INSERT: 'Marked', UPDATE: 'Changed', DELETE: 'Cleared' }
const word = (status) => status ? status[0].toUpperCase() + status.slice(1) : 'No mark'
const mark = (status) => status ? <StatusPill status={status} /> : <span className="no-mark">No mark</span>
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

const LIMIT = 200

function AuditTab() {
  const users = useLoad('/api/users').data ?? []
  const sections = useLoad('/api/sections').data ?? []
  const who = (id) => users.find((u) => u.id === id)?.full_name ?? `User ${id}`
  const cls = (id) => { const s = sections.find((x) => x.id === id); return s ? `${s.course_code} · Section ${s.section_no}` : `Section ${id}` }
  const by = (a) => a.changed_by === a.student_id ? 'Student (check-in)' : who(a.changed_by)
  // One plain sentence per row, so the table and the CSV say the same thing.
  const what = (a) => {
    const t = typeOf(a)
    if (t === 'enrollment') return a.action === 'DELETE' ? `Removed from ${cls(a.section_id)}` : `Enrolled in ${cls(a.section_id)}`
    if (t === 'import') {
      const x = a.summary ?? {}
      return a.section_id == null
        ? `Added ${count(x.new_user ?? 0, 'user', 'users')} from CSV`
        : `Enrolled ${count((x.enroll ?? 0) + (x.new_user ?? 0), 'student', 'students')} in ${cls(a.section_id)} from CSV${x.new_user ? ` (${x.new_user} new)` : ''}`
    }
    return `${MARK_ACTION[a.action]} ${word(a.old_status)} to ${word(a.new_status)}`
  }
  return <Crud notify={() => {}} cfg={{
    path: `/api/audit?limit=${LIMIT}`, noun: 'change', plural: 'changes', search: 'Student, class or person',
    text: (a) => `${a.student_id ? who(a.student_id) : ''} ${who(a.changed_by)} ${what(a)} ${a.session_id ? `session ${a.session_id}` : ''}`,
    note: (rows) => rows.length >= LIMIT && `Showing the latest ${LIMIT} changes. Older ones are kept but not listed here.`,
    filter: { key: typeOf, label: 'Show changes', options: TYPES },
    columns: [
      { label: 'When', cell: (a) => two(fmtTime(a.changed_at), fmtDate(a.changed_at)), className: 'num' },
      { label: 'Student', cell: (a) => a.student_id ? who(a.student_id) : <span className="no-mark">Many</span> },
      { label: 'Change', cell: (a) => typeOf(a) === 'attendance'
        ? <span className="change"><strong>{MARK_ACTION[a.action]}</strong>{mark(a.old_status)}<ArrowRight size={16} aria-hidden="true" /><span className="sr-only">to</span>{mark(a.new_status)}</span>
        : what(a) },
      { label: 'By', cell: by },
      { label: 'Session', cell: (a) => a.session_id, className: 'num r' },
    ],
    csv: [['Date', (a) => csvDate(a.changed_at)], ['Time', (a) => csvTime(a.changed_at)], ['Type', (a) => typeOf(a)],
      ['Student', (a) => a.student_id ? who(a.student_id) : ''], ['Change', what], ['By', by], ['Session', (a) => a.session_id]],
    file: 'mahub audit log',
    empty: 'No changes yet. Every check-in, mark, enrollment change and import shows up here.',
  }} />
}

const TABS = [
  ['users', 'Users', UsersTab],
  ['courses', 'Courses', CourseTable], // courses with their sections under them
  ['enrollments', 'Enrollments', EnrollmentsTab],
  ['campuses', 'Campuses', (p) => <Crud cfg={CAMPUSES} {...p} />],
  ['audit', 'Audit log', AuditTab],
]

// /admin?tab=users: the tab lives in the URL, so refresh, Back and links all land on the right tab.
export default function Admin() {
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'sections' ? 'courses' : params.get('tab') // old Sections links still land
  const [id, label, Tab] = TABS.find(([t]) => t === tab) ?? TABS[0]
  const [toast, setToast] = useState(null)
  // Hide the toast after 4 s. The effect re-runs per toast (new id), so a second save restarts the timer.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])
  const notify = (text) => setToast({ text, id: Date.now() })

  return (
    <>
      <div className="page-head"><h1 className="heading">Admin</h1></div>
      <nav className="tabs" aria-label="Admin sections">
        {TABS.map(([t, name]) => <Link key={t} to={`?tab=${t}`} aria-current={t === id ? 'page' : undefined}>{name}</Link>)}
      </nav>
      <h2 className="sr-only">{label}</h2>
      <Tab key={id} notify={notify} />
      {/* Always in the page so screen readers hear each new message. */}
      <div className="toast-region" role="status">
        {toast && <p className="toast" key={toast.id}><CircleCheck size={20} aria-hidden="true" />{toast.text}</p>}
      </div>
    </>
  )
}
