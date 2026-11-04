import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, MOCK } from '../api.js'
import { HOME, useAuth } from '../auth.jsx'
import PhoneTop from '../components/PhoneTop.jsx'
import { useAnnounce } from './MyAttendance.jsx'

const ROLES = [['admin', 'Admins'], ['instructor', 'Instructors'], ['student', 'Students']]

// `/`: one phone screen for every role (students arrive here after scanning; instructors on a laptop
// see the same card centred on paper). The one action, Sign in with Google, sits in the bottom bar.
export default function Login() {
  const { user, signInAs } = useAuth()
  const navigate = useNavigate()
  const [devUsers, setDevUsers] = useState([])
  const [params] = useSearchParams()
  // The Google callback sends a failed sign-in (Cancel, lost cookie) back here as ?error=signin.
  const [error, setError] = useState(params.get('error') === 'signin' ? "Sign-in didn't finish. Please try again." : '')
  const heading = useAnnounce('Sign in')

  // The dev-user buttons exist only when the server has DEV_LOGIN=1; otherwise it answers 404
  // and we simply show no buttons.
  useEffect(() => { api.get('/auth/dev-users').then(setDevUsers).catch(() => {}) }, [])

  if (user) return <Navigate to={HOME[user.role]} replace />

  async function pick(id) {
    setError('')
    try {
      await signInAs(id)
      // Mock only: a student who scanned before signing in goes straight on to check in,
      // like the real redirect after Google sign-in.
      const pending = import.meta.env.VITE_MOCK === '1' && (await import('../mock/server.js')).hasPendingScan()
      const role = devUsers.find((u) => u.id === id)?.role
      navigate(pending && role === 'student' ? '/checkin' : HOME[role])
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <main className="phone">
      <PhoneTop />
      <div className="phone-body">
        <div className="intro">
          <h1 className="result" ref={heading} tabIndex={-1}>Sign in</h1>
          <p className="lede">Use your SIIT Google account. Students sign in with their @g.siit.tu.ac.th email.</p>
        </div>
        <p className="help"><Link to="/privacy">How Mahub uses your data</Link></p>
        {MOCK && <p className="help">Google sign-in is off in mock mode. Pick a dev account below.</p>}
        {error && <p className="banner banner-error" role="alert">{error}</p>}
        {devUsers.length > 0 && (
          <section className="dev" aria-labelledby="dev-title">
            <h2 id="dev-title" className="dev-rule">Dev only</h2>
            {ROLES.map(([role, label]) => {
              const people = devUsers.filter((u) => u.role === role)
              return people.length > 0 && (
                // Students are many, so their group starts closed.
                <details key={role} className="card attempts" open={role !== 'student'}>
                  <summary>{label} <span className="num">{people.length}</span></summary>
                  <ul>
                    {people.map((u) => (
                      <li key={u.id}>
                        <button type="button" className="dev-user" onClick={() => pick(u.id)}>
                          <strong>{u.full_name}</strong><span>{u.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )
            })}
          </section>
        )}
      </div>
      <div className="phone-bar">
        {MOCK
          ? <button className="btn btn-primary btn-block" disabled>Sign in with Google</button>
          : <a className="btn btn-primary btn-block" href="/auth/google">Sign in with Google</a>}
      </div>
    </main>
  )
}
