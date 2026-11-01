// Failed attempt outcomes in plain words (docs/API.md, GET /api/sessions/:id/attempts).
export const OUTCOME = {
  expired: 'QR expired', not_enrolled: 'Not enrolled', closed: 'Session closed',
  duplicate: 'Already checked in', too_far: 'Off campus', low_accuracy: 'Location too rough',
}

// Failed attempts that still matter: only students without a mark (a later success or a hand mark resolves them).
// Attempts arrive newest first, so the first one per student is their latest.
// Returns `stuck` (latest failure per student, with `n` tries) and `tries` (student_id -> reason, for roster rows).
export function failures(attempts, students) {
  const unmarked = new Set(students.filter((s) => s.status === 'absent').map((s) => s.student_id))
  const byStudent = new Map()
  for (const a of attempts ?? []) {
    if (a.outcome === 'ok' || !unmarked.has(a.user_id)) continue
    if (byStudent.has(a.user_id)) byStudent.get(a.user_id).n++
    else byStudent.set(a.user_id, { ...a, n: 1 })
  }
  const stuck = [...byStudent.values()]
  const tries = Object.fromEntries(stuck.map((a) => [a.user_id,
    (OUTCOME[a.outcome] ?? a.outcome) + (a.distance_m != null ? `, ${a.distance_m} m away` : '')]))
  return { stuck, tries }
}
