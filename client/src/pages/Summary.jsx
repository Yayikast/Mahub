import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Download, LoaderCircle, Pencil } from 'lucide-react'
import { classLabel, courseLook, fmtDate, fmtTimes, useLoad } from '../useLoad.js'
import Roster, { useMarking } from '../components/Roster.jsx'
import { failures } from '../attempts.js'
import { exportSession, useDownload } from '../exports.js'
import { Bones, useAnnounce } from './MyAttendance.jsx'

// /summary/:id: the roster after the session ended (same route as the live page, docs/API.md).
// Read only until "Edit marks": an excuse often arrives after class, and the API still takes marks then.
export default function Summary() {
  const { id } = useParams()
  const { data: r, error, reload } = useLoad(`/api/sessions/${id}/roster`)
  const attempts = useLoad(`/api/sessions/${id}/attempts`) // why each absent student couldn't check in
  const mine = useLoad('/api/my/sections') // only for the class's colour on the banner
  const [editing, setEditing] = useState(false)
  const marking = useMarking(id, reload)
  const dl = useDownload()
  useAnnounce(r && `Check-in summary, ${classLabel(r.section)}`)

  if (error && !r) {
    const gone = error.status === 403 || error.status === 404
    return <p className="banner banner-error" role="alert">{gone ? "This session doesn't exist or isn't yours." : "Couldn't load the summary. Refresh to try again."} <Link to="/instructor">Back to my classes</Link></p>
  }
  if (!r) return <><Bones /><p className="sr-only" role="status">Loading the summary</p></>

  const { present, excused, absent, total } = r.counts
  const when = r.opened_at && `${fmtDate(r.opened_at)} · ${fmtTimes(r.opened_at, r.closed_at)}`
  const byHand = r.students.filter((s) => s.method === 'manual').length
  const { tries } = failures(attempts.data, r.students)
  // Present first, then excused, then absent (stable, so names keep their order within each group).
  const rank = { present: 0, excused: 1, absent: 2 }
  const students = [...r.students].sort((a, b) => rank[a.status] - rank[b.status])
  return (
    <>
      <Link className="back" to={`/instructor/sections/${r.section.id}`}><ArrowLeft size={16} aria-hidden="true" />Class page</Link>
      <div className="page-head class-banner" {...courseLook(mine.data, r.section)}>
        <div>
          <h1 className="heading">{classLabel(r.section)}</h1>
          <p className="sub">{[r.is_open ? 'Check-in is open' : 'Check-in ended', when, `${r.campus.name} campus`].filter(Boolean)
            .map((t, i) => <Fragment key={i}>{i > 0 && ' · '}<span className="nowrap">{t}</span></Fragment>)}</p>
          <p className="tally num" aria-live="polite">
            <strong className="nowrap">{present} of {total} present</strong> · <span className="nowrap"><strong>{absent}</strong> absent</span> · <span className="nowrap"><strong>{excused}</strong> excused</span>
            {byHand > 0 && <> · <span className="nowrap"><strong>{byHand}</strong> marked by hand</span></>}
          </p>
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
      <Roster roster={{ ...r, students }} onMark={editing ? marking.mark : undefined} saving={marking.saving} tries={tries} />
    </>
  )
}
