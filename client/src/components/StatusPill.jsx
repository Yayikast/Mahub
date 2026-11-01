import { CircleCheck, CircleMinus, CircleX, Clock, FileCheck } from 'lucide-react'

// Status is never colour alone (DESIGN.md): every pill is an icon plus a word.
const PILLS = {
  present: [CircleCheck, 'Present'],
  excused: [FileCheck, 'Excused'],
  absent: [CircleMinus, 'Absent'],
  failed: [CircleX, 'Failed'],
  open: [Clock, 'In progress'], // a check-in that is still open and has no mark yet
}

export default function StatusPill({ status, label }) {
  const [Icon, word] = PILLS[status]
  return <span className={`pill pill-${status}`}><Icon size={16} aria-hidden="true" />{label ?? word}</span>
}
