import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import Logo from './Logo.jsx'

// Top row of every phone screen: wordmark, and who is signed in (so a student sees "this is me").
// Tapping the name opens a small account panel with Sign out. It is a disclosure (button + panel),
// not an ARIA menu: one action doesn't need arrow-key menu semantics.
// Detail screens pass `back` (a round back button): like iOS, the bar becomes the navigation and the
// logo + account stay on the main screen (Matter's Archive, Habits' History on Refero).
export default function PhoneTop({ back }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const button = useRef(null)
  const first = user?.full_name?.split(' ')[0]

  // While open: Escape closes and returns focus to the button; a tap or focus outside closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    const onOutside = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
    }
  }, [open])

  if (back) return <header className="phone-top phone-top-nav">{back}</header>

  return (
    <header className="phone-top">
      <Logo />
      {first && (
        <div className="account" ref={wrap}>
          <button ref={button} type="button" className="who who-button" aria-expanded={open} aria-controls="account-panel"
            onClick={() => setOpen((o) => !o)}>
            <span className="avatar" aria-hidden="true">{first[0]}</span>
            {first}
            <span className="sr-only">, account</span>
          </button>
          {open && (
            <div id="account-panel" className="account-panel">
              <p className="account-name"><strong>{user.full_name}</strong><span>{user.email}</span></p>
              <Link className="account-item account-link" to="/privacy">Privacy</Link>
              <button type="button" className="account-item" onClick={async () => { await signOut(); navigate('/') }}>Sign out</button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
