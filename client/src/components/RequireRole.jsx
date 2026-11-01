import { Navigate } from 'react-router-dom'
import { HOME, useAuth } from '../auth.jsx'

// Wraps a page: signed out -> sign-in page; wrong role -> that person's own home.
// (The server checks roles too. This only saves people from seeing a page that would fail.)
export default function RequireRole({ role, children }) {
  const { user } = useAuth()
  // The sign-in check is one quick request: a blank beat (announced to screen readers) instead of unstyled text.
  if (user === undefined) return <p className="sr-only" role="status">Loading</p>
  if (!user) return <Navigate to="/" replace />
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />
  return children
}
