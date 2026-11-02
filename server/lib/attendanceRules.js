// Rules and reply shapes for the roster and manual marks (docs/API.md, section 3). Pure: no database.

const MARK_STATUSES = ['present', 'excused'];

// Body of PUT /api/sessions/:id/attendance/:studentId. Returns { error } or { value: { status } }.
// "absent" is not a status you can set: absent means no row, so you clear the mark instead.
function validateMark(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!MARK_STATUSES.includes(b.status)) return { error: 'Status must be present or excused' };
  return { value: { status: b.status } };
}

// header: one row about the session, its class and its campus. students: rows from v_session_roster.
// The counts come from the very same list of students, so present + excused + absent = total always.
function buildRoster(header, students) {
  const count = (status) => students.filter((s) => s.status === status).length;
  const present = count('present');
  const excused = count('excused');
  return {
    session_id: header.id,
    is_open: header.closed_at === null,
    opened_at: header.opened_at,
    closed_at: header.closed_at,
    section: {
      id: header.section_id,
      course_code: header.course_code,
      course_name: header.course_name,
      term: header.term,
      section_no: header.section_no,
    },
    campus: { id: header.campus_id, name: header.campus_name },
    counts: { present, excused, absent: students.length - present - excused, total: students.length },
    students: students.map((s) => ({
      student_id: s.student_id,
      full_name: s.full_name,
      student_no: s.student_no,
      status: s.status,
      method: s.method ?? null,
      recorded_at: s.recorded_at ?? null,
    })),
  };
}

module.exports = { MARK_STATUSES, validateMark, buildRoster };
