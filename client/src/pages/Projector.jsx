import { useParams } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function Projector() {
  const { id } = useParams()
  return <Placeholder title={`Projector ${id}`} />
}
