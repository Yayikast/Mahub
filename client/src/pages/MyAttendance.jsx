import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { useLoad } from '../useLoad.js'
import PhoneTop from '../components/PhoneTop.jsx'

// Phone screens set the tab title and move focus to the headline (like Outcome.jsx),
// so a screen reader announces the new page. Runs again when the title changes (after loading).
export function useAnnounce(title) {
  const heading = useRef(null)
  useEffect(() => {
    if (!title) return
    document.title = `${title} · Mahub`
    heading.current?.focus()
  }, [title])
  return heading
}

// Three grey rows in the shape of the real list, while it loads.
export const Bones = () => (
  <ul className="card list" aria-hidden="true">
    {[0, 1, 2].map((i) => <li key={i} className="bones"><span className="bone" style={{ width: '60%' }} /><span className="bone" style={{ width: '35%' }} /></li>)}
  </ul>
)

// /me: the student's home. One row per class with the rate on the right (GET /api/my/attendance).
// A phone screen like /checkin (no desktop top bar), so Sign out lives at the bottom here.
export default function MyAttendance() {
  const { data, error, reload } = useLoad('/api/my/attendance')
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const heading = useAnnounce('My attendance')

  return (
    <main className="phone">
      <PhoneTop />
      <div className="phone-body">
        <div className="intro">
          <h1 className="result" ref={heading} tabIndex={-1}>My attendance</h1>
          <p className="lede">Present and excused both count.</p>
        </div>
        {error && !data && <p className="banner banner-error" role="alert">Couldn't load your classes. Check your connection and try again.</p>}
        {!data && !error && <><Bones /><p className="sr-only" role="status">Loading your classes</p></>}
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
        <button className="link sign-out" onClick={async () => { await signOut(); navigate('/') }}>Sign out</button>
      </div>
      {error && !data && <div className="phone-bar"><button className="btn btn-primary btn-block" onClick={reload}>Try again</button></div>}
    </main>
  )
}
