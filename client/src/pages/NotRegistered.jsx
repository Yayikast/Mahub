import { Link } from 'react-router-dom'
import { UserX } from 'lucide-react'
import Outcome from '../components/Outcome.jsx'

// Where /auth/google/callback sends a Google account that isn't in Mahub (docs/API.md). Nobody is signed in.
export default function NotRegistered() {
  return (
    <Outcome
      title="You're not registered"
      icon={UserX}
      why="This Google account isn't in Mahub yet. An admin adds everyone by email before they can sign in."
      steps={[
        ['Check the account you used', 'Students sign in with their @g.siit.tu.ac.th email'],
        ['Ask your admin to add you', 'Tell them the email you signed in with'],
        ['Sign in again', 'Once they have added you'],
      ]}
      action={<Link className="btn btn-primary btn-block" to="/">Back to sign in</Link>}
    />
  )
}
