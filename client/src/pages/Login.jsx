import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, MOCK } from '../api.js'
import { HOME, useAuth } from '../auth.jsx'
import PhoneTop from '../components/PhoneTop.jsx'
import orca from '../assets/orca.svg'
import { useAnnounce } from './MyAttendance.jsx'

const ROLES = [['admin', 'Admins'], ['instructor', 'Instructors'], ['student', 'Students']]

// What a student does, in order (Excalidraw/Arcade: the sign-in page explains the product).
const HOW = [
  ['Scan the QR in class', "Use your phone's camera app"],
  ['Sign in with Google', 'Students use their @g.siit.tu.ac.th account'],
  ['Share your location', 'Only the distance is saved, never where you are'],
]

// Google's G in its own colours, on a white chip so it reads on the teal button (Google's branding rules
// don't allow a recoloured G).
function GoogleG() {
  return (
    <span className="google-chip" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="18" height="18">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    </span>
  )
}

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
          <p className="lede">Use your SIIT Google account.</p>
        </div>
        {MOCK && <p className="help">Google sign-in is off in mock mode. Pick a dev account below.</p>}
        {error && <p className="banner banner-error" role="alert">{error}</p>}
        <section className="how" aria-labelledby="how-title">
          <h2 id="how-title" className="subheading">How check-in works</h2>
          <ol className="steps">
            {HOW.map(([what, where]) => (
              <li key={what}><span><strong>{what}</strong><span>{where}</span></span></li>
            ))}
          </ol>
        </section>
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
        {/* SIIT's orca mascot. shortcut: traced from a PNG, not SIIT's official artwork; swap in their vector when we get it. */}
        <div className="orca-peek" aria-hidden="true"><img src={orca} alt="" decoding="async" /></div>
      </div>
      <div className="phone-bar">
        {MOCK
          ? <button className="btn btn-primary btn-block" disabled><GoogleG />Sign in with Google</button>
          : <a className="btn btn-primary btn-block" href="/auth/google"><GoogleG />Sign in with Google</a>}
        <p className="help bar-note"><Link to="/privacy">How Mahub uses your data</Link></p>
        <p className="help bar-note">Orca mascot © SIIT</p>
      </div>
    </main>
  )
}
