import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ROWS, fileSlug, parseCsv, readStudents, toCsv } from './csv.js'

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

test('fileSlug', () => assert.equal(fileSlug('CSS326 · Section 1'), 'CSS326-Section-1'))
