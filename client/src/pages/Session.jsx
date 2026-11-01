import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, EyeOff, LoaderCircle, Search, Users } from 'lucide-react'
import { api } from '../api.js'
import { classLabel, fmtTime, useLoad } from '../useLoad.js'
import LiveQr from '../components/LiveQr.jsx'
import Roster, { useMarking } from '../components/Roster.jsx'
import { OUTCOME, failures } from '../attempts.js'
import { Bones, useAnnounce } from './MyAttendance.jsx'
import StatusPill from '../components/StatusPill.jsx'

// /session/:id: the instructor's laptop during check-in. The laptop is usually mirrored to the projector,
// so by default it shows only what /projector shows (QR, count). Names, failures and distances wait behind "Show roster".
export default function Session() {
  const { id } = useParams()
  const navigate = useNavigate()
  const roster = useLoad(`/api/sessions/${id}/roster`, 3000)
  const attempts = useLoad(`/api/sessions/${id}/attempts`, 3000)
  const { saving, error: markError, mark } = useMarking(id, roster.reload)
  const [showRoster, setShowRoster] = useState(false)
  const [pick, setPick] = useState('') // "Mark a student" while the roster is hidden
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState('')
  const confirm = useRef(null)
  const toSummary = () => navigate(`/summary/${id}`, { replace: true })

  const r = roster.data
  useAnnounce(r && `Live check-in, ${classLabel(r.section)}`)
  // Ended somewhere else (another tab): this page has nothing left to do.
  useEffect(() => { if (r && !r.is_open) toSummary() }, [r?.is_open])
  // R hides or shows the names in one keystroke, unless the instructor is typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, dialog')) return
      setShowRoster((v) => !v)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  async function end() {
    setEnding(true)
    setEndError('')
    try {
      await api.post(`/api/sessions/${id}/close`)
    } catch (e) {
      if (e.status !== 409) { setEnding(false); return setEndError("Couldn't end the session. Check your connection and try again.") } // 409 = already closed: fine
    }
    toSummary()
  }

  if (roster.error && !r) {
    const gone = roster.error.status === 403 || roster.error.status === 404
    return <p className="banner banner-error" role="alert">{gone ? "This session doesn't exist or isn't yours." : "Couldn't load this session. Refresh to try again."} <Link to="/instructor">Back to my classes</Link></p>
  }
  if (!r) return <><Bones /><p className="sr-only" role="status">Loading the session</p></>

  const { stuck, tries } = failures(attempts.data, r.students)

  return (
    <>
      {/* Leaving doesn't end check-in: the class page shows it as open, with a link back here. */}
      <Link className="back" to={`/instructor/sections/${r.section.id}`}><ArrowLeft size={16} aria-hidden="true" />{classLabel(r.section)}</Link>
      <div className="page-head">
        <div>
          <h1 className="heading">Check-in is open</h1>
          <p className="sub">{r.campus.name} campus</p>
        </div>
        <div className="actions">
          <a className="btn btn-secondary btn-md" href={`/projector/${id}`} target="_blank" rel="noreferrer">
            <ExternalLink size={18} aria-hidden="true" />Projector view
          </a>
          <button className="btn btn-secondary btn-md" aria-expanded={showRoster} aria-controls="live" aria-keyshortcuts="R" onClick={() => setShowRoster(!showRoster)}>
            {showRoster ? <EyeOff size={18} aria-hidden="true" /> : <Users size={18} aria-hidden="true" />}{showRoster ? 'Hide roster' : 'Show roster'}<kbd aria-hidden="true">R</kbd>
          </button>
          <button className="btn btn-primary btn-md" onClick={() => confirm.current.showModal()}>End session</button>
        </div>
      </div>
      {roster.error && <p className="banner" role="status">Lost connection to Mahub. The count may be out of date; retrying.</p>}
      {markError && <p className="banner banner-error" role="alert">{markError}</p>}

      <div id="live" className={showRoster ? 'live' : 'live live-stage'}>
        <div className="live-side">
          <section className="card qr-card" aria-label="Check-in code">
            <LiveQr sessionId={id} onClosed={toSummary} />
            <div className="qr-stats">
              <p className="count num" aria-live="polite"><strong>{r.counts.present}</strong> / {r.counts.total}</p>
              <p className="sub">checked in{r.counts.excused > 0 && `, ${r.counts.excused} excused`}</p>
              {!showRoster && <p className="sub">{stuck.length > 0 ? `${stuck.length} couldn't check in yet` : 'Scan with your phone camera'}</p>}
              {!showRoster && (
                <label className="search stage-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Mark a student</span>
                  <input type="search" placeholder="Mark a student" value={pick} onChange={(e) => setPick(e.target.value)} />
                </label>
              )}
            </div>
          </section>

          {!showRoster && pick.trim() && <Roster roster={r} onMark={mark} saving={saving} tries={tries} pick={pick.trim()} />}

          {showRoster && <details className="card attempts">
            <summary>Couldn't check in <span className="num">({stuck.length})</span></summary>
            {stuck.length === 0
              ? <p className="empty">Nobody is stuck. When a check-in fails, it shows here with the reason until the student gets a mark.</p>
              : (
                <ul>
                  {stuck.map((a) => (
                    <li key={a.id}>
                      <strong>{a.full_name}</strong>
                      <StatusPill status="failed" label={OUTCOME[a.outcome] ?? a.outcome} />
                      <span className="num">
                        {fmtTime(a.created_at)}
                        {a.distance_m != null && ` · ${a.distance_m} m away`}
                        {a.accuracy_m != null && ` (±${a.accuracy_m} m)`}
                        {a.n > 1 && ` · ${a.n} tries`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </details>}
        </div>

        {showRoster && <Roster roster={r} onMark={mark} saving={saving} tries={tries} />}
      </div>

      {/* Native <dialog>: showModal() traps focus, Esc closes it, and focus returns to the button. */}
      <dialog ref={confirm} className="modal" aria-labelledby="end-title">
        <h2 id="end-title" className="subheading">End check-in for this class?</h2>
        <p>
          {r.counts.absent === 0 ? 'Everyone has a mark.' : `${r.counts.absent} student${r.counts.absent === 1 ? '' : 's'} without a check-in will be marked absent.`}
          {' '}The QR code stops working.
        </p>
        {endError && <p className="field-error" role="alert">{endError}</p>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-md" onClick={() => confirm.current.close()} autoFocus>Cancel</button>
          <button className="btn btn-primary btn-md" onClick={end} disabled={ending} aria-busy={ending}>
            {ending && <LoaderCircle size={18} className="spin" aria-hidden="true" />}End session
          </button>
        </div>
      </dialog>
    </>
  )
}
