import { Link } from 'react-router-dom'
import { ArrowRight, FileQuestionMark } from 'lucide-react'
import { HOME, useAuth } from '../auth.jsx'
import Outcome from '../components/Outcome.jsx'
import Shell from '../components/Shell.jsx'
import { useAnnounce } from './MyAttendance.jsx'

const BACK = { admin: 'Go to admin', instructor: 'Go to my classes', student: 'Go to my attendance' }
const WHY = 'The link may be mistyped, or the page no longer exists.'

// Any unknown URL. The way out goes to the signed-in user's home, or to sign in.
// Like /privacy: instructors and admins (on a laptop) get the desktop frame; students and
// signed-out visitors (often a phone opening a shared link) get the phone screen.
export default function NotFound() {
  const { user } = useAuth()
  const desk = user && user.role !== 'student'
  const heading = useAnnounce(desk ? 'Page not found' : null) // Outcome announces the phone screen itself

  if (desk) {
    return (
      <Shell>
        <div className="page-head"><h1 className="heading" ref={heading} tabIndex={-1}>Page not found</h1></div>
        <p className="card empty">
          {WHY} <Link className="cell-link" to={HOME[user.role]}>{BACK[user.role]}<ArrowRight size={16} aria-hidden="true" /></Link>
        </p>
      </Shell>
    )
  }

  return (
    <Outcome
      title="Page not found"
      icon={FileQuestionMark}
      why={WHY}
      action={<Link className="btn btn-primary btn-block" to={user ? HOME[user.role] : '/'}>{BACK[user?.role] ?? 'Go to sign in'}</Link>}
    />
  )
}
