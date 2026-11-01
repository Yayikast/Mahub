import { CircleCheck, CircleMinus, CircleX, FileCheck } from 'lucide-react'

// Status is never colour alone (DESIGN.md): every pill is an icon plus a word.
const PILLS = {
  present: [CircleCheck, 'Present'],
  excused: [FileCheck, 'Excused'],
  absent: [CircleMinus, 'Absent'],
  failed: [CircleX, 'Failed'],
}

export default function StatusPill({ status, label }) {
  const [Icon, word] = PILLS[status]
  return <span className={`pill pill-${status}`}><Icon size={16} aria-hidden="true" />{label ?? word}</span>
}
