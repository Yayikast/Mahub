import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { fmtDate, fmtTime, useLoad } from '../useLoad.js'
import Crud from '../components/Crud.jsx'
import StatusPill from '../components/StatusPill.jsx'
import { csvDate, csvTime } from '../csv.js'

const ROLES = [['student', 'Student'], ['instructor', 'Instructor'], ['admin', 'Admin']]
const roleName = Object.fromEntries(ROLES)
const two = (a, b) => <span className="cell-2"><strong>{a}</strong><span>{b}</span></span>

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
    { name: 'email', label: 'Email', type: 'email', required: true, hint: 'They sign in with this Google account.' },
    { name: 'role', label: 'Role', required: true, options: ROLES },
    { name: 'student_no', label: 'Student number', inputMode: 'numeric', when: (v) => v.role === 'student' },
  ],
  unique: 'email',
  csv: [['Full name', (u) => u.full_name], ['Email', (u) => u.email], ['Role', (u) => roleName[u.role]], ['Student no.', (u) => u.student_no]],
  name: (u) => u.full_name,
  consequence: "They won't be able to sign in any more. This can't be undone.",
  empty: 'No users yet. Add someone here before they try to sign in.',
}

const COURSES = {
  path: '/api/courses', noun: 'course', plural: 'courses', search: 'Code or name',
  text: (c) => `${c.code} ${c.name}`,
  columns: [{ label: 'Code', cell: (c) => <strong>{c.code}</strong> }, { label: 'Name', cell: (c) => c.name }],
  fields: [
    { name: 'code', label: 'Course code', required: true, placeholder: 'CSS326' },
    { name: 'name', label: 'Course name', required: true },
  ],
  unique: 'code',
  csv: [['Code', (c) => c.code], ['Name', (c) => c.name]],
  name: (c) => c.code,
  empty: 'No courses yet. Add one, then give it sections.',
}

const sectionName = (s) => `${s.course_code} · Section ${s.section_no}`

function SectionsTab({ notify }) {
  // The dropdowns need the courses and the instructors (users with the instructor role).
  const courses = useLoad('/api/courses').data ?? []
  const users = useLoad('/api/users').data ?? []
  return <Crud notify={notify} cfg={{
    path: '/api/sections', noun: 'section', plural: 'sections', search: 'Course, term or instructor',
    text: (s) => `${s.course_code} ${s.course_name} ${s.term} ${s.instructor_name}`,
    columns: [
      { label: 'Course', cell: (s) => two(s.course_code, s.course_name) },
      { label: 'Section', cell: (s) => s.section_no, className: 'num' },
      { label: 'Term', cell: (s) => s.term },
      { label: 'Instructor', cell: (s) => s.instructor_name },
    ],
    fields: [
      { name: 'course_id', label: 'Course', required: true, number: true, options: courses.map((c) => [c.id, `${c.code} · ${c.name}`]) },
      { name: 'section_no', label: 'Section number', required: true, number: true, min: 1, placeholder: '1' },
      { name: 'term', label: 'Term', required: true, placeholder: '2026-1', hint: 'Year, then term number.' },
      { name: 'instructor_id', label: 'Instructor', required: true, number: true, options: users.filter((u) => u.role === 'instructor').map((u) => [u.id, u.full_name]) },
    ],
    name: (s) => `${sectionName(s)} (${s.term})`,
    csv: [['Course code', (s) => s.course_code], ['Course name', (s) => s.course_name], ['Section', (s) => s.section_no], ['Term', (s) => s.term], ['Instructor', (s) => s.instructor_name]],
    consequence: "Its students are unenrolled. This can't be undone.",
    empty: 'No sections yet. A section is one course taught by one instructor in one term.',
  }} />
}

function EnrollmentsTab({ notify }) {
  const sections = useLoad('/api/sections').data
  const users = useLoad('/api/users').data ?? []
  const [picked, setPicked] = useState('')
  const section = sections?.find((s) => String(s.id) === picked) ?? sections?.[0]

  if (!sections) return <p className="card empty">Loading…</p>
  if (!section) return <p className="card empty">No sections yet. <Link className="cell-link" to="?tab=sections">Add one in Sections<ArrowRight size={16} aria-hidden="true" /></Link></p>

  return <Crud key={section.id} notify={notify}
    tools={(
      <label className="pick">Section
        <select className="select" value={section.id} onChange={(e) => setPicked(e.target.value)}>
          {sections.map((s) => <option key={s.id} value={s.id}>{sectionName(s)} ({s.term}) · {s.instructor_name}</option>)}
        </select>
      </label>
    )}
    cfg={{
      path: `/api/sections/${section.id}/enrollments`, noun: 'student', plural: 'students', search: 'Name or student no.',
      idOf: (s) => s.student_id, edit: false, addLabel: 'Enroll student', removeVerb: 'Remove',
      text: (s) => `${s.full_name} ${s.email} ${s.student_no}`,
      columns: [
        { label: 'Student', cell: (s) => two(s.full_name, s.email) },
        { label: 'Student no.', cell: (s) => s.student_no, className: 'num' },
      ],
      fields: [{
        name: 'student_id', label: 'Student', required: true, number: true,
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
    { label: 'Centre (lat, lng)', cell: (c) => `${c.lat}, ${c.lng}`, className: 'num' },
    { label: 'Radius', cell: (c) => `${c.radius_m} m`, className: 'num r' },
  ],
  fields: [
    { name: 'name', label: 'Name', required: true },
    { name: 'lat', label: 'Latitude', required: true, number: true, step: 'any', placeholder: '14.06930', hint: 'Right-click the campus centre in Google Maps to copy it.' },
    { name: 'lng', label: 'Longitude', required: true, number: true, step: 'any', placeholder: '100.60778' },
    { name: 'radius_m', label: 'Check-in radius (metres)', required: true, number: true, min: 1, hint: 'Students further than this from the centre are refused.' },
  ],
  unique: 'name',
  csv: [['Name', (c) => c.name], ['Latitude', (c) => c.lat], ['Longitude', (c) => c.lng], ['Radius (m)', (c) => c.radius_m]],
  name: (c) => `${c.name} campus`,
  empty: 'No campuses yet. Instructors need one to start a check-in.',
}

const ACTIONS = [['all', 'All'], ['INSERT', 'Marked'], ['UPDATE', 'Changed'], ['DELETE', 'Cleared']]
const actionName = Object.fromEntries(ACTIONS)
const word = (status) => status ? status[0].toUpperCase() + status.slice(1) : 'No mark'
const mark = (status) => status ? <StatusPill status={status} /> : <span className="no-mark">No mark</span>

function AuditTab() {
  const users = useLoad('/api/users').data ?? []
  const who = (id) => users.find((u) => u.id === id)?.full_name ?? `User ${id}`
  return <Crud notify={() => {}} cfg={{
    path: '/api/audit?limit=200', noun: 'change', plural: 'changes', search: 'Student or who changed it',
    text: (a) => `${who(a.student_id)} ${who(a.changed_by)}`,
    filter: { key: 'action', label: 'Show changes', options: ACTIONS },
    columns: [
      { label: 'When', cell: (a) => two(fmtTime(a.changed_at), fmtDate(a.changed_at)), className: 'num' },
      { label: 'Student', cell: (a) => who(a.student_id) },
      { label: 'Change', cell: (a) => <span className="change"><strong>{actionName[a.action]}</strong>{mark(a.old_status)}<ArrowRight size={16} aria-label="to" />{mark(a.new_status)}</span> },
      { label: 'By', cell: (a) => a.changed_by === a.student_id ? 'Student (check-in)' : who(a.changed_by) },
      { label: 'Session', cell: (a) => a.session_id, className: 'num r' },
    ],
    csv: [['Date', (a) => csvDate(a.changed_at)], ['Time', (a) => csvTime(a.changed_at)], ['Action', (a) => actionName[a.action]],
      ['Student', (a) => who(a.student_id)], ['From', (a) => word(a.old_status)], ['To', (a) => word(a.new_status)],
      ['By', (a) => a.changed_by === a.student_id ? 'Student (check-in)' : who(a.changed_by)], ['Session', (a) => a.session_id]],
    file: 'mahub audit log',
    empty: 'No attendance changes yet. Every check-in and every mark an instructor changes shows up here.',
  }} />
}

const TABS = [
  ['users', 'Users', (p) => <Crud cfg={USERS} {...p} />],
  ['courses', 'Courses', (p) => <Crud cfg={COURSES} {...p} />],
  ['sections', 'Sections', SectionsTab],
  ['enrollments', 'Enrollments', EnrollmentsTab],
  ['campuses', 'Campuses', (p) => <Crud cfg={CAMPUSES} {...p} />],
  ['audit', 'Audit log', AuditTab],
]

// /admin?tab=users: the tab lives in the URL, so refresh, Back and links all land on the right tab.
export default function Admin() {
  const [params] = useSearchParams()
  const [id, label, Tab] = TABS.find(([t]) => t === params.get('tab')) ?? TABS[0]
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
