import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import Logo from './Logo.jsx'

// Shared top bar for the desktop pages. <Outlet /> is where React Router puts whichever page matches the URL.
// children: lets a page outside the router's Shell route (like /privacy) use the same frame.
export default function Shell({ children }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        {user && (
          <span className="who">
            <span className="avatar" aria-hidden="true">{user.full_name.replace(/^Dr\.\s*/, '')[0]}</span>
            <span><strong>{user.full_name}</strong> <span className="role">{user.role}</span></span>
            <button className="btn btn-secondary btn-md" onClick={async () => { await signOut(); navigate('/') }}>Sign out</button>
          </span>
        )}
      </header>
      <main className="page">
        {children ?? <Outlet />}
      </main>
      {/* One quiet line: who made it and where to report a problem. Not on phone screens or the projector. */}
      <footer className="footer">
        <span>© 2026 <strong>mahub</strong> team</span>
        <nav aria-label="Footer">
          <Link to="/privacy">Privacy</Link>
          <a href="https://github.com/Yayikast/Mahub/issues/new" target="_blank" rel="noreferrer">Report a problem<span className="sr-only"> (opens GitHub)</span></a>
          <a href="https://github.com/Yayikast/Mahub" target="_blank" rel="noreferrer">GitHub<span className="sr-only"> (opens in a new tab)</span></a>
        </nav>
      </footer>
    </div>
  )
}
