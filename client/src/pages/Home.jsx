import Placeholder from '../components/Placeholder.jsx'
import { useAuth } from '../auth.jsx'

// Used for /admin, /instructor and /me until their real screens exist.
export default function Home({ title }) {
  const { user } = useAuth()
  return <Placeholder title={title}><p>Hello, {user.full_name} ({user.role})</p></Placeholder>
}
