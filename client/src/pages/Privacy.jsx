import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import PhoneTop from '../components/PhoneTop.jsx'
import Shell from '../components/Shell.jsx'
import { useAnnounce } from './MyAttendance.jsx'

// /privacy: open to everyone, signed in or not. Students and signed-out visitors get the phone frame
// (linked from sign-in, the check-in explainer and the account panel); instructors and admins get the
// desktop frame (linked from the footer). Facts here must match db/schema.sql.
const UPDATED = '3 November 2026' // change when the wording changes
const TOC = [['account', 'Your account'], ['keep', 'What we keep'], ['location', 'Your location'], ['who', 'Who can see it'],
  ['cookies', 'Cookies'], ['retention', 'How long we keep it'], ['questions', 'Questions or removal']]

export default function Privacy() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const heading = useAnnounce('Privacy')
  // React Router counts in-app history in history.state.idx; with none (opened from a new tab), go home.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))
  const backButton = <button type="button" className="back" onClick={back}><ArrowLeft size={16} aria-hidden="true" />Back</button>
  const intro = (
    <div className="intro">
      <h1 className="result" ref={heading} tabIndex={-1}>Privacy</h1>
      <p className="lede">What Mahub keeps about you, and who can see it.</p>
    </div>
  )

  if (user && user.role !== 'student') {
    return (
      <Shell>
        <div className="privacy-desk">
        <div>
        {backButton}
        <article className="card prose prose-desk">
          <div className="intro">
            <h1 className="result" ref={heading} tabIndex={-1}>Privacy</h1>
            <p className="lede">What Mahub keeps about you, and what it tells students.</p>
          </div>
          <section id="account" aria-labelledby="account-h">
            <h2 id="account-h">Your account</h2>
            <p>For instructors and admins, Mahub keeps only your name, email and role, plus a record of the changes you make (marks, enrollments, imports and accounts) so mistakes can be traced and fixed. You never check in, so we keep no location or attendance for you.</p>
          </section>
          <p className="prose-divider">Below is what students read before they check in.</p>
          <Sections />
        </article>
        </div>
        <aside className="toc" aria-labelledby="toc-h">
          <h2 id="toc-h">On this page</h2>
          <ul>{TOC.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ul>
          <p>Last updated {UPDATED}</p>
        </aside>
        </div>
      </Shell>
    )
  }

  return (
    <main className="phone">
      <PhoneTop back={<button type="button" className="back-btn" onClick={back} aria-label="Back"><ChevronLeft size={24} aria-hidden="true" /></button>} />
      <div className="phone-body prose">{intro}<Sections /></div>
    </main>
  )
}

const Sections = () => (
  <>
    <section id="keep" aria-labelledby="keep-h">
      <h2 id="keep-h">What we keep</h2>
      <ul>
        <li>Your name and SIIT email, from your Google account. We never see your password.</li>
        <li>Your student number and the classes you're in, added by your admin or instructor.</li>
        <li>Your check-ins: the time and whether you were present, excused or absent.</li>
        <li>Check-ins that failed, and why (for example, the code had expired).</li>
      </ul>
    </section>

    <section id="location" aria-labelledby="location-h">
      <h2 id="location-h">Your location</h2>
      <p>Mahub reads your location only when you tap <strong>Share my location</strong> to check in. It is used to confirm you're on the Rangsit or Bangkadi campus.</p>
      <p>We keep how far you were from campus and how precise your phone's location was. <strong>We never save where you were.</strong></p>
    </section>

    <section id="who" aria-labelledby="who-h">
      <h2 id="who-h">Who can see it</h2>
      <ul>
        <li>You see your own attendance.</li>
        <li>Your instructors see check-ins, including failed ones, for their classes only.</li>
        <li>Admins can see everything, to fix mistakes and keep records.</li>
      </ul>
      <p>Nothing is sold or shared for advertising. The app runs on Vercel and its data is stored with Supabase.</p>
    </section>

    <section id="cookies" aria-labelledby="cookies-h">
      <h2 id="cookies-h">Cookies</h2>
      <p>One cookie keeps you signed in. There are no tracking or advertising cookies.</p>
    </section>

    {/* Team decision 2026-11-03: two semesters. Nothing deletes automatically; the team deletes by hand. */}
    <section id="retention" aria-labelledby="retention-h">
      <h2 id="retention-h">How long we keep it</h2>
      <p>We keep your records for two semesters: the one you take the class in, and the one after. Then we delete them.</p>
    </section>

    {/* shortcut: no team email yet; link it here once it exists. */}

    <section id="questions" aria-labelledby="questions-h">
      <h2 id="questions-h">Questions or removal</h2>
      <p>Ask your instructor, or contact <a href="https://github.com/Yayikast/Mahub/issues/new" target="_blank" rel="noreferrer">the Mahub team<span className="sr-only"> (opens GitHub)</span></a>.</p>
    </section>
  </>
)
