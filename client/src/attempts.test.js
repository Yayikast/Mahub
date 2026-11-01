import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failures } from './attempts.js'

test('failures: latest reason per unmarked student, with a try count', () => {
  const students = [{ student_id: 1, status: 'absent' }, { student_id: 2, status: 'present' }, { student_id: 3, status: 'absent' }]
  const attempts = [ // newest first, like the API
    { id: 5, user_id: 1, outcome: 'too_far', distance_m: 1240 },
    { id: 4, user_id: 2, outcome: 'expired' }, // later got a mark: resolved
    { id: 3, user_id: 1, outcome: 'expired', distance_m: null },
    { id: 2, user_id: 3, outcome: 'ok' }, // a success row doesn't count as a failure
  ]
  const { stuck, tries } = failures(attempts, students)
  assert.deepEqual(stuck.map((a) => [a.user_id, a.outcome, a.n]), [[1, 'too_far', 2]])
  assert.deepEqual(tries, { 1: 'Off campus, 1240 m away' })
  assert.deepEqual(failures(undefined, students), { stuck: [], tries: {} })
})
