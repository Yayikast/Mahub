import { useParams } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function MyClass() {
  const { id } = useParams()
  return <Placeholder title={`My class ${id}`} />
}
