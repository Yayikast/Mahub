import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

// Shared top bar. <Outlet /> is where React Router puts whichever page matches the URL.
export default function Shell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <header>
        <strong>Mahub</strong>
        {user && (
          <span>
            {' '}
            {user.full_name} ({user.role}){' '}
            <button onClick={async () => { await signOut(); navigate('/') }}>Sign out</button>
          </span>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
