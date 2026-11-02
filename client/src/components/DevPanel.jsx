import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { configure, resetDb, simulateCheckins } from '../mock/server.js'
import { db, nextId, save } from '../mock/db.js'

// Mock mode only. Lets you act as anyone and poke the fake server: slow it down, break it,
// force a check-in refusal, or fake students arriving while you watch the live roster.
export default function DevPanel() {
  const { user, signInAs } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [users, setUsers] = useState([])
  const [note, setNote] = useState('')
  const sessionId = Number(pathname.match(/^\/(?:session|projector)\/(\d+)/)?.[1]) || null

  useEffect(() => { api.get('/auth/dev-users').then(setUsers).catch(() => {}) }, [])

  return (
    <details className="mock-tools" style={{ position: 'fixed', right: 8, bottom: 8, background: '#fff', border: '1px solid #888', padding: 8, fontSize: 13, zIndex: 99 }}>
      <summary>Mock tools</summary>
      <p>
        Act as:{' '}
        <select value={user?.id ?? ''} onChange={async (e) => {
          await signInAs(Number(e.target.value))
          navigate('/')
        }}>
          <option value="" disabled>(signed out)</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.role}</option>)}
        </select>
      </p>
      <p>
        Server delay:{' '}
        <select defaultValue={db.dev.delayMs} onChange={(e) => configure({ delayMs: Number(e.target.value) })}>
          {[0, 150, 800, 3000].map((ms) => <option key={ms} value={ms}>{ms} ms</option>)}
        </select>{' '}
        <button onClick={() => { configure({ failNext: true }); setNote('Next request will fail with 500.') }}>Fail next request</button>
      </p>
      <p>
        Next check-in:{' '}
        <select defaultValue="" onChange={(e) => { configure({ forceCheckin: e.target.value || null }); setNote(e.target.value ? `Next check-in → ${e.target.value}` : '') }}>
          <option value="">(real rules)</option>
          {['too_far', 'low_accuracy', 'expired', 'no_scan', 'closed', 'not_enrolled', 'already_checked_in'].map((r) => <option key={r}>{r}</option>)}
        </select>
      </p>
      {user?.role === 'student' && (
        <p>
          <button onClick={() => {
            // Stands in for pointing the phone at the projector: remembers a fresh scan of an open session you're enrolled in.
            const mine = (s) => db.enrollments.some((e) => e.section_id === s.section_id && e.student_id === user.id)
            let open = db.sessions.find((s) => !s.closed_at && mine(s))
            if (!open) {
              // No class is checking in, so open one (Rangsit) for your first class, as its instructor would.
              const sectionId = db.enrollments.find((e) => e.student_id === user.id)?.section_id
              if (!sectionId) return setNote("You aren't enrolled in any class.")
              open = { id: nextId('session'), section_id: sectionId, campus_id: 1, opened_at: new Date().toISOString(), closed_at: null, code: null, code_expires_at: null }
              db.sessions.push(open)
            }
            db.scan = { session_id: open.id, scanned_at: new Date().toISOString() }
            save()
            location.assign('/checkin') // a full load, so a stuck result screen starts over
          }}>Scan the QR</button>
        </p>
      )}
      {sessionId && (
        <p>
          Session {sessionId}:{' '}
          {[1, 5, 10].map((n) => (
            <button key={n} onClick={() => setNote(`${simulateCheckins(sessionId, n)} student(s) checked in.`)}>+{n} check-in</button>
          ))}
        </p>
      )}
      <p>
        <button onClick={() => { resetDb(); location.assign('/') }}>Reset mock data</button>
      </p>
      {note && <p role="status">{note}</p>}
    </details>
  )
}
