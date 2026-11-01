import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { fmtDate, fmtTime, useLoad } from '../useLoad.js'
import PhoneTop from '../components/PhoneTop.jsx'
import StatusPill from '../components/StatusPill.jsx'
import { Bones, useAnnounce } from './MyAttendance.jsx'

// /me/classes/:id: one class, every check-in newest first with the student's mark.
// The rate comes from /api/my/attendance (closed sessions only), so it matches the /me list exactly.
export default function MyClass() {
  const { id } = useParams()
  const cls = useLoad(`/api/my/classes/${id}`)
  const rate = useLoad('/api/my/attendance').data?.find((c) => String(c.section_id) === id)
  const s = cls.data?.section
  const gone = cls.error?.status === 403 || cls.error?.status === 404
  const failed = cls.error && !cls.data
  const title = failed ? (gone ? "This class isn't in your list" : "Couldn't load this class") : s?.course_name
  const heading = useAnnounce(title)

  return (
    <main className="phone">
      <PhoneTop />
      <div className="phone-body">
        <div className="intro">
          <Link className="back" to="/me"><ChevronLeft size={16} aria-hidden="true" />My attendance</Link>
          <h1 className="result" ref={heading} tabIndex={-1}>{title ?? <span className="bone bone-title" />}</h1>
          {failed && <p className="lede">{gone ? 'It may have been removed, or the link is wrong.' : 'Check your connection and try again.'}</p>}
          {s && <p className="lede">{s.course_code} · Section {s.section_no}</p>}
        </div>
        {!cls.data && !cls.error && <><Bones /><p className="sr-only" role="status">Loading this class</p></>}
        {rate?.total_sessions > 0 && (
          <p className="tally num"><strong>{rate.rate}%</strong> attended · {rate.attended} of {rate.total_sessions} check-ins</p>
        )}
        {cls.data?.sessions.length === 0 && <p className="card empty">No check-ins in this class yet.</p>}
        {cls.data?.sessions.length > 0 && (
          <>
            <ul className="card list" aria-label="Check-ins">
              {cls.data.sessions.map((x) => (
                <li key={x.session_id} className="list-row">
                  <span className="cell-2 num"><strong>{fmtDate(x.opened_at)}</strong><span>{fmtTime(x.opened_at)}</span></span>
                  {/* closed_at === null: still open (undefined = the server doesn't send it yet). No mark yet isn't absent. */}
                  <StatusPill status={x.closed_at === null && x.status === 'absent' ? 'open' : x.status} />
                </li>
              ))}
            </ul>
            <p className="help">Only ended check-ins count toward your rate. Think a mark is wrong? Ask your instructor.</p>
          </>
        )}
      </div>
      {failed && (
        <div className="phone-bar">
          {gone
            ? <Link className="btn btn-primary btn-block" to="/me">Back to my attendance</Link>
            : <button className="btn btn-primary btn-block" onClick={cls.reload}>Try again</button>}
        </div>
      )}
    </main>
  )
}
