// Every CSV export and import goes through this file (plan: ../CSV-PLAN.md). Pure functions, no React,
// so `npm test` can run them in Node.

// Excel runs a cell starting with these as a formula, so a student named "=HYPERLINK(...)" could run code
// on the instructor's laptop. A leading ' makes Excel show it as plain text.
const RISKY = /^[=+\-@\t\r]/

function cell(v) {
  let s = v == null ? '' : String(v)
  if (typeof v === 'string' && RISKY.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// columns: [[header, (row) => value], ...]. Starts with a BOM so Excel reads UTF-8 (Thai names) correctly.
export function toCsv(columns, rows) {
  const lines = [columns.map(([h]) => cell(h)), ...rows.map((r) => columns.map(([, get]) => cell(get(r))))]
  return '﻿' + lines.map((l) => l.join(',')).join('\r\n') + '\r\n'
}

// Local date and time in the shapes spreadsheets sort well: 2026-11-02 and 09:03.
export const csvDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA') : ''
export const csvTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

// Makes a name safe for a file: "CSS326 · Section 1" -> "CSS326-Section-1".
export const fileSlug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // Safari needs the URL a moment after the click
}

// RFC 4180 reader: quotes, "" inside quotes, commas and line breaks inside quotes, BOM, CRLF or LF.
// Uses ; instead of , when the header line has more of them (Excel saves that way in some locales).
// Blank lines are kept as [] so row numbers still match the spreadsheet.
export function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const first = text.split(/\r?\n/, 1)[0]
  const sep = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ';' : ','
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i++ }
      else quoted = false
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row.length === 1 && row[0].trim() === '' ? [] : row)
      row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export const MAX_ROWS = 500
const norm = (s) => s.toLowerCase().replace(/[\s_.-]+/g, ' ').trim()
const ALIASES = {
  email: ['email', 'e-mail', 'mail', 'email address'],
  student_no: ['student_no', 'student no', 'student number', 'student id', 'studentid', 'id'],
  full_name: ['full_name', 'name', 'full name', 'student name'],
  role: ['role'],
}

// A class list -> { rows: [{ row, email, full_name, student_no }] } or { error } in plain words.
// Every student email is <student_no>@g.siit.tu.ac.th (confirmed), so a student number alone is enough.
// A role column (users import) adds `role` to each row. `noun` only changes the error wording.
export function readStudents(text, noun = 'students') {
  const [head = [], ...body] = parseCsv(text)
  const col = Object.fromEntries(Object.entries(ALIASES).map(([k, names]) =>
    [k, head.findIndex((h) => names.some((n) => norm(n) === norm(h)))]))
  if (col.email < 0 && col.student_no < 0) {
    const found = head.map((h) => h.trim()).filter(Boolean).join(', ')
    return { error: `We couldn't find an email or student number column. Columns found: ${found || 'none'}.` }
  }
  const get = (r, k) => (col[k] < 0 ? '' : (r[col[k]] ?? '').trim())
  const rows = body
    .map((r, i) => {
      const student_no = get(r, 'student_no')
      const out = { row: i + 2, email: get(r, 'email') || (student_no && `${student_no}@g.siit.tu.ac.th`), full_name: get(r, 'full_name'), student_no }
      if (col.role >= 0) out.role = get(r, 'role')
      return r.length === 0 ? null : out
    })
    .filter(Boolean)
  if (rows.length === 0) return { error: `This file has no ${noun} under the header row.` }
  if (rows.length > MAX_ROWS) return { error: `This file has ${rows.length} ${noun}. Import at most ${MAX_ROWS} at a time.` }
  return { rows }
}
