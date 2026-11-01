import { useParams } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function Summary() {
  const { id } = useParams()
  return <Placeholder title={`Summary ${id}`} />
}
