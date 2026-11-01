import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus, Search } from 'lucide-react'
import { useLoad } from '../useLoad.js'
import { csvDate, downloadCsv, toCsv } from '../csv.js'
import { Confirm, Sheet } from './Crud.jsx'

// Admin "Courses" tab: courses and their sections in one table. Same routes as before: /api/courses and /api/sections.
export default function CourseTable({ notify }) {
  const courses = useLoad('/api/courses')
  const sections = useLoad('/api/sections')
  const users = useLoad('/api/users').data ?? []
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('all')
  // What's open: { kind: 'course' | 'section', row (null = new), initial } for the form, or the same for delete.
  const [editing, setEditing] = useState(null)
  const [doomed, setDoomed] = useState(null)

  const COURSE = {
    path: '/api/courses', noun: 'course', unique: 'code',
    fields: [
      { name: 'code', label: 'Course code', required: true, placeholder: 'CSS326' },
      { name: 'name', label: 'Course name', required: true },
    ],
    name: (c) => c.code,
    consequence: "This can't be undone.",
  }
  const SECTION = {
    path: '/api/sections', noun: 'section', addLabel: 'Add section',
    fields: [
      { name: 'course_id', label: 'Course', required: true, number: true, options: (courses.data ?? []).map((c) => [c.id, `${c.code} · ${c.name}`]) },
      { name: 'section_no', label: 'Section number', required: true, number: true, min: 1, placeholder: '1' },
      { name: 'term', label: 'Term', required: true, placeholder: '2026-1', hint: 'Year, then term number.' },
      { name: 'instructor_id', label: 'Instructor', required: true, number: true, options: users.filter((u) => u.role === 'instructor').map((u) => [u.id, u.full_name]) },
    ],
    name: (s) => `${s.course_code} · Section ${s.section_no} (${s.term})`,
    consequence: "Its students are unenrolled. This can't be undone.",
  }
  const cfgOf = { course: COURSE, section: SECTION }
  const done = (text) => { courses.reload(); sections.reload(); notify(text) }

  if (courses.error || sections.error) return <p className="banner banner-error" role="alert">Couldn't load courses: {(courses.error ?? sections.error).message}</p>
  if (!courses.data || !sections.data) return <p className="card empty">Loading…</p>

  const terms = [...new Set(sections.data.map((s) => s.term))].sort().reverse() // newest term first
  const needle = query.trim().toLowerCase()
  // A course that matches the search shows all its sections; otherwise only the sections that match.
  // With a term picked, courses without a section in that term are hidden.
  const groups = courses.data.map((c) => {
    const own = sections.data.filter((s) => s.course_id === c.id && (term === 'all' || s.term === term))
    const courseHit = !needle || `${c.code} ${c.name}`.toLowerCase().includes(needle)
    const shown = courseHit ? own : own.filter((s) => `${s.term} ${s.instructor_name} section ${s.section_no}`.toLowerCase().includes(needle))
    const visible = (courseHit || shown.length > 0) && (term === 'all' || own.length > 0)
    return { c, shown, visible }
  }).filter((g) => g.visible)

  function exportShown() {
    const rows = groups.flatMap(({ c, shown }) => shown.length ? shown.map((s) => ({ c, s })) : [{ c }])
    downloadCsv(`mahub-courses-and-sections_${csvDate(new Date())}.csv`, toCsv([
      ['Course code', (r) => r.c.code], ['Course name', (r) => r.c.name], ['Section', (r) => r.s?.section_no],
      ['Term', (r) => r.s?.term], ['Instructor', (r) => r.s?.instructor_name],
    ], rows))
  }

  const exported = groups.reduce((n, g) => n + Math.max(g.shown.length, 1), 0)
  const courseActions = (c) => (
    <div className="row-actions">
      <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ kind: 'section', row: null, initial: { course_id: c.id } })}>
        <Plus size={16} aria-hidden="true" />Add section<span className="sr-only"> to {c.code}</span>
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ kind: 'course', row: c })}>Edit<span className="sr-only"> {c.code}</span></button>
      <button className="btn btn-secondary btn-sm" onClick={() => setDoomed({ kind: 'course', row: c })}>Delete<span className="sr-only"> {c.code}</span></button>
    </div>
  )

  // Same frame as every other admin tab (Crud.jsx): one card, toolbar inside, then the table.
  // The course cell spans its section rows, so each course reads as one block without a coloured band.
  return (
    <section className="card crud" aria-label="Courses and sections">
      <div className="roster-tools">
        {terms.length > 1 && (
          <div className="filters" role="group" aria-label="Show term">
            {[['all', 'All terms'], ...terms.map((t) => [t, t])].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={term === v} onClick={() => setTerm(v)}>{label}</button>
            ))}
          </div>
        )}
        <div className="toolbar-end">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Find courses or sections</span>
            <input type="search" placeholder="Course or instructor" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="btn btn-secondary btn-md" onClick={exportShown} disabled={groups.length === 0}>
            <Download size={18} aria-hidden="true" />Export <span className="num">{exported}</span><span className="sr-only"> rows as CSV</span>
          </button>
          <button className="btn btn-primary btn-md" onClick={() => setEditing({ kind: 'course', row: null })}>
            <Plus size={18} aria-hidden="true" />Add course
          </button>
        </div>
      </div>

      {courses.data.length === 0 && <p className="empty">No courses yet. Add one, then give it sections.</p>}
      {courses.data.length > 0 && groups.length === 0 && <p className="empty">No courses or sections match {needle ? `"${query.trim()}"` : 'this term'}.</p>}
      {groups.length > 0 && (
        <div className="table-scroll">
          <table className="table course-table">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Section</th>
                <th scope="col">Term</th>
                <th scope="col">Instructor</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            {groups.map(({ c, shown }) => {
              const course = (
                <th scope="rowgroup" rowSpan={Math.max(shown.length, 1)} className="course-cell">
                  <span className="cell-2"><strong>{c.code}</strong><span>{c.name}</span></span>
                  {courseActions(c)}
                </th>
              )
              return (
                <tbody key={c.id}>
                  {shown.length === 0 && <tr>{course}<td colSpan={4} className="no-mark">No sections yet.</td></tr>}
                  {shown.map((s, i) => (
                    <tr key={s.id}>
                      {i === 0 && course}
                      <td className="num">{s.section_no}</td>
                      <td>{s.term}</td>
                      <td>{s.instructor_name}</td>
                      <td className="cell-action">
                        <div className="row-actions">
                          <Link className="btn btn-secondary btn-sm" to={`?tab=enrollments&section=${s.id}`}>Students<span className="sr-only"> in {SECTION.name(s)}</span></Link>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ kind: 'section', row: s })}>Edit<span className="sr-only"> {SECTION.name(s)}</span></button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setDoomed({ kind: 'section', row: s })}>Delete<span className="sr-only"> {SECTION.name(s)}</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
      )}

      {editing && <Sheet cfg={cfgOf[editing.kind]} row={editing.row} initial={editing.initial} rows={[]} onSaved={done} onClose={() => setEditing(null)} />}
      {doomed && <Confirm cfg={cfgOf[doomed.kind]} row={doomed.row} id={doomed.row.id} onDone={done} onClose={() => setDoomed(null)} />}
    </section>
  )
}
