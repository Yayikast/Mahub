import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { classLabel, fmtDate, useLoad } from '../useLoad.js'
import { Bones, useAnnounce } from './MyAttendance.jsx'

const greeting = (h) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

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

const count = (groups) => groups.reduce((n, [, list]) => n + list.length, 0)
const byClass = (a, b) => a.course_code.localeCompare(b.course_code) || a.section_no - b.section_no
const SEARCH_FROM = 7 // a search box only once there are more classes than fit at a glance

// /instructor: greeting band (Asana's Home + Partiful's "You have 4 upcoming events") over one card per
// section of the current term (Google Classroom's class cards, our teal class banner as the head).
// Other terms sit behind This term / Upcoming / Past (Moodle's course overview, Canvas's past enrollments):
// classes move there on their own when the term changes, no manual archive.
export default function MySections() {
  const { user } = useAuth()
  const { data, error } = useLoad('/api/my/sections')
  const [query, setQuery] = useState('')
  const [view, setView] = useState('now')
  const heading = useAnnounce('My classes')

  const terms = [...new Set((data ?? []).map((s) => s.term))].sort().reverse() // '2026-1' sorts as text, newest first
  // Check-ins only for the two newest terms: past rows don't show them, and this keeps the calls few.
  const recent = (data ?? []).filter((s) => terms.slice(0, 2).includes(s.term))
  const sessions = useSessions(data && recent)
  const loaded = !!data && recent.every((s) => s.id in sessions)
  // Current = the newest term that has had a check-in, so next term's sections (made early by the admin)
  // don't hide the one still being taught. No check-ins anywhere yet: the newest term.
  const current = terms.slice(0, 2).find((t) => recent.some((s) => s.term === t && sessions[s.id]?.length)) ?? terms[0]
  const openOf = (s) => sessions[s.id]?.find((x) => !x.closed_at)
  const live = recent.map((s) => ({ s, open: openOf(s) })).filter((x) => x.open)

  const q = query.trim().toLowerCase()
  const match = (s) => !q || `${s.course_code} ${s.course_name} section ${s.section_no} ${s.term}`.toLowerCase().includes(q)
  const mine = (data ?? []).filter((s) => s.term === current)
  // Each course this term gets its own colour (5 tones) and pattern, in code order, so up to 5 courses never
  // share a look (Google Classroom / Canvas course colours). Sections of one course share it. Teal stays for actions.
  const codes = [...new Set(mine.map((s) => s.course_code))].sort()
  const cards = mine.filter(match).sort((a, b) => !!openOf(b) - !!openOf(a) || byClass(a, b)) // checking in first
  const group = (keep) => terms.filter(keep)
    .map((t) => [t, data.filter((s) => s.term === t && match(s)).sort(byClass)])
    .filter(([, list]) => list.length)
  const upcoming = group((t) => t > current).reverse() // soonest first
  const past = group((t) => t < current)
  // Tabs only when there is another term; counts follow the search, so a match elsewhere shows up in its tab.
  const tabs = [['now', 'This term', cards.length], ['upcoming', 'Upcoming', count(upcoming)], ['past', 'Past', count(past)]]
    .filter(([v]) => v === 'now' || terms.some((t) => (v === 'past' ? t < current : t > current)))
  const shown = tabs.some(([v]) => v === view) ? view : 'now'
  const now = new Date()

  return (
    <>
      <section className="home-band class-banner" aria-labelledby="home-title">
        <h1 className="heading" id="home-title" ref={heading} tabIndex={-1}>{greeting(now.getHours())}, {user.full_name}</h1>
        <p className="sub">
          {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          {loaded && mine.length > 0 && <> · <span className="nowrap">{mine.length} {mine.length === 1 ? 'class' : 'classes'} this term</span></>}
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
        <h2 className="subheading">My classes{loaded && current && shown === 'now' && <span className="home-term"> · Term {current}</span>}</h2>
        {loaded && (tabs.length > 1 || data.length >= SEARCH_FROM) && (
          <div className="home-tools">
            {tabs.length > 1 && (
              <div className="filters" role="group" aria-label="Show">
                {tabs.map(([v, label, n]) => (
                  <button key={v} type="button" aria-pressed={shown === v} onClick={() => setView(v)}>{label} <span className="num">{n}</span></button>
                ))}
              </div>
            )}
            {data.length >= SEARCH_FROM && (
              <label className="search">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Find a class</span>
                <input type="search" placeholder="Course code, name or term" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            )}
          </div>
        )}
      </div>
      {error && !data && <p className="banner banner-error" role="alert">Couldn't load your classes. Refresh to try again.</p>}
      {(!data || !loaded) && !error && <><Bones /><p className="sr-only" role="status">Loading your classes</p></>}
      {data?.length === 0 && <p className="card empty">You don't teach any classes yet. Ask your admin to assign you one.</p>}
      {q && <p className="sr-only" role="status">{cards.length + count(past) + count(upcoming)} classes match</p>}
      {loaded && q && !cards.length && !past.length && !upcoming.length && <p className="card empty">No classes match “{query.trim()}”.</p>}
      {loaded && shown === 'now' && cards.length > 0 && (
        <ul className="class-cards">
          {cards.map((s) => <ClassCard key={s.id} s={s} list={sessions[s.id]} look={codes.indexOf(s.course_code)} />)}
        </ul>
      )}
      {loaded && q && !tabs.find(([v]) => v === shown)[2] && (past.length > 0 || upcoming.length > 0 || cards.length > 0) && (
        <p className="card empty">No matches here. The counts above show where they are.</p>
      )}
      {loaded && shown === 'upcoming' && <TermRows groups={upcoming} />}
      {loaded && shown === 'past' && <TermRows groups={past} />}
    </>
  )
}

// Upcoming and past terms: the admin Courses table's frame, with the term cell spanning its classes.
function TermRows({ groups }) {
  if (!groups.length) return null
  return (
    <div className="card table-scroll">
      <table className="table course-table term-table">
        <thead>
          <tr>
            <th scope="col">Term</th>
            <th scope="col">Course</th>
            <th scope="col" className="r">Section</th>
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        {groups.map(([t, list]) => (
          <tbody key={t}>
            {list.map((s, i) => (
              <tr key={s.id}>
                {i === 0 && <th scope="rowgroup" rowSpan={list.length} className="course-cell">{t}</th>}
                <td>
                  <span className="cell-2">
                    <Link className="cell-link" to={`/instructor/sections/${s.id}`}>{s.course_code}<span className="sr-only"> section {s.section_no}, term {t}</span></Link>
                    <span>{s.course_name}</span>
                  </span>
                </td>
                <td className="num r">{s.section_no}</td>
                <td className="r" aria-hidden="true"><ArrowRight size={16} /></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function ClassCard({ s, list, look }) {
  const open = list?.find((x) => !x.closed_at)
  const last = list?.find((x) => x.closed_at) // newest first
  return (
    <li>
      {/* The whole card is one link: one tab stop, and the line it reads out says where it goes. */}
      <Link className="card class-card" to={open ? `/session/${open.id}` : `/instructor/sections/${s.id}`}>
        <span className="class-card-head" data-tone={look % 5} data-motif={look % 3}>
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
