import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight } from 'lucide-react'
import { useLoad } from '../useLoad.js'

// /instructor: "My classes". GET /api/my/sections gives one flat list; we group it by course here,
// so each course is one box: its name on top, its sections underneath, and every section is still one click away.
export default function MySections() {
  const { data, error } = useLoad('/api/my/sections')

  // Map keeps the server's order: courses appear in the order their first section arrives.
  const courses = new Map()
  for (const s of data ?? []) {
    if (!courses.has(s.course_code)) courses.set(s.course_code, { code: s.course_code, name: s.course_name, sections: [] })
    courses.get(s.course_code).sections.push(s)
  }

  return (
    <>
      <div className="page-head"><h1 className="heading">My classes</h1></div>
      {error && !data && <p className="banner banner-error" role="alert">Couldn't load your classes. Refresh to try again.</p>}
      {data?.length === 0 && <p className="card empty">You don't teach any classes yet. Ask your admin to assign you one.</p>}
      {[...courses.values()].map((c) => (
        <section key={c.code} className="card course" aria-labelledby={`course-${c.code}`}>
          <h2 className="course-head" id={`course-${c.code}`}>
            <span className="icon-circle icon-circle-sm"><BookOpen size={20} aria-hidden="true" /></span>
            <span className="cell-2"><strong>{c.code}</strong><span>{c.name}</span></span>
          </h2>
          <ul className="list">
            {c.sections.map((s) => (
              <li key={s.id}>
                <Link to={`/instructor/sections/${s.id}`}>
                  <span className="cell-2"><strong>Section {s.section_no}</strong><span>Term {s.term}</span></span>
                  <ChevronRight size={20} aria-hidden="true" className="list-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
