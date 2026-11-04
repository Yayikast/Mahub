import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../api.js'
import { fmtTime } from '../useLoad.js'
import StatusPill from './StatusPill.jsx'

// Hand marks (PUT/DELETE /api/sessions/:id/attendance/:studentId), shared by the live page and the summary.
// `saving` is the student being saved; `reload` refreshes the roster after a change.
export function useMarking(sessionId, reload) {
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState('')
  async function mark(student, status) {
    setSaving(student.student_id)
    setError('')
    try {
      const path = `/api/sessions/${sessionId}/attendance/${student.student_id}`
      if (status) await api.put(path, { status })
      else await api.delete(path)
      reload()
    } catch {
      setError(`Couldn't change ${student.full_name}'s mark. Check your connection and try again.`)
    }
    setSaving(null)
  }
  return { saving, error, mark }
}

// The roster from GET /api/sessions/:id/roster: filter buttons with counts, a search box, one row per student.
// With `onMark(student, status | null)` each row gets Present / Excused / Clear; without it, it's read only (summary).
// `saving` is the student_id whose mark is being saved, so only that row's buttons wait.
// `tries` maps student_id -> the reason of their latest failed check-in, shown on rows without a mark.
// `pick` (a search string from outside) shows only matching rows and no tools: for marking one student
// on a projected screen. The room sees it too, so it waits for 3 characters, shows at most 3 names,
// and leaves out student numbers and failure reasons.
const PICK_MIN = 3
const PICK_MAX = 3

export default function Roster({ roster, onMark, saving, tries = {}, pick }) {
  const [filter, setFilter] = useState('all')
  const [ownQuery, setQuery] = useState('')
  const query = pick ?? ownQuery

  // Remember each student's status from the last poll, so a student who just checked in can flash green once.
  const before = useRef(null)
  useEffect(() => { before.current = Object.fromEntries(roster.students.map((s) => [s.student_id, s.status])) }, [roster])
  const isNew = (s) => before.current && s.student_id in before.current && before.current[s.student_id] !== s.status && s.status === 'present'

  // While check-in is open, "absent" only means "hasn't checked in yet" (docs/API.md).
  const notYet = roster.is_open
  const filters = [['all', 'All'], ['present', 'Present'], ['excused', 'Excused'], ['absent', notYet ? 'Not yet' : 'Absent']]
  const counts = { all: roster.counts.total, ...roster.counts }
  const needle = query.trim().toLowerCase()
  const picking = pick !== undefined
  const matches = picking && needle.length < PICK_MIN ? [] : roster.students.filter((s) =>
    (filter === 'all' || s.status === filter) &&
    (!needle || s.full_name.toLowerCase().includes(needle) || s.student_no.includes(needle)))
  const rows = picking ? matches.slice(0, PICK_MAX) : matches
  const more = matches.length - rows.length

  return (
    <section className="card roster" aria-label={picking ? 'Matching students' : 'Roster'}>
      {!picking && <div className="roster-tools">
        <div className="filters" role="group" aria-label="Show students">
          {filters.map(([key, label]) => (
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
      </div>}

      {rows.length > 0 && <div className="table-scroll"><table className="table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            {!picking && <th scope="col">Checked in</th>}
            <th scope="col">Status</th>
            {onMark && <th scope="col"><span className="sr-only">Change mark</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.student_id} className={isNew(s) ? 'row-new' : undefined}>
              <td><span className="cell-2"><strong>{s.full_name}</strong>{!picking && <span className="num">{s.student_no}</span>}</span></td>
              {!picking && <td>
                {s.recorded_at
                  ? <span className="cell-2"><span className="num">{fmtTime(s.recorded_at)}</span>{s.method === 'manual' && <span>By hand</span>}</span>
                  : tries[s.student_id] && <span className="row-note">Failed: {tries[s.student_id]}</span>}
              </td>}
              <td>{notYet && s.status === 'absent' ? <StatusPill status="open" label="Not yet" /> : <StatusPill status={s.status} />}</td>
              {onMark && (
                <td className="cell-action">
                  <div className="marks" role="group" aria-label={`Mark ${s.full_name}`}>
                    <div className="seg">
                      {['present', 'excused'].map((status) => (
                        <button key={status} type="button" aria-pressed={s.status === status} disabled={saving === s.student_id}
                          onClick={() => s.status !== status && onMark(s, status)}>
                          {status === 'present' ? 'Present' : 'Excused'}
                        </button>
                      ))}
                    </div>
                    {/* Only a mark can be cleared; on unmarked rows it keeps its space (hidden) so the columns line up. */}
                    <button type="button" className="clear-mark" hidden={s.status === 'absent'} disabled={saving === s.student_id}
                      onClick={() => onMark(s, null)}>Clear<span className="sr-only"> {s.full_name}'s mark</span></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table></div>}
      {picking && needle.length < PICK_MIN && <p className="empty">Type at least {PICK_MIN} letters of a name, or digits of a student no.</p>}
      {more > 0 && <p className="empty">{more} more {more === 1 ? 'matches' : 'match'}. Keep typing to narrow it down.</p>}
      {rows.length === 0 && !(picking && needle.length < PICK_MIN) && (
        <p className="empty">{needle ? `No student matches "${query.trim()}".` : `No ${filters.find(([k]) => k === filter)[1].toLowerCase()} students.`}</p>
      )}
    </section>
  )
}
