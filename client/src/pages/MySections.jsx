import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLoad } from '../useLoad.js'
import { Bones, useAnnounce } from './MyAttendance.jsx'

// /instructor: "My classes". The admin Courses table, read only: one card, the course cell spanning its
// sections, and an Open button per section. GET /api/my/sections is one flat list; we group it by course here.
export default function MySections() {
  const { data, error } = useLoad('/api/my/sections')
  const [term, setTerm] = useState('all')
  useAnnounce('My classes')

  const terms = [...new Set((data ?? []).map((s) => s.term))].sort().reverse() // newest term first
  // Map keeps the server's order: courses appear in the order their first section arrives.
  const courses = new Map()
  for (const s of data ?? []) {
    if (term !== 'all' && s.term !== term) continue
    if (!courses.has(s.course_code)) courses.set(s.course_code, { code: s.course_code, name: s.course_name, sections: [] })
    courses.get(s.course_code).sections.push(s)
  }

  return (
    <>
      <div className="page-head"><h1 className="heading">My classes</h1></div>
      {error && !data && <p className="banner banner-error" role="alert">Couldn't load your classes. Refresh to try again.</p>}
      {!data && !error && <><Bones /><p className="sr-only" role="status">Loading your classes</p></>}
      {data?.length === 0 && <p className="card empty">You don't teach any classes yet. Ask your admin to assign you one.</p>}
      {data?.length > 0 && (
        <section className="card crud" aria-label="My classes">
          {terms.length > 1 && (
            <div className="roster-tools">
              <div className="filters" role="group" aria-label="Show term">
                {[['all', 'All terms'], ...terms.map((t) => [t, t])].map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={term === v} onClick={() => setTerm(v)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="table-scroll">
            <table className="table course-table">
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Section</th>
                  <th scope="col">Term</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              {[...courses.values()].map((c) => (
                <tbody key={c.code}>
                  {c.sections.map((s, i) => (
                    <tr key={s.id}>
                      {i === 0 && (
                        <th scope="rowgroup" rowSpan={c.sections.length} className="course-cell">
                          <span className="cell-2"><strong>{c.code}</strong><span>{c.name}</span></span>
                        </th>
                      )}
                      <td className="num">{s.section_no}</td>
                      <td>{s.term}</td>
                      <td className="cell-action">
                        <div className="row-actions">
                          <Link className="btn btn-secondary btn-sm" to={`/instructor/sections/${s.id}`}>Open<span className="sr-only"> {c.code} section {s.section_no}, {s.term}</span></Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>
      )}
    </>
  )
}
