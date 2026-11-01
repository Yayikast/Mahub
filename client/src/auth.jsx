import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

export const HOME = { admin: '/admin', instructor: '/instructor', student: '/me' }

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// user === undefined  -> still asking the server (show nothing yet)
// user === null       -> signed out
// user === { id, full_name, email, role }
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  // useEffect with [] runs once, after the first render: ask "who am I?" when the app loads.
  useEffect(() => {
    api.get('/api/me')
      .then(setUser)
      .catch(() => setUser(null)) // 401 means signed out; anything else, show the sign-in page too
  }, [])

  const signInAs = async (userId) => setUser(await api.post('/auth/dev-login', { user_id: userId }))
  const signOut = async () => { await api.post('/auth/logout').catch(() => {}); setUser(null) }

  return <AuthContext.Provider value={{ user, signInAs, signOut }}>{children}</AuthContext.Provider>
}
