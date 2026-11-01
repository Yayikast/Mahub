import { Link } from 'react-router-dom'
import { FileQuestionMark } from 'lucide-react'
import { HOME, useAuth } from '../auth.jsx'
import Outcome from '../components/Outcome.jsx'

const BACK = { admin: 'Go to admin', instructor: 'Go to my classes', student: 'Go to my attendance' }

// Any unknown URL. The way out goes to the signed-in user's home, or to sign in.
export default function NotFound() {
  const { user } = useAuth()
  return (
    <Outcome
      title="Page not found"
      icon={FileQuestionMark}
      why="The link may be mistyped, or the page no longer exists."
      action={<Link className="btn btn-primary btn-block" to={user ? HOME[user.role] : '/'}>{BACK[user?.role] ?? 'Go to sign in'}</Link>}
    />
  )
}
