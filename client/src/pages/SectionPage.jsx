import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleCheck, LoaderCircle, Radio } from 'lucide-react'
import { api } from '../api.js'
import { fmtDate, fmtTime, useLoad } from '../useLoad.js'

// /instructor/sections/:id: start a check-in (campus picker) and the list of past check-ins.
export default function SectionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sections = useLoad('/api/my/sections') // there's no single-section route, so find it in my list
  const sessions = useLoad(`/api/sections/${id}/sessions`)
  const campuses = useLoad('/api/campuses')
  const [campusId, setCampusId] = useState(null) // nothing pre-selected (DESIGN.md)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const section = sections.data?.find((s) => s.id === Number(id))
  const open = sessions.data?.find((s) => !s.closed_at)
  // The session and summary routes don't return the class or date, so we hand them over in router state.
  // A direct load (bookmark, refresh in a new tab) just shows the campus.
  const cls = section && `${section.course_code} · Section ${section.section_no}`

  async function start() {
    setStarting(true)
    setError('')
    try {
      const s = await api.post(`/api/sections/${id}/sessions`, { campus_id: campusId })
      navigate(`/session/${s.id}`, { state: { cls } })
    } catch (e) {
      setStarting(false)
      if (e.status === 409) sessions.reload() // someone opened one meanwhile: the list shows it, with its link
      else setError(e.message)
    }
  }

  if (sessions.error?.status === 403 || sessions.error?.status === 404 || (sections.data && !section)) {
    return <p className="banner banner-error" role="alert">This class doesn't exist or isn't yours. <Link to="/instructor">Back to my classes</Link></p>
  }

  return (
    <>
      <Link className="back" to="/instructor"><ArrowLeft size={16} aria-hidden="true" />My classes</Link>
      <div className="page-head">
        <div>
          <h1 className="heading">{section ? `${section.course_code} · Section ${section.section_no}` : 'Section'}</h1>
          {section && <p className="sub">{section.course_name} · Term {section.term}</p>}
        </div>
      </div>

      {open ? (
        <section className="card panel panel-row">
          <span className="icon-circle icon-circle-sm"><Radio size={20} aria-hidden="true" /></span>
          <div className="cell-2">
            <h2 className="subheading">Check-in is open</h2>
            <span>Started {fmtTime(open.opened_at)} · {open.present_count} of {open.enrolled_count} checked in</span>
          </div>
          <Link className="btn btn-primary btn-md" to={`/session/${open.id}`} state={{ cls }}>Go to live page<ArrowRight size={18} aria-hidden="true" /></Link>
        </section>
      ) : sessions.data && (
        <section className="card panel" aria-labelledby="start-title">
          <h2 className="subheading" id="start-title">Start check-in</h2>
          <fieldset className="campus-picker">
            <legend className="sub">Which campus are you teaching at?</legend>
            <div className="options">
              {campuses.data?.map((c) => (
                <label key={c.id} className="option">
                  <input type="radio" name="campus" className="sr-only" checked={campusId === c.id} onChange={() => setCampusId(c.id)} />
                  <strong>{c.name}</strong>
                  <span>Students within {c.radius_m} m can check in</span>
                  <CircleCheck size={22} aria-hidden="true" className="option-check" />
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="panel-foot">
            <button className="btn btn-primary btn-md" onClick={start} disabled={!campusId || starting} aria-busy={starting}>
              {starting && <LoaderCircle size={18} className="spin" aria-hidden="true" />}
              {starting ? 'Starting…' : 'Start check-in'}
            </button>
          </div>
        </section>
      )}

      <h2 className="subheading section-title">Past check-ins</h2>
      {sessions.data?.length === 0 && <p className="card empty">No check-ins yet. Each one you run shows up here with its attendance.</p>}
      {sessions.data?.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Time</th>
                <th scope="col" className="r">Present</th>
                <th scope="col" className="r">Excused</th>
                <th scope="col" className="r">Absent</th>
                <th scope="col" className="r">Attended</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.map((s) => {
                const attended = s.present_count + s.excused_count
                return (
                  <tr key={s.id}>
                    <td><Link className="cell-link" to={s.closed_at ? `/summary/${s.id}` : `/session/${s.id}`}
                      state={{ cls, when: `${fmtDate(s.opened_at)} · ${fmtTime(s.opened_at)}${s.closed_at ? `–${fmtTime(s.closed_at)}` : ''}` }}>{fmtDate(s.opened_at)}</Link></td>
                    <td className="num">{fmtTime(s.opened_at)}{s.closed_at ? `–${fmtTime(s.closed_at)}` : ' · open'}</td>
                    <td className="num r">{s.present_count}</td>
                    <td className="num r">{s.excused_count}</td>
                    <td className="num r">{s.enrolled_count - attended}</td>
                    <td className="num r">{s.enrolled_count ? Math.round((attended / s.enrolled_count) * 100) : 0}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
