import { Link } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function NotFound() {
  return <Placeholder title="Page not found"><p><Link to="/">Go home</Link></p></Placeholder>
}
