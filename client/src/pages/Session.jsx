import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, EyeOff, LoaderCircle, Users } from 'lucide-react'
import { api } from '../api.js'
import { classLabel, fmtTime, useLoad } from '../useLoad.js'
import LiveQr from '../components/LiveQr.jsx'
import Roster, { useMarking } from '../components/Roster.jsx'
import { useAnnounce } from './MyAttendance.jsx'
import StatusPill from '../components/StatusPill.jsx'

// Failed attempt outcomes in plain words (docs/API.md, GET /api/sessions/:id/attempts).
const OUTCOME = {
  expired: 'QR expired', not_enrolled: 'Not enrolled', closed: 'Session closed',
  duplicate: 'Already checked in', too_far: 'Off campus', low_accuracy: 'Location too rough',
}

// /session/:id: the instructor's laptop during check-in. The laptop is usually mirrored to the projector,
// so by default it shows only what /projector shows (QR, count). Names, failures and distances wait behind "Show roster".
export default function Session() {
  const { id } = useParams()
  const navigate = useNavigate()
  const roster = useLoad(`/api/sessions/${id}/roster`, 3000)
  const attempts = useLoad(`/api/sessions/${id}/attempts`, 3000)
  const { saving, error: markError, mark } = useMarking(id, roster.reload)
  const [showRoster, setShowRoster] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState('')
  const confirm = useRef(null)
  const toSummary = () => navigate(`/summary/${id}`, { replace: true })

  const r = roster.data
  useAnnounce(r && `Live check-in, ${classLabel(r.section)}`)
  // Ended somewhere else (another tab): this page has nothing left to do.
  useEffect(() => { if (r && !r.is_open) toSummary() }, [r?.is_open])

  async function end() {
    setEnding(true)
    setEndError('')
    try {
      await api.post(`/api/sessions/${id}/close`)
    } catch (e) {
      if (e.status !== 409) { setEnding(false); return setEndError(e.message) } // 409 = already closed: fine
    }
    toSummary()
  }

  if (roster.error && !r) {
    const gone = roster.error.status === 403 || roster.error.status === 404
    return <p className="banner banner-error" role="alert">{gone ? "This session doesn't exist or isn't yours." : "Couldn't load this session. Refresh to try again."} <Link to="/instructor">Back to my classes</Link></p>
  }
  if (!r) return <p className="sub">Loading…</p>

  // Only students still without a mark need help: a later success or a hand mark resolves their failures.
  const unmarked = new Set(r.students.filter((s) => s.status === 'absent').map((s) => s.student_id))
  const failed = attempts.data?.filter((a) => a.outcome !== 'ok' && unmarked.has(a.user_id)) ?? []
  const tries = {} // newest first, so the first one seen per student is their latest
  for (const a of failed) tries[a.user_id] ??= OUTCOME[a.outcome] ?? a.outcome
  const stuck = Object.keys(tries).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="heading">Check-in is open</h1>
          <p className="sub">{classLabel(r.section)} · {r.campus.name} campus</p>
        </div>
        <div className="actions">
          <a className="btn btn-secondary btn-md" href={`/projector/${id}`} target="_blank" rel="noreferrer">
            <ExternalLink size={18} aria-hidden="true" />Projector view
          </a>
          <button className="btn btn-secondary btn-md" aria-expanded={showRoster} aria-controls="live" onClick={() => setShowRoster(!showRoster)}>
            {showRoster ? <EyeOff size={18} aria-hidden="true" /> : <Users size={18} aria-hidden="true" />}{showRoster ? 'Hide roster' : 'Show roster'}
          </button>
          <button className="btn btn-primary btn-md" onClick={() => confirm.current.showModal()}>End session</button>
        </div>
      </div>
      {roster.error && <p className="banner" role="status">Lost connection to Mahub. The roster below may be out of date; retrying.</p>}
      {markError && <p className="banner banner-error" role="alert">{markError}</p>}

      <div id="live" className={showRoster ? 'live' : 'live live-stage'}>
        <div className="live-side">
          <section className="card qr-card" aria-label="Check-in code">
            <LiveQr sessionId={id} onClosed={toSummary} />
            <div className="qr-stats">
              <p className="count num" aria-live="polite"><strong>{r.counts.present}</strong> / {r.counts.total}</p>
              <p className="sub">checked in{r.counts.excused > 0 && `, ${r.counts.excused} excused`}</p>
              {!showRoster && <p className="sub">{stuck > 0 ? `${stuck} couldn't check in yet` : 'Scan with your phone camera'}</p>}
            </div>
          </section>

          {showRoster && <details className="card attempts">
            <summary>Failed attempts <span className="num">({failed.length})</span></summary>
            {failed.length === 0
              ? <p className="empty">Nobody is stuck. When a check-in fails, it shows here with the reason until the student gets a mark.</p>
              : (
                <ul>
                  {failed.map((a) => (
                    <li key={a.id}>
                      <strong>{a.full_name}</strong>
                      <StatusPill status="failed" label={OUTCOME[a.outcome] ?? a.outcome} />
                      <span className="num">
                        {fmtTime(a.created_at)}
                        {a.distance_m != null && ` · ${a.distance_m} m away`}
                        {a.accuracy_m != null && ` (±${a.accuracy_m} m)`}
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
