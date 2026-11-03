import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { classLabel, fmtDate, useLoad } from '../useLoad.js'
import { Bones, useAnnounce } from './MyAttendance.jsx'

const greeting = (h) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
// Each course keeps the same band pattern everywhere (dots, QR corners or lines), picked from its code.
const motif = (code) => [...code].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7) % 3

// Every section's check-ins, keyed by section id. No "all my sessions" route, so one call per section
// (an instructor has a handful). A failed call just leaves that card without its last check-in line.
function useSessions(sections) {
  const [byId, setById] = useState({})
  const ids = sections?.map((s) => s.id).join(',')
  useEffect(() => {
    if (!ids) return
    let alive = true
    Promise.all(ids.split(',').map((id) => api.get(`/api/sections/${id}/sessions`).then((list) => [id, list], () => [id, null])))
      .then((pairs) => alive && setById(Object.fromEntries(pairs)))
    return () => { alive = false }
  }, [ids])
  return byId
}

// /instructor: greeting band (Asana's Home + Partiful's "You have 4 upcoming events") over one card per
// section (Google Classroom's class cards, our teal class banner as the head).
export default function MySections() {
  const { user } = useAuth()
  const { data, error } = useLoad('/api/my/sections')
  const sessions = useSessions(data)
  const [term, setTerm] = useState('all')
  const heading = useAnnounce('My classes')

  const terms = [...new Set((data ?? []).map((s) => s.term))].sort().reverse() // newest term first
  const shown = (data ?? []).filter((s) => term === 'all' || s.term === term)
  const live = (data ?? []).map((s) => ({ s, open: sessions[s.id]?.find((x) => !x.closed_at) })).filter((x) => x.open)
  const now = new Date()

  return (
    <>
      <section className="home-band class-banner" aria-labelledby="home-title">
        <h1 className="heading" id="home-title" ref={heading} tabIndex={-1}>{greeting(now.getHours())}, {user.full_name}</h1>
        <p className="sub">
          {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          {data?.length > 0 && <> · <span className="nowrap">{data.length} {data.length === 1 ? 'class' : 'classes'}</span></>}
        </p>
        {live.map(({ s, open }) => (
          <div key={s.id} className="home-live">
            <span className="cell-2">
              <strong>{classLabel(s)} is checking in</strong>
              <span className="num">{open.present_count} of {open.enrolled_count} checked in</span>
            </span>
            <Link className="btn btn-primary btn-md" to={`/session/${open.id}`}>Go to live page<ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        ))}
      </section>

      <div className="page-head home-head">
        <h2 className="subheading">My classes</h2>
        {terms.length > 1 && (
          <div className="filters" role="group" aria-label="Show term">
            {[['all', 'All terms'], ...terms.map((t) => [t, t])].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={term === v} onClick={() => setTerm(v)}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {error && !data && <p className="banner banner-error" role="alert">Couldn't load your classes. Refresh to try again.</p>}
      {!data && !error && <><Bones /><p className="sr-only" role="status">Loading your classes</p></>}
      {data?.length === 0 && <p className="card empty">You don't teach any classes yet. Ask your admin to assign you one.</p>}
      {shown.length > 0 && (
        <ul className="class-cards">
          {shown.map((s) => <ClassCard key={s.id} s={s} list={sessions[s.id]} />)}
        </ul>
      )}
    </>
  )
}

function ClassCard({ s, list }) {
  const open = list?.find((x) => !x.closed_at)
  const last = list?.find((x) => x.closed_at) // newest first
  return (
    <li>
      {/* The whole card is one link: one tab stop, and the line it reads out says where it goes. */}
      <Link className="card class-card" to={open ? `/session/${open.id}` : `/instructor/sections/${s.id}`}>
        <span className="class-card-head" data-motif={motif(s.course_code)}>
          <strong className="class-card-title">{classLabel(s)}</strong>
          <span>{s.course_name}</span>
        </span>
        <span className="class-card-body">
          <span className="class-card-last">
            {list === undefined ? <span className="bone" />
              : open ? <><span className="live-dot" aria-hidden="true" />Checking in now · <span className="num">{open.present_count} of {open.enrolled_count}</span></>
              : last ? <>Last check-in {fmtDate(last.opened_at)} · <span className="num">{last.present_count} of {last.enrolled_count}</span> present</>
              : list ? 'No check-ins yet' : 'Term ' + s.term}
          </span>
          <span className="class-card-go">{open ? 'Go to live page' : 'Start check-in'}<ArrowRight size={18} aria-hidden="true" /></span>
        </span>
      </Link>
    </li>
  )
}
