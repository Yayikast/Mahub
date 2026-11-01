import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Mock mode only. In real life the browser asks Express for /scan and gets a redirect. Here there
// is no Express, so this page makes the same request to the mock and follows the redirect itself.
export default function Scan() {
  const { search } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (import.meta.env.VITE_MOCK !== '1') return
    import('../mock/server.js')
      .then((m) => m.mockFetch(`/scan${search}`))
      .then((res) => navigate(res.headers.get('Location'), { replace: true }))
  }, [search, navigate])

  return <p>Checking the QR code…</p>
}
