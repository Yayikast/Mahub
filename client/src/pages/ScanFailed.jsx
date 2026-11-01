import { Link } from 'react-router-dom'
import { CalendarCheck, TimerOff } from 'lucide-react'
import Outcome, { SCAN_STEPS } from '../components/Outcome.jsx'

// Where /scan sends a wrong or old code. The only reason today is "expired" (docs/API.md).
export default function ScanFailed() {
  return (
    <Outcome
      title="QR expired"
      icon={TimerOff}
      why="The code changes every 10 seconds, and this one ran out."
      steps={SCAN_STEPS}
      secondary={<Link className="btn btn-secondary btn-block" to="/me"><CalendarCheck size={20} aria-hidden="true" />See my attendance</Link>}
    />
  )
}
