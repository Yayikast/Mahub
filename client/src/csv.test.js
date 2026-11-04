import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ROWS, fileSlug, parseCsv, readStudents, toCsv, withDefaultRole, withoutProblems } from './csv.js'

const cols = [['Name', (r) => r.name], ['No.', (r) => r.no]]

test('toCsv: BOM, CRLF, quoting of commas, quotes and line breaks', () => {
  const out = toCsv(cols, [{ name: 'Lee, Ann', no: 1 }, { name: 'Say "hi"', no: null }, { name: 'two\nlines', no: 3 }])
  assert.equal(out, '﻿Name,No.\r\n"Lee, Ann",1\r\n"Say ""hi""",\r\n"two\nlines",3\r\n')
})

test('toCsv: formula cells are defused, plain negative numbers are not', () => {
  const out = toCsv([['v', (r) => r]], ['=HYPERLINK("x")', '+1', '@a', '-x', -5])
  assert.equal(out.split('\r\n').slice(1, 6).join('|'), `"'=HYPERLINK(""x"")"|'+1|'@a|'-x|-5`)
})

test('parseCsv reads back what toCsv writes', () => {
  const rows = [{ name: 'Lee, Ann', no: 'a"b' }, { name: 'two\r\nlines', no: '' }]
  assert.deepEqual(parseCsv(toCsv(cols, rows)), [['Name', 'No.'], ['Lee, Ann', 'a"b'], ['two\r\nlines', '']])
})

test('parseCsv: LF only, semicolons, blank lines kept as []', () => {
  assert.deepEqual(parseCsv('a;b\n1;2\n\n3;"x;y"'), [['a', 'b'], ['1', '2'], [], ['3', 'x;y']])
})

test('readStudents: alias headers, extra columns, email from student number, real row numbers', () => {
  const r = readStudents('﻿Student ID,Full Name,Section\r\n6722771886,Somchai P.,1\r\n\r\n6722771887,,2\r\n')
  assert.deepEqual(r.rows, [
    { row: 2, email: '6722771886@g.siit.tu.ac.th', full_name: 'Somchai P.', student_no: '6722771886' },
    { row: 4, email: '6722771887@g.siit.tu.ac.th', full_name: '', student_no: '6722771887' },
  ])
})

test('readStudents: an email column wins over the derived one', () => {
  assert.equal(readStudents('E-mail,student_no\nx@g.siit.tu.ac.th,1').rows[0].email, 'x@g.siit.tu.ac.th')
})

test('readStudents: plain-word errors', () => {
  assert.match(readStudents('Name,Section\nA,1').error, /Columns found: Name, Section\./)
  assert.match(readStudents('email\n').error, /no students/)
  const big = 'id\n' + Array.from({ length: MAX_ROWS + 1 }, (_, i) => i).join('\n')
  assert.match(readStudents(big).error, /at most 500/)
})

test('withDefaultRole: no role column -> the chosen role; a role in the file wins, lowercased', () => {
  const noColumn = readStudents('Name,Email\nNok,nok@g.siit.tu.ac.th', 'users').rows
  assert.equal(withDefaultRole(noColumn, 'student')[0].role, 'student')
  assert.equal(withDefaultRole(noColumn, 'instructor')[0].role, 'instructor')

  const mixed = readStudents('Name,Email,Role\nNok,nok@x.com, Instructor \nAda,ada@x.com,\nBo,bo@x.com,ADMIN', 'users').rows
  assert.deepEqual(withDefaultRole(mixed, 'student').map((r) => r.role), ['instructor', 'student', 'admin'])
  assert.equal(mixed[1].role, '', 'the input rows are not changed')
})

test('withoutProblems: drops exactly the rows the server flagged, keeps the order and the spreadsheet row numbers', () => {
  const rows = [{ row: 2, email: 'a@x.com' }, { row: 3, email: 'bad' }, { row: 4, email: 'b@x.com' }, { row: 5, email: 'c@x.com' }]
  const results = [
    { row: 1, result: 'enroll' }, { row: 2, result: 'problem', reason: 'invalid_email' },
    { row: 3, result: 'already_enrolled' }, { row: 4, result: 'problem', reason: 'duplicate_row' },
  ]
  assert.deepEqual(withoutProblems(rows, results).map((r) => r.row), [2, 4])
  assert.equal(withoutProblems(rows, [{ row: 1, result: 'enroll' }, { row: 2, result: 'enroll' }, { row: 3, result: 'enroll' }, { row: 4, result: 'enroll' }]).length, 4)
  assert.deepEqual(withoutProblems(rows.slice(0, 1), [{ row: 1, result: 'problem', reason: 'invalid_email' }]), [])
  assert.equal(rows.length, 4, 'the input rows are not changed')
})

test('readStudents: a role column is passed through (users import)', () => {
  assert.deepEqual(readStudents('Name,Email,Role\nNok,nok@x.com,Instructor', 'users').rows,
    [{ row: 2, email: 'nok@x.com', full_name: 'Nok', student_no: '', role: 'Instructor' }])
  assert.match(readStudents('email,role\n', 'users').error, /no users/)
})

test('fileSlug', () => assert.equal(fileSlug('CSS326 · Section 1'), 'CSS326-Section-1'))
