import { useState } from 'react'
import { api } from './api.js'
import { csvDate, csvTime, downloadCsv, fileSlug, toCsv } from './csv.js'
import { classLabel } from './useLoad.js'

// Attendance downloads for instructors. Built in the browser from routes the screens already use,
// so they need nothing new from the server.

const STATUS = { present: 'Present', excused: 'Excused', absent: 'Absent' }
const METHOD = { qr: 'QR', manual: 'By hand' }

// One check-in: one row per enrolled student. `at` (opened_at) dates the file name; when the caller
// doesn't have it (live page -> summary), it comes from the section's session list.
export async function exportSession(id, at) {
  const r = await api.get(`/api/sessions/${id}/roster`)
  at ??= (await api.get(`/api/sections/${r.section.id}/sessions`)).find((s) => s.id === Number(id))?.opened_at
  const name = [classLabel(r.section), at ? `${csvDate(at)} ${csvTime(at)}` : `session ${id}`, r.campus.name].join(' ')
  downloadCsv(`${fileSlug(name)}.csv`, toCsv([
    ['Student no.', (s) => s.student_no],
    ['Name', (s) => s.full_name],
    ['Status', (s) => STATUS[s.status]],
    ['Date', (s) => csvDate(s.recorded_at)],
    ['Time', (s) => csvTime(s.recorded_at)],
    ['How', (s) => METHOD[s.method] ?? ''],
  ], r.students))
}

// A whole term for one section: a row per student, a column per check-in (oldest first), then totals.
// `sessions` is GET /api/sections/:id/sessions (newest first). One roster call per session.
export async function exportSection(section, sessions) {
  const ordered = [...sessions].reverse()
  const rosters = await Promise.all(ordered.map((s) => api.get(`/api/sessions/${s.id}/roster`)))
  const students = new Map() // everyone who was enrolled in any of them, in roster order
  rosters.forEach((r, i) => r.students.forEach((s) => {
    if (!students.has(s.student_id)) students.set(s.student_id, { ...s, marks: [] })
    students.get(s.student_id).marks[i] = s.status
  }))
  const count = (s, status) => s.marks.filter((m) => m === status).length
  const held = (s) => s.marks.filter(Boolean).length // check-ins held while they were enrolled
  downloadCsv(`${fileSlug(`${section.course_code} Section ${section.section_no} ${section.term}`)}_all-check-ins.csv`, toCsv([
    ['Student no.', (s) => s.student_no],
    ['Name', (s) => s.full_name],
    ...ordered.map((x, i) => [`${csvDate(x.opened_at)} ${csvTime(x.opened_at)}`, (s) => STATUS[s.marks[i]] ?? '']),
    ['Present', (s) => count(s, 'present')],
    ['Excused', (s) => count(s, 'excused')],
    ['Absent', (s) => count(s, 'absent')],
    ['Attended %', (s) => held(s) ? Math.round(((count(s, 'present') + count(s, 'excused')) / held(s)) * 100) : ''], // same rule as the screen
  ], [...students.values()]))
}

// Runs one download at a time and keeps its error. `busy` is the key of the running one, so only
// that button shows the spinner.
export function useDownload() {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  async function run(key, fn) {
    setBusy(key)
    setError('')
    try { await fn() } catch (e) { setError(`Couldn't make the CSV: ${e.message}`) }
    setBusy(null)
  }
  return { busy, error, run }
}
