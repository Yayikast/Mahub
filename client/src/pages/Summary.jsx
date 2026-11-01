import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Download, LoaderCircle } from 'lucide-react'
import { useLoad } from '../useLoad.js'
import Roster from '../components/Roster.jsx'
import { exportSession, useDownload } from '../exports.js'

// /summary/:id: the roster after the session ended (same route as the live page, docs/API.md). Read only.
export default function Summary() {
  const { id } = useParams()
  const { cls, when, at } = useLocation().state ?? {} // from the section page or the live page; missing on a direct load
  const { data: r, error } = useLoad(`/api/sessions/${id}/roster`)
  const dl = useDownload()

  if (error) {
    const gone = error.status === 403 || error.status === 404
    return <p className="banner banner-error" role="alert">{gone ? "This session doesn't exist or isn't yours." : "Couldn't load the summary. Refresh to try again."} <Link to="/instructor">Back to my classes</Link></p>
  }
  if (!r) return <p className="sub">Loading…</p>

  const { present, excused, absent, total } = r.counts
  return (
    <>
      <Link className="back" to="/instructor"><ArrowLeft size={16} aria-hidden="true" />My classes</Link>
      <div className="page-head">
        <div>
          <h1 className="heading">Check-in summary</h1>
          <p className="sub">{[cls, when, `${r.campus.name} campus`].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="btn btn-secondary btn-md" onClick={() => dl.run('session', () => exportSession(id, { cls, at }))} disabled={!!dl.busy} aria-busy={!!dl.busy}>
          {dl.busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}Export CSV
        </button>
      </div>
      {dl.error && <p className="banner banner-error" role="alert">{dl.error}</p>}
      {r.is_open && (
        <p className="banner" role="status">
          This check-in is still open, so these numbers can change. <Link to={`/session/${id}`}>Go to live page<ArrowRight size={16} aria-hidden="true" /></Link>
        </p>
      )}
      <p className="tally num">
        <strong>{present}</strong> of {total} present · <strong>{excused}</strong> excused · <strong>{absent}</strong> absent
      </p>
      <Roster roster={r} />
    </>
  )
}
