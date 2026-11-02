// Field rules for POST /api/sections and PUT /api/sections/:id (docs/API.md, section 2: Sections).
// Pure: no database. Whether the course exists and whether instructor_id is an instructor
// needs the database, so the controller checks those. Both functions return { error } or { value }.

const { text, toInt } = require('./fields');

const FIELDS = ['course_id', 'instructor_id', 'term', 'section_no'];
const MAX_TERM = 20;
const MAX_SECTION_NO = 999;

function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of FIELDS) {
    if (!(key in r)) continue;
    if (key === 'term') out.term = text(r.term);
    else if (key === 'section_no') out.section_no = toInt(r.section_no, 1, MAX_SECTION_NO);
    else out[key] = toInt(r[key]);
  }
  return out;
}

function check(section) {
  if (section.course_id === null) return 'course_id must be a course id';
  if (section.instructor_id === null) return 'instructor_id must be a user id';
  if (!section.term) return 'Term is required';
  if (section.term.length > MAX_TERM) return 'Term is too long';
  if (section.section_no === null) return `Section number must be a whole number from 1 to ${MAX_SECTION_NO}`;
  return null;
}

function validateNewSection(body) {
  const section = { course_id: null, instructor_id: null, term: '', section_no: null, ...clean(body) };
  const error = check(section);
  return error ? { error } : { value: section };
}

// current: the row as it is now ({ course_id, instructor_id, term, section_no }).
function validateSectionEdit(body, current) {
  const changes = clean(body);
  if (Object.keys(changes).length === 0) return { error: 'Nothing to change' };
  const section = {
    course_id: current.course_id,
    instructor_id: current.instructor_id,
    term: current.term,
    section_no: current.section_no,
    ...changes,
  };
  const error = check(section);
  return error ? { error } : { value: section };
}

module.exports = { MAX_TERM, MAX_SECTION_NO, validateNewSection, validateSectionEdit };
