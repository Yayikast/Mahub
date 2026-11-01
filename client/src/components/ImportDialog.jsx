import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleMinus, Download, LoaderCircle, Upload, UserPlus, UserCheck } from 'lucide-react'
import { api } from '../api.js'
import { downloadCsv, readStudents, toCsv } from '../csv.js'

// The server's `reason` codes in plain words (docs/API.md, the two import routes).
const PROBLEMS = {
  invalid_email: 'Not a valid email',
  duplicate_row: 'Appears twice in this file',
  student_no_mismatch: 'Student no. belongs to someone else',
  not_a_student: "This person isn't a student",
  not_a_user: 'Not in Mahub yet. Ask an admin to add them',
  not_siit_email: 'Student emails must end in @g.siit.tu.ac.th',
  name_required: 'Needs a name to make the account',
  invalid_student_no: 'Student no. must be 10 digits',
  invalid_role: 'Role must be student, instructor or admin',
  student_no_only_for_students: 'Only students have a student no.',
}

// Each result is an icon plus a word (never colour alone). Only problems are red; nothing here is green,
// because nothing has happened yet.
const PILL = {
  enroll: [UserCheck, 'Enroll', 'pill-excused'],
  new_user: [UserPlus, 'New account', 'pill-excused'],
  already_enrolled: [CircleMinus, 'Already enrolled', 'pill-absent'],
  already_exists: [CircleMinus, 'Already in Mahub', 'pill-absent'],
  problem: [CircleAlert, 'Problem', 'pill-failed'],
}

const MAX_BYTES = 1024 * 1024

// Three steps in one centred dialog: choose a file, check the server's dry run, then apply it.
// The real run is all or nothing (any problem row -> 400, nothing saved), so Apply waits for a clean file.
// `kind` (ENROLL or USERS below) holds what differs. onDone(totals) runs after the real import.
export default function ImportDialog({ kind, path, note, onDone, onClose }) {
  const ref = useRef(null)
  const [rows, setRows] = useState(null) // what we read from the file
  const [check, setCheck] = useState(null) // the server's dry-run answer
  const [busy, setBusy] = useState('') // '' | 'check' | 'save'
  const [error, setError] = useState('')
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [over, setOver] = useState(false) // a file is being dragged over the drop zone
  useEffect(() => { ref.current.showModal() }, [])

  const send = (dry_run, list) => api.post(path, { dry_run, rows: list.map(({ row, ...r }) => r) })

  async function pick(file) {
    if (!file || busy) return
    setError('')
    if (!/\.csv$/i.test(file.name)) return setError(`"${file.name}" isn't a CSV file. In Excel or Google Sheets, save or download it as CSV.`)
    if (file.size > MAX_BYTES) return setError('This file is over 1 MB. Split it into smaller files.')
    const read = readStudents(await file.text(), kind.noun)
    if (read.error) return setError(read.error)
    setBusy('check')
    try {
      setCheck(await send(true, read.rows))
      setRows(read.rows)
      setProblemsOnly(false)
    } catch (e) { setError(`Couldn't check the file: ${e.message}`) }
    setBusy('')
  }

  async function apply() {
    setBusy('save')
    setError('')
    try {
      const done = await send(false, rows)
      onDone(done.totals)
      ref.current.close()
    } catch (e) {
      // Someone changed the data since the dry run: show the server's fresh results instead of the stale ones.
      if (e.data?.results) setCheck(e.data)
      setError(e.data?.results ? 'Nothing was saved. Something changed since the check, so some rows now have problems. They are listed below.' : `Nothing was saved: ${e.message}`)
      setBusy('')
    }
  }

  // The server numbers rows 1..n in the order we sent them; we show the spreadsheet's row numbers.
  const results = check?.results.map((r) => ({ ...rows[r.row - 1], ...r, row: rows[r.row - 1].row })) ?? []
  const problems = results.filter((r) => r.result === 'problem')
  const n = problems.length ? 0 : kind.applies.reduce((sum, k) => sum + (check?.totals[k] ?? 0), 0) // all or nothing

  function downloadProblems() {
    downloadCsv(`${kind.noun}-problem-rows.csv`, toCsv([
      ...kind.template[0].map((h) => [h, (r) => r[h]]),
      ['problem', (r) => PROBLEMS[r.reason] ?? r.reason],
    ], problems))
  }

  return (
    <dialog ref={ref} className="sheet sheet-wide" onClose={onClose} aria-labelledby="import-title">
      <h2 id="import-title" className="subheading sheet-head">{kind.title}</h2>
      <div className="sheet-body">
        {!check ? (
          <>
            <label className={`dropzone${over ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}>
              <input type="file" accept=".csv,text/csv" className="sr-only" disabled={!!busy}
                onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
              {busy ? <LoaderCircle size={24} className="spin" aria-hidden="true" /> : <Upload size={24} aria-hidden="true" />}
              <span>{busy ? 'Checking the file…' : <>Drop a CSV file here or <u>choose a file</u></>}</span>
            </label>
            <p className="field-hint">
              {kind.help}{' '}
              <button type="button" className="link" onClick={() => downloadCsv(`mahub-${kind.noun}-template.csv`, toCsv(kind.template[0].map((h, i) => [h, (r) => r[i]]), [kind.template[1]]))}>
                Download template
              </button>
            </p>
            {note && <p className="field-hint">{note}</p>}
          </>
        ) : (
          <>
            <p className="import-summary" role="status">
              {kind.order.filter((k) => check.totals[k]).map((k) => people(check.totals[k], ...kind.counts[k])).join(' · ')}
            </p>
            {problems.length > 0 && (
              <div className="import-tools">
                <div className="filters" role="group" aria-label="Show rows">
                  <button type="button" aria-pressed={!problemsOnly} onClick={() => setProblemsOnly(false)}>All <span className="num">{results.length}</span></button>
                  <button type="button" aria-pressed={problemsOnly} onClick={() => setProblemsOnly(true)}>Problems <span className="num">{problems.length}</span></button>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadProblems}>
                  <Download size={16} aria-hidden="true" />Download problem rows
                </button>
              </div>
            )}
            <div className="import-table">
              <table className="table">
                <thead>
                  <tr><th scope="col" className="r">Row</th><th scope="col">Person</th><th scope="col">Result</th></tr>
                </thead>
                <tbody>
                  {(problemsOnly ? problems : results).map((r) => {
                    const [Icon, word, cls] = PILL[r.result]
                    return (
                      <tr key={r.row}>
                        <td className="num r">{r.row}</td>
                        <td><span className="cell-2"><strong>{r.full_name || r.email || 'No email'}</strong><span>{[r.full_name && r.email, r.student_no].filter(Boolean).join(' · ')}</span></span></td>
                        <td>
                          <span className="cell-2">
                            <span><span className={`pill ${cls}`}><Icon size={16} aria-hidden="true" />{word}</span></span>
                            {r.reason && <span className="problem">{PROBLEMS[r.reason] ?? r.reason}</span>}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {n === 0 && <p className="field-hint">{problems.length
              ? `Nothing is ${kind.done} while any row has a problem. Fix ${problems.length === 1 ? 'that row' : `those ${problems.length} rows`} in your spreadsheet, then choose the file again.`
              : `Everyone in this file is already ${kind.done}.`}</p>}
          </>
        )}
        {error && <p className="banner banner-error" role="alert">{error}</p>}
      </div>
      <div className="sheet-foot">
        {check
          ? <button type="button" className="btn btn-secondary btn-md" onClick={() => { setCheck(null); setError('') }} disabled={!!busy}>Choose another file</button>
          : <button type="button" className="btn btn-secondary btn-md" onClick={() => ref.current.close()}>Cancel</button>}
        {check && (
          <button type="button" className="btn btn-primary btn-md" onClick={apply} disabled={n === 0 || !!busy} aria-busy={busy === 'save'}>
            {busy === 'save' && <LoaderCircle size={18} className="spin" aria-hidden="true" />}{kind.action(n)}
          </button>
        )}
      </div>
    </dialog>
  )
}

const people = (n, one, many) => `${n} ${n === 1 ? one : many}`

export const ENROLL = {
  title: 'Enroll students from CSV', noun: 'students', done: 'enrolled',
  help: 'Needs a student number or email column. Name is only needed for new accounts.',
  template: [['student_no', 'full_name', 'email'], ['6722000001', 'Example Student', '6722000001@g.siit.tu.ac.th']],
  order: ['enroll', 'new_user', 'already_enrolled', 'problem'],
  counts: { enroll: ['to enroll', 'to enroll'], new_user: ['new account', 'new accounts'], already_enrolled: ['already enrolled', 'already enrolled'], problem: ['problem', 'problems'] },
  applies: ['enroll', 'new_user'],
  action: (n) => n ? `Enroll ${people(n, 'student', 'students')}` : 'Enroll students',
  toast: (c) => [`${people(c.enroll + c.new_user, 'student', 'students')} enrolled`, c.new_user && `${c.new_user} new`].filter(Boolean).join(' · '),
}

export const USERS = {
  title: 'Add users from CSV', noun: 'users', done: 'added',
  help: 'Needs email, full name and role (student, instructor or admin). Student no. for students.',
  template: [['full_name', 'email', 'role', 'student_no'], ['Example Student', '6722000001@g.siit.tu.ac.th', 'student', '6722000001']],
  order: ['new_user', 'already_exists', 'problem'],
  counts: { new_user: ['new account', 'new accounts'], already_exists: ['already in Mahub', 'already in Mahub'], problem: ['problem', 'problems'] },
  applies: ['new_user'],
  action: (n) => n ? `Add ${people(n, 'user', 'users')}` : 'Add users',
  toast: (c) => `${people(c.new_user, 'user', 'users')} added`,
}
