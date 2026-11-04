import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleCheck, Download, LoaderCircle, Upload } from 'lucide-react'
import { classLabel, fmtDate, fmtTime, fmtTimes, useLoad } from '../useLoad.js'
import { Bones, useAnnounce } from './MyAttendance.jsx'
import { exportSection, exportSession, useDownload } from '../exports.js'
import ImportDialog, { ENROLL } from '../components/ImportDialog.jsx'
import StartCheckin from '../components/StartCheckin.jsx'

// /instructor/sections/:id: start a check-in (campus picker) and the list of past check-ins.
export default function SectionPage() {
  const { id } = useParams()
  const sections = useLoad('/api/my/sections') // there's no single-section route, so find it in my list
  const sessions = useLoad(`/api/sections/${id}/sessions`)
  const students = useLoad(`/api/sections/${id}/enrollments`) // read only for instructors
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState('')
  const dl = useDownload()

  const section = sections.data?.find((s) => s.id === Number(id))
  const open = sessions.data?.find((s) => !s.closed_at)
  // The open one is in the panel above; its counts aren't final, so it isn't a past check-in yet.
  const past = sessions.data?.filter((s) => s.closed_at)
  useAnnounce(section && classLabel(section))

  if (sessions.error?.status === 403 || sessions.error?.status === 404 || (sections.data && !section)) {
    return <p className="banner banner-error" role="alert">This class doesn't exist or isn't yours. <Link to="/instructor">Back to my classes</Link></p>
  }

  return (
    <>
      <Link className="back" to="/instructor"><ArrowLeft size={16} aria-hidden="true" />My classes</Link>
      <div className="page-head class-banner">
        <div>
          <h1 className="heading">{section ? `${section.course_code} · Section ${section.section_no}` : 'Section'}</h1>
          {section && <p className="sub">{section.course_name} · Term {section.term}</p>}
        </div>
      </div>

      {!sessions.data && !sessions.error && <><Bones /><p className="sr-only" role="status">Loading this class</p></>}
      {open ? (
        <section className="card panel panel-row panel-live">
          <div className="cell-2">
            <h2 className="subheading">Check-in is open</h2>
            <span>Started {fmtTime(open.opened_at)} · {open.present_count} of {open.enrolled_count} checked in</span>
          </div>
          <Link className="btn btn-primary btn-md" to={`/session/${open.id}`}>Go to live page<ArrowRight size={18} aria-hidden="true" /></Link>
        </section>
      ) : sessions.data && (
        <section className="card panel" aria-labelledby="start-title">
          <h2 className="subheading" id="start-title">Start check-in</h2>
          <StartCheckin sectionId={id} onConflict={sessions.reload} />
        </section>
      )}

      <div className="section-title section-head">
        <h2 className="subheading">Past check-ins</h2>
        {past?.length > 0 && section && (
          <button className="btn btn-secondary btn-md" onClick={() => dl.run('all', () => exportSection(section, past))} disabled={!!dl.busy} aria-busy={dl.busy === 'all'}>
            {dl.busy === 'all' ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}Export all check-ins
          </button>
        )}
      </div>
      {dl.error && <p className="banner banner-error" role="alert">{dl.error}</p>}
      {past?.length === 0 && <p className="card empty">No check-ins yet. Each one you run shows up here with its attendance.</p>}
      {past?.length > 0 && (
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Time</th>
                <th scope="col" className="r">Present</th>
                <th scope="col" className="r">Excused</th>
                <th scope="col" className="r">Absent</th>
                <th scope="col" className="r">Attended</th>
                <th scope="col"><span className="sr-only">Download</span></th>
              </tr>
            </thead>
            <tbody>
              {past.map((s) => {
                const attended = s.present_count + s.excused_count
                return (
                  <tr key={s.id}>
                    <td><Link className="cell-link" to={`/summary/${s.id}`}>{fmtDate(s.opened_at)}</Link></td>
                    <td className="num">{fmtTimes(s.opened_at, s.closed_at)}</td>
                    <td className="num r">{s.present_count}</td>
                    <td className="num r">{s.excused_count}</td>
                    <td className="num r">{s.enrolled_count - attended}</td>
                    <td className="num r">{s.enrolled_count ? Math.round((attended / s.enrolled_count) * 100) : 0}%</td>
                    <td className="cell-action">
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => dl.run(s.id, () => exportSession(s.id, s.opened_at))}
                        disabled={!!dl.busy} aria-busy={dl.busy === s.id} aria-label={`Download CSV for ${fmtDate(s.opened_at)}, ${fmtTime(s.opened_at)}`}>
                        {dl.busy === s.id ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="section-title section-head">
        <h2 className="subheading">Students</h2>
        <button className="btn btn-secondary btn-md" onClick={() => { setImported(''); setImporting(true) }}><Upload size={18} aria-hidden="true" />Import CSV</button>
      </div>
      <p className="sub import-done" role="status">{imported && <><CircleCheck size={18} aria-hidden="true" />{imported}</>}</p>
      {students.error && <p className="banner banner-error" role="alert">Couldn't load the students. Refresh to try again.</p>}
      {students.data?.length === 0 && <p className="card empty">Nobody is enrolled yet. Import your class list so students can check in.</p>}
      {students.data?.length > 0 && (
        <details className="card attempts">
          <summary>Enrolled <span className="num">{students.data.length}</span></summary>
          <ul>{students.data.map((s) => <li key={s.student_id}><strong>{s.full_name}</strong><span className="num">{s.student_no}</span></li>)}</ul>
        </details>
      )}
      {importing && <ImportDialog kind={ENROLL} path={`/api/sections/${id}/enrollments/import`}
        note="You can add students who already have a Mahub account. Ask your admin to add anyone new."
        onDone={(c) => { students.reload(); sessions.reload(); setImported(ENROLL.toast(c)) }} onClose={() => setImporting(false)} />}

    </>
  )
}
