import { useParams } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function Session() {
  const { id } = useParams()
  return <Placeholder title={`Live session ${id}`} />
}
