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
      <PhoneTop back={<Link className="back-btn" to="/me" aria-label="Back to my attendance"><ChevronLeft size={24} aria-hidden="true" /></Link>} />
      <div className="phone-body">
        <div className={s ? 'intro class-banner' : 'intro'}>
          {s && <p className="banner-code num">{s.course_code} · Section {s.section_no}</p>}
          <h1 className="result" ref={heading} tabIndex={-1}>{title ?? <span className="bone bone-title" />}</h1>
          {failed && <p className="lede">{gone ? 'It may have been removed, or the link is wrong.' : 'Check your connection and try again.'}</p>}
          {/* The two numbers a student looks for, big enough to read at a glance (Atoms' completion-rate card). */}
          {rate?.total_sessions > 0 && (
            <dl className="banner-stats num">
              <div><dt>Attended</dt><dd>{rate.rate}%</dd></div>
              <div><dt>Check-ins</dt><dd>{rate.attended}<small> / {rate.total_sessions}</small></dd></div>
            </dl>
          )}
        </div>
        {!cls.data && !cls.error && <><Bones /><p className="sr-only" role="status">Loading this class</p></>}
        {cls.data?.sessions.length === 0 && <p className="card empty">No check-ins in this class yet.</p>}
        {cls.data?.sessions.length > 0 && (
          <>
            <ul className="card list" aria-label="Check-ins">
              {cls.data.sessions.map((x) => (
                <li key={x.session_id} className="list-row">
                  {/* A mark in an open check-in isn't in the rate yet; say so, or the tally looks wrong. */}
                  <span className="cell-2 num"><strong>{fmtDate(x.opened_at)}</strong><span>{fmtTime(x.opened_at)}{x.closed_at === null && x.status !== 'absent' && <><br />Counts when check-in ends</>}</span></span>
                  {/* closed_at === null: still open (undefined = the server doesn't send it yet). No mark yet isn't absent. */}
                  <StatusPill status={x.closed_at === null && x.status === 'absent' ? 'open' : x.status} />
                </li>
              ))}
            </ul>
            <p className="help">Think a mark is wrong? Ask your instructor.</p>
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
