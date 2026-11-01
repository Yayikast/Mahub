import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api.js'

// The check-in QR. The code lives 10 s, so we fetch the next one right when the current one expires
// (docs/API.md: GET /api/sessions/:id/qr). A thin bar under it runs down to the next code.
// `onClosed` runs when the server says the session has ended (409).
export default function LiveQr({ sessionId, onClosed }) {
  const [qr, setQr] = useState(null) // { src, left, key }

  useEffect(() => {
    let alive = true
    let timer
    async function next() {
      try {
        const { scan_url, expires_at } = await api.get(`/api/sessions/${sessionId}/qr`)
        // margin 4 = the 4-module quiet zone scanners need. Black on white, never inverted.
        const src = await QRCode.toDataURL(scan_url, { margin: 4, width: 800, errorCorrectionLevel: 'M' })
        if (!alive) return
        // Clamped so a laptop clock that's off by a few seconds can't leave an expired code up.
        const left = Math.min(10000, Math.max(1000, Date.parse(expires_at) - Date.now()))
        setQr({ src, left, key: expires_at })
        timer = setTimeout(next, left + 250)
      } catch (e) {
        if (!alive) return
        if (e.status === 409) return onClosed?.()
        timer = setTimeout(next, 2000) // a network blip: try again soon
      }
    }
    next()
    return () => { alive = false; clearTimeout(timer) }
  }, [sessionId]) // not onClosed: it's a new function every render and would restart the loop

  return (
    <div className="qr">
      {qr ? <img src={qr.src} alt="Check-in QR code" /> : <div className="qr-wait" aria-label="Loading QR code" />}
      <div className="qr-timer" aria-hidden="true">
        {qr && <span key={qr.key} style={{ animationDuration: `${qr.left}ms` }} />}
      </div>
    </div>
  )
}
