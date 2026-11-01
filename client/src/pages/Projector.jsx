import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLoad } from '../useLoad.js'
import LiveQr from '../components/LiveQr.jsx'

// /projector/:id: what the class sees. Only the QR, the campus and the count (DESIGN.md), white,
// sized to read from the back of the room. No names: the whole room can see this.
export default function Projector() {
  const { id } = useParams()
  const roster = useLoad(`/api/sessions/${id}/roster`, 3000)
  const [closed, setClosed] = useState(false)
  const r = roster.data
  const isClosed = closed || (r && !r.is_open)

  useEffect(() => { document.title = 'Check-in · Mahub' }, [])

  return (
    <main className="projector">
      {isClosed
        ? <h1 className="projector-closed">Check-in is closed</h1>
        : <div className="projector-qr"><h1 className="sr-only">Check-in is open</h1><LiveQr sessionId={id} onClosed={() => setClosed(true)} /></div>}
      {r && (
        <div className="projector-side">
          <p className="projector-campus">{r.campus.name}</p>
          <p className="projector-count num" aria-live="polite">
            {r.counts.present}<span> / {r.counts.total}</span>
          </p>
          <p className="projector-label">checked in</p>
          {!isClosed && <p className="projector-label projector-hint">Scan with your phone camera</p>}
        </div>
      )}
    </main>
  )
}
