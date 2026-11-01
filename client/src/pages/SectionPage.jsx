import { useParams } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function SectionPage() {
  const { id } = useParams()
  return <Placeholder title={`Section ${id}`} />
}
