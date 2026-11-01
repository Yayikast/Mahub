import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { useLoad } from '../useLoad.js'
import PhoneTop from '../components/PhoneTop.jsx'

// /me: the student's home. One row per class with the rate on the right (GET /api/my/attendance).
// A phone screen like /checkin (no desktop top bar), so Sign out lives at the bottom here.
export default function MyAttendance() {
  const { data, error } = useLoad('/api/my/attendance')
  const { signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <main className="phone">
      <PhoneTop />
      <div className="phone-body">
        <div className="intro">
          <h1 className="result">My attendance</h1>
          <p className="lede">Present and excused both count.</p>
        </div>
        {error && !data && <p className="banner banner-error" role="alert">Couldn't load your classes. Refresh to try again.</p>}
        {!data && !error && <p className="lede">Loading…</p>}
        {data?.length === 0 && <p className="card empty">You're not in any classes yet. If that's wrong, ask your instructor.</p>}
        {data?.length > 0 && (
          <ul className="card list">
            {data.map((c) => (
              <li key={c.section_id}>
                <Link to={`/me/classes/${c.section_id}`}>
                  <span className="cell-2"><strong>{c.course_name}</strong><span>{c.course_code} · Section {c.section_no}</span></span>
                  {c.total_sessions > 0
                    ? <span className="cell-2 rate num">
                      <strong>{c.rate}%<span className="sr-only"> attended</span></strong>
                      <span><span aria-hidden="true">{c.attended} / {c.total_sessions}</span><span className="sr-only">{c.attended} of {c.total_sessions} check-ins</span></span>
                    </span>
                    : <span className="rate rate-none">Not started</span>}
                  <ChevronRight size={20} aria-hidden="true" className="list-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-secondary btn-block sign-out" onClick={async () => { await signOut(); navigate('/') }}>Sign out</button>
      </div>
    </main>
  )
}
