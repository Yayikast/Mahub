import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { fmtDate, fmtTime, useLoad } from '../useLoad.js'
import PhoneTop from '../components/PhoneTop.jsx'
import StatusPill from '../components/StatusPill.jsx'

// /me/classes/:id: one class, every check-in newest first with the student's mark.
// The rate comes from /api/my/attendance (closed sessions only), so it matches the /me list exactly.
export default function MyClass() {
  const { id } = useParams()
  const cls = useLoad(`/api/my/classes/${id}`)
  const rate = useLoad('/api/my/attendance').data?.find((c) => String(c.section_id) === id)
  const s = cls.data?.section

  return (
    <main className="phone">
      <PhoneTop />
      <div className="phone-body">
        <div className="intro">
          <Link className="back" to="/me"><ChevronLeft size={16} aria-hidden="true" />My attendance</Link>
          {cls.error && !cls.data ? (
            <>
              <h1 className="result">{cls.error.status === 403 || cls.error.status === 404 ? "This class isn't in your list" : "Couldn't load this class"}</h1>
              <p className="lede">{cls.error.status === 403 || cls.error.status === 404 ? 'Go back to see the classes you are in.' : 'Refresh to try again.'}</p>
            </>
          ) : (
            <>
              <h1 className="result">{s?.course_name ?? 'Loading…'}</h1>
              {s && <p className="lede">{s.course_code} · Section {s.section_no}</p>}
            </>
          )}
        </div>
        {rate?.total_sessions > 0 && (
          <p className="tally num"><strong>{rate.rate}%</strong> attended · {rate.attended} of {rate.total_sessions} check-ins</p>
        )}
        {cls.data?.sessions.length === 0 && <p className="card empty">No check-ins in this class yet.</p>}
        {cls.data?.sessions.length > 0 && (
          <ul className="card list" aria-label="Check-ins">
            {cls.data.sessions.map((x) => (
              <li key={x.session_id} className="list-row">
                <span className="cell-2 num"><strong>{fmtDate(x.opened_at)}</strong><span>{fmtTime(x.opened_at)}</span></span>
                <StatusPill status={x.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
