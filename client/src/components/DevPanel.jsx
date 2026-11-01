import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { configure, resetDb, simulateCheckins } from '../mock/server.js'
import { db } from '../mock/db.js'

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
    <details style={{ position: 'fixed', right: 8, bottom: 8, background: '#fff', border: '1px solid #888', padding: 8, fontSize: 13, zIndex: 99 }}>
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
