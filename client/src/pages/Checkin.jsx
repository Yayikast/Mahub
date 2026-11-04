import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, CalendarCheck, CircleCheck, LoaderCircle, LocateOff, Lock, LogIn, MapPin, MapPinCheck, MapPinOff,
  MapPinX, ScanLine, ShieldCheck, TimerOff, TriangleAlert, UserX, WifiOff,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Outcome, { SCAN_STEPS } from '../components/Outcome.jsx'
import PhoneTop from '../components/PhoneTop.jsx'
import { useAnnounce } from './MyAttendance.jsx'

// Fix-it steps differ by phone, so pick them once. iPadOS reports itself as a Mac with touch.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const ANDROID = /Android/.test(navigator.userAgent)
const RESCAN = 'You may need to scan the code again after changing settings.'
const COME_BACK = ['Come back and tap Try again', 'You may need to scan the code again']

// Settings fixes as 3 "How to fix it" steps, one per real action: [what to do, where to find it].
// The menu path lives in the grey line, so it's there when needed but doesn't add steps.
const PRECISE_STEPS = IOS ? [
  ['Open Settings', 'Privacy & Security → Location Services'],
  ['Turn on Precise Location', 'Under Safari Websites'],
  COME_BACK,
] : ANDROID ? [
  ['Open Settings', 'Apps → Chrome → Permissions'],
  ['Turn on Use precise location', 'Under Location'],
  COME_BACK,
] : null
const ALLOW_STEPS = IOS ? [
  ['Open Settings', 'Privacy & Security → Location Services'],
  ['Choose While Using the App', 'Under Safari Websites'],
  COME_BACK,
] : ANDROID ? [
  ['Tap the icon left of the web address', "In Chrome's address bar"],
  ['Allow Location', 'Under Permissions'],
  ['Tap Try again', 'You may need to scan the code again'],
] : null
// Where precise location lives, as one grey line (for the off-campus fix).
const PRECISE_PATH = IOS ? 'Settings → Privacy & Security → Location Services → Safari Websites'
  : ANDROID ? 'Settings → Apps → Chrome → Permissions → Location' : 'In your browser settings'

// What the student sees for each refusal (reasons from the table in docs/API.md, hints from
// PLAN.md section 7): an icon that draws the problem, `why` it happened, then steps or a line on what to do.
// `retry` = trying again can work without scanning again.
const REFUSALS = {
  expired: { icon: TimerOff, title: 'QR expired', why: 'The code changes every 10 seconds, and this one ran out.', steps: SCAN_STEPS },
  no_scan: { icon: ScanLine, title: 'QR not scanned yet', why: "We couldn't find a recent scan from this phone.", steps: SCAN_STEPS },
  closed: { icon: Lock, title: 'Check-in is closed', why: 'Your instructor has ended this session.', detail: 'Ask your instructor if you should be marked present.' },
  not_enrolled: { icon: UserX, title: 'Not enrolled in this class', why: "This class doesn't list you as a student.", detail: 'If this is wrong, ask your instructor.' },
  too_far: {
    icon: MapPinX,
    title: 'You seem to be off campus',
    why: "Your phone's location is outside the campus area.",
    steps: [
      ['Make sure you are on campus', 'Check-in works only on campus'],
      ['Turn on precise location', PRECISE_PATH],
      COME_BACK,
    ],
    retry: true,
  },
  low_accuracy: {
    icon: LocateOff,
    title: 'Location not precise enough',
    why: "Your phone only shared a rough location, so we can't tell if you're on campus.",
    steps: PRECISE_STEPS,
    detail: !PRECISE_STEPS && 'Turn on precise location for your browser, then try again. ' + RESCAN,
    retry: true,
  },
}
const BLOCKED = {
  icon: MapPinOff,
  title: 'Location is blocked',
  why: "This browser isn't allowed to use your location.",
  steps: ALLOW_STEPS,
  detail: !ALLOW_STEPS && 'Allow location for this site in your browser settings, then try again. ' + RESCAN,
  retry: true,
}
const NO_LOCATION = { icon: LocateOff, title: "Couldn't read your location", why: "Your phone didn't send a location in time.", detail: 'Make sure location is on, then try again.', retry: true }
const OFFLINE = { icon: WifiOff, title: 'No connection', why: "We couldn't reach Mahub.", detail: 'Move to Wi-Fi or better signal, then try again.', retry: true }
const SIGNED_OUT = { icon: LogIn, title: 'Sign in again', why: 'Your sign-in has run out.', detail: 'Sign in, then scan the code again.', signIn: true }
const UNKNOWN = { icon: TriangleAlert, title: 'Something went wrong', why: 'Mahub had a problem checking you in.', detail: 'Try again. If it keeps happening, tell your instructor.', retry: true }

// Wraps the browser's callback-style location API in a Promise so we can `await` it.
const getPosition = () => new Promise((resolve, reject) =>
  navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    : reject(new Error('no geolocation')))

// Gives up waiting after `ms`. The request itself may still land; a retry then says "already checked in".
const within = (ms, promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { timeout: true })), ms)),
])

const BUSY_LABEL = { locating: 'Finding your location…', sending: 'Checking you in…' }
const SLOW_MS = 6000 // after this, say it's still working and offer Cancel (the whole wait can reach 25 s)

export default function Checkin() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)       // null | 'locating' | 'sending'
  const [outcome, setOutcome] = useState(null) // null = still on the explainer
  const [attempt, setAttempt] = useState(0)    // new number per result, so the result screen re-announces
  const [slow, setSlow] = useState(false)      // true once a wait passes SLOW_MS
  const run = useRef(0)                        // each try gets a number; Cancel bumps it so a late reply is ignored
  const autoStarted = useRef(false)
  const heading = useAnnounce('Share your location to check in')

  // A ref survives re-renders without causing one, so it's the right place for these counters.
  const waiting = !!busy
  useEffect(() => {
    if (!waiting) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(t) // runs when the wait ends, so a quick reply never flips to "slow"
  }, [waiting])

  // Location already allowed: skip the tap and start straight away. The ref stops React's
  // dev-mode double effect from sending two check-ins.
  useEffect(() => {
    if (autoStarted.current) return
    autoStarted.current = true
    navigator.permissions?.query({ name: 'geolocation' })
      .then((p) => { if (p.state === 'granted') checkIn() })
      .catch(() => {}) // older browsers: the student taps the button as before
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => { run.current++; setBusy(null) }
  const finish = (result) => { setBusy(null); setOutcome(result); setAttempt((n) => n + 1) }
  // `info` = class and campus from the response (docs/API.md; hidden if a field is missing)
  const success = (title, time, info) => finish({ ok: true, title, time, info })

  async function checkIn() {
    const mine = ++run.current
    const stale = () => mine !== run.current // cancelled, or a newer try started
    setBusy('locating')
    let coords
    try {
      coords = (await getPosition()).coords
    } catch (e) {
      if (stale()) return
      return finish(e.code === 1 ? BLOCKED : NO_LOCATION) // 1 = PERMISSION_DENIED
    }
    if (stale()) return
    setBusy('sending')
    try {
      const res = await within(10000, api.post('/api/checkin', { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }))
      if (stale()) return
      success('Checked in', new Date(), res)
    } catch (e) {
      if (stale()) return
      // Already checked in is good news for the student, so it gets the green screen too.
      if (e.reason === 'already_checked_in') return success("You're already checked in", null, e.data)
      if (e.timeout || e instanceof TypeError) return finish(OFFLINE) // fetch throws TypeError when offline
      if (e.status === 401) return finish(SIGNED_OUT)
      finish(REFUSALS[e.reason] ?? (e.status === 400 ? NO_LOCATION : UNKNOWN))
    }
  }

  // The bottom-bar button, shared by the explainer and "Try again" so both show the same busy state.
  // A slow wait adds a line saying why, and a way out.
  const busyLabel = busy && (slow ? 'Still checking…' : BUSY_LABEL[busy])
  const button = (label, forward) => (
    <>
      {slow && <p className="bar-note">Weak signal can take up to 20 seconds.</p>}
      <button className="btn btn-primary btn-block" onClick={checkIn} disabled={!!busy} aria-busy={!!busy}>
        {busy && <LoaderCircle size={20} className="spin" aria-hidden="true" />}
        {busy ? busyLabel : label}
        {!busy && forward && <ArrowRight size={20} aria-hidden="true" />}
      </button>
      {slow && <button className="btn btn-secondary btn-block" onClick={cancel}>Cancel</button>}
    </>
  )
  // Screen readers don't reliably read a button's label change, so say the busy step out loud too.
  const status = <p className="sr-only" role="status">{busy ? busyLabel + (slow ? ' Weak signal can take up to 20 seconds.' : '') : ''}</p>

  if (outcome) {
    const { ok, title, icon, why, detail, steps, retry, signIn, time, info } = outcome
    const when = time && time.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    return (
      <>
        <Outcome
          key={attempt}
          ok={ok}
          title={title}
          icon={icon}
          // On success the line under the headline names the class, so the receipt stays short.
          why={ok ? info?.course_code && <><strong>{info.course_code} · Section {info.section_no}</strong><span>{info.course_name}</span></> : why}
          steps={steps}
          detail={detail}
          action={retry ? button('Try again')
            : signIn && <button className="btn btn-primary btn-block" onClick={async () => { await signOut(); navigate('/') }}>Sign in</button>}
          // Successes and dead-end failures get a way out; fixable failures keep one action (Try again).
          // After a check-in it opens that class (`section_id`); otherwise the list of classes.
          secondary={(ok || (!retry && !signIn)) && <Link className="btn btn-secondary btn-block" to={ok && info?.section_id ? `/me/classes/${info.section_id}` : '/me'}><CalendarCheck size={20} aria-hidden="true" />See my attendance</Link>}
        >
          {ok && (
            // A receipt: proof of who checked in and when.
            <dl className="receipt">
              {info?.campus && <div><dt>Campus</dt><dd>{info.campus.name}</dd></div>}
              <div><dt>Student</dt><dd>{user?.full_name}</dd></div>
              {when && <div><dt>Time</dt><dd className="num">{when}</dd></div>}
              {/* "Already checked in" could be an Excused mark, so only a fresh check-in claims Present */}
              {when && <div><dt>Status</dt><dd><span className="pill pill-present"><CircleCheck size={16} aria-hidden="true" />Present</span></dd></div>}
            </dl>
          )}
        </Outcome>
        {status}
      </>
    )
  }

  return (
    <main className="phone">
      <PhoneTop />
      <div className="phone-body">
        <div className="icon-circle"><MapPin size={36} strokeWidth={2} aria-hidden="true" /></div>
        <h1 className="question" ref={heading} tabIndex={-1}>Share your location to check in</h1>
        <ul className="rows">
          <li><span className="icon-circle icon-circle-sm"><MapPinCheck size={20} aria-hidden="true" /></span>
            <span><strong>Confirms you're on campus</strong><span>Rangsit or Bangkadi campus</span></span></li>
          <li><span className="icon-circle icon-circle-sm"><ShieldCheck size={20} aria-hidden="true" /></span>
            <span><strong>Your position is never saved</strong><span>We keep only how far you are from campus</span></span></li>
        </ul>
        <p className="help"><Link to="/privacy">How Mahub uses your data</Link></p>
      </div>
      <div className="phone-bar">{button('Share my location', true)}</div>
      {status}
    </main>
  )
}
