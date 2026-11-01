import { useAuth } from '../auth.jsx'
import Logo from './Logo.jsx'

// Top row of every phone screen: wordmark, and who is signed in (so a student sees "this is me").
export default function PhoneTop() {
  const { user } = useAuth()
  const first = user?.full_name?.split(' ')[0]
  return (
    <header className="phone-top">
      <Logo />
      {first && (
        <span className="who">
          <span className="avatar" aria-hidden="true">{first[0]}</span>
          {first}
        </span>
      )}
    </header>
  )
}
