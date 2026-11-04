import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api.js'

// The check-in QR. A new code every 5 s (server/lib/qr.js; an old one still scans ~5 s more), so we fetch the next one right when the current one expires
// (docs/API.md: GET /api/sessions/:id/qr). A thin bar under it runs down to the next code.
// `onClosed` runs when the server says the session has ended (409).
export default function LiveQr({ sessionId, onClosed }) {
  const [qr, setQr] = useState(null) // { src, left, key }
  const [stale, setStale] = useState(false) // the shown code expired and the next one hasn't arrived

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
        setStale(false)
        timer = setTimeout(next, left + 250)
      } catch (e) {
        if (!alive) return
        if (e.status === 409) return onClosed?.()
        setStale(true) // we only fetch once the code has expired, so it must not stay scannable
        timer = setTimeout(next, 2000) // a network blip: try again soon
      }
    }
    next()
    return () => { alive = false; clearTimeout(timer) }
  }, [sessionId]) // not onClosed: it's a new function every render and would restart the loop

  return (
    <div className="qr">
      {qr && !stale ? <img src={qr.src} alt="Check-in QR code" /> : <div className="qr-wait" role="img" aria-label={stale ? 'QR code expired' : 'Loading QR code'} />}
      <div className="qr-timer" aria-hidden="true">
        {qr && !stale && <span key={qr.key} style={{ animationDuration: `${qr.left}ms` }} />}
      </div>
      <p className="qr-note" role="status">{stale && "Lost connection. A new code shows when it's back."}</p>
    </div>
  )
}
