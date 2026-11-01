import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Download, LoaderCircle, Pencil } from 'lucide-react'
import { classLabel, fmtDate, fmtTime, useLoad } from '../useLoad.js'
import Roster, { useMarking } from '../components/Roster.jsx'
import { exportSession, useDownload } from '../exports.js'
import { useAnnounce } from './MyAttendance.jsx'

// /summary/:id: the roster after the session ended (same route as the live page, docs/API.md).
// Read only until "Edit marks": an excuse often arrives after class, and the API still takes marks then.
export default function Summary() {
  const { id } = useParams()
  const { data: r, error, reload } = useLoad(`/api/sessions/${id}/roster`)
  const [editing, setEditing] = useState(false)
  const marking = useMarking(id, reload)
  const dl = useDownload()
  useAnnounce(r && `Check-in summary, ${classLabel(r.section)}`)

  if (error && !r) {
    const gone = error.status === 403 || error.status === 404
    return <p className="banner banner-error" role="alert">{gone ? "This session doesn't exist or isn't yours." : "Couldn't load the summary. Refresh to try again."} <Link to="/instructor">Back to my classes</Link></p>
  }
  if (!r) return <p className="sub">Loading…</p>

  const { present, excused, absent, total } = r.counts
  const when = r.opened_at && `${fmtDate(r.opened_at)} · ${fmtTime(r.opened_at)}${r.closed_at ? `–${fmtTime(r.closed_at)}` : ''}`
  return (
    <>
      <Link className="back" to={`/instructor/sections/${r.section.id}`}><ArrowLeft size={16} aria-hidden="true" />{classLabel(r.section)}</Link>
      <div className="page-head">
        <div>
          <h1 className="heading">Check-in summary</h1>
          <p className="sub">{[classLabel(r.section), when, `${r.campus.name} campus`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="actions">
          {!r.is_open && (
            <button className="btn btn-secondary btn-md" aria-pressed={editing} onClick={() => setEditing(!editing)}>
              <Pencil size={18} aria-hidden="true" />{editing ? 'Done editing' : 'Edit marks'}
            </button>
          )}
          <button className="btn btn-secondary btn-md" onClick={() => dl.run('session', () => exportSession(id, r.opened_at))} disabled={!!dl.busy} aria-busy={!!dl.busy}>
            {dl.busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}Export CSV
          </button>
        </div>
      </div>
      {dl.error && <p className="banner banner-error" role="alert">{dl.error}</p>}
      {marking.error && <p className="banner banner-error" role="alert">{marking.error}</p>}
      {r.is_open && (
        <p className="banner" role="status">
          This check-in is still open, so these numbers can change. <Link to={`/session/${id}`}>Go to live page<ArrowRight size={16} aria-hidden="true" /></Link>
        </p>
      )}
      {editing && <p className="banner" role="status">Changes save as you click. Students see them on their attendance page.</p>}
      <p className="tally num" aria-live="polite">
        <strong>{present}</strong> of {total} present · <strong>{excused}</strong> excused · <strong>{absent}</strong> absent
      </p>
      <Roster roster={r} onMark={editing ? marking.mark : undefined} saving={marking.saving} />
    </>
  )
}
