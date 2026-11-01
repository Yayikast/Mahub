// Row rules for POST /api/sections/:id/enrollments/import (docs/API.md).
// Pure: no database. The controller loads the facts, this decides what each row is.

const MAX_ROWS = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIIT = /@g\.siit\.tu\.ac\.th$/;
const STUDENT_NO = /^[0-9]{10}$/;

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { email: text(r.email).toLowerCase(), full_name: text(r.full_name), student_no: text(r.student_no) };
}

// facts.usersByEmail: Map email -> { id, role }
// facts.ownerByNo:    Map student_no -> user id (who holds that number)
// facts.enrolled:     Set of student ids already in this section
// facts.canCreate:    true for admin only. Instructors never create users.
function classify(rows, facts) {
  const { usersByEmail, ownerByNo, enrolled, canCreate } = facts;
  const seen = new Set();
  return rows.map((raw, i) => {
    const r = clean(raw);
    const out = { row: i + 1, email: r.email };
    const problem = (reason) => ({ ...out, result: 'problem', reason });

    if (r.email.length > 254 || !EMAIL.test(r.email)) return problem('invalid_email');

    const noKey = r.student_no && `#${r.student_no}`;
    const duplicate = seen.has(r.email) || (noKey && seen.has(noKey));
    seen.add(r.email);
    if (noKey) seen.add(noKey);
    if (duplicate) return problem('duplicate_row');

    const user = usersByEmail.get(r.email);
    const owner = r.student_no ? ownerByNo.get(r.student_no) : undefined;
    if (owner !== undefined && owner !== user?.id) return problem('student_no_mismatch');

    if (user) {
      // The file never changes an existing user: name and student_no are ignored from here on.
      if (user.role !== 'student') return problem('not_a_student');
      return { ...out, result: enrolled.has(user.id) ? 'already_enrolled' : 'enroll', student_id: user.id };
    }

    if (!canCreate) return problem('not_a_user');
    if (!SIIT.test(r.email)) return problem('not_siit_email');
    if (!r.full_name) return problem('name_required');
    if (r.student_no && !STUDENT_NO.test(r.student_no)) return problem('invalid_student_no');
    return { ...out, result: 'new_user', full_name: r.full_name, student_no: r.student_no || null };
  });
}

const KEYS = ['enroll', 'new_user', 'already_enrolled', 'problem'];
const totalsOf = (checked) => Object.fromEntries(KEYS.map((k) => [k, checked.filter((c) => c.result === k).length]));

// What the screen sees: no ids, no names.
const publicResults = (checked) =>
  checked.map(({ row, email, result, reason }) => ({ row, email, result, ...(reason && { reason }) }));

module.exports = { MAX_ROWS, clean, classify, totalsOf, publicResults };
