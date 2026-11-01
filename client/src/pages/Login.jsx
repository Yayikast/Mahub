import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, MOCK } from '../api.js'
import { HOME, useAuth } from '../auth.jsx'

export default function Login() {
  const { user, signInAs } = useAuth()
  const navigate = useNavigate()
  const [devUsers, setDevUsers] = useState([])
  const [error, setError] = useState('')

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

  const by = (role) => devUsers.filter((u) => u.role === role)

  return (
    <section>
      <h1>Sign in</h1>
      {MOCK
        ? <p><button disabled>Sign in with Google (not available in mock mode)</button></p>
        : <p><a href="/auth/google">Sign in with Google</a></p>}
      {error && <p role="alert">{error}</p>}
      {devUsers.length > 0 && (
        <>
          <h2>Dev login</h2>
          {['admin', 'instructor', 'student'].map((role) => (
            <details key={role} open={role !== 'student'}>
              <summary>{role}s ({by(role).length})</summary>
              {by(role).map((u) => (
                <button key={u.id} onClick={() => pick(u.id)}>{u.full_name}</button>
              ))}
            </details>
          ))}
        </>
      )}
    </section>
  )
}
