import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { fmtTime } from '../useLoad.js'
import StatusPill from './StatusPill.jsx'

const FILTERS = [['all', 'All'], ['present', 'Present'], ['excused', 'Excused'], ['absent', 'Absent']]

// The roster from GET /api/sessions/:id/roster: filter buttons with counts, a search box, one row per student.
// With `onMark(student, status | null)` each row gets Present / Excused / Clear; without it, it's read only (summary).
// `saving` is the student_id whose mark is being saved, so only that row's buttons wait.
export default function Roster({ roster, onMark, saving }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  // Remember each student's status from the last poll, so a student who just checked in can flash green once.
  const before = useRef(null)
  useEffect(() => { before.current = Object.fromEntries(roster.students.map((s) => [s.student_id, s.status])) }, [roster])
  const isNew = (s) => before.current && s.student_id in before.current && before.current[s.student_id] !== s.status && s.status === 'present'

  const counts = { all: roster.counts.total, ...roster.counts }
  const needle = query.trim().toLowerCase()
  const rows = roster.students.filter((s) =>
    (filter === 'all' || s.status === filter) &&
    (!needle || s.full_name.toLowerCase().includes(needle) || s.student_no.includes(needle)))

  return (
    <section className="card roster" aria-label="Roster">
      <div className="roster-tools">
        <div className="filters" role="group" aria-label="Show students">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span className="num">{counts[key]}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Find a student</span>
          <input type="search" placeholder="Name or student no." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Checked in</th>
            <th scope="col">Status</th>
            {onMark && <th scope="col"><span className="sr-only">Change mark</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.student_id} className={isNew(s) ? 'row-new' : undefined}>
              <td><span className="cell-2"><strong>{s.full_name}</strong><span className="num">{s.student_no}</span></span></td>
              <td>
                {s.recorded_at && (
                  <span className="cell-2"><span className="num">{fmtTime(s.recorded_at)}</span>{s.method === 'manual' && <span>By hand</span>}</span>
                )}
              </td>
              <td><StatusPill status={s.status} /></td>
              {onMark && (
                <td className="cell-action">
                  <div className="seg" role="group" aria-label={`Mark ${s.full_name}`}>
                    {['present', 'excused'].map((status) => (
                      <button key={status} type="button" aria-pressed={s.status === status} disabled={saving === s.student_id}
                        onClick={() => s.status !== status && onMark(s, status)}>
                        {status === 'present' ? 'Present' : 'Excused'}
                      </button>
                    ))}
                    <button type="button" disabled={saving === s.student_id || s.status === 'absent'} onClick={() => onMark(s, null)}>Clear</button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="empty">{needle ? `No student matches "${query.trim()}".` : `No ${filter} students.`}</p>
      )}
    </section>
  )
}
