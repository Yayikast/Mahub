import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

// Shared top bar for the desktop pages. <Outlet /> is where React Router puts whichever page matches the URL.
export default function Shell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">Mahub</span>
        {user && (
          <span className="who">
            <span className="avatar" aria-hidden="true">{user.full_name.replace(/^Dr\.\s*/, '')[0]}</span>
            <span><strong>{user.full_name}</strong> <span className="role">{user.role}</span></span>
            <button className="btn btn-secondary btn-md" onClick={async () => { await signOut(); navigate('/') }}>Sign out</button>
          </span>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
