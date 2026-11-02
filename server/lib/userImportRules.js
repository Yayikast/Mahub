// Row rules for POST /api/users/import (docs/API.md, section 2: Users).
// Pure: no database. The controller loads the facts, this decides what each row is.

const { ROLES, SIIT, STUDENT_NO, EMAIL, text } = require('./userRules');

const MAX_ROWS = 500;

function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    email: text(r.email).toLowerCase(),
    full_name: text(r.full_name),
    role: text(r.role),
    student_no: text(r.student_no),
  };
}

// facts.usersByEmail: Map email -> user id
// facts.ownerByNo:    Map student_no -> user id (who holds that number)
function classify(rows, facts) {
  const { usersByEmail, ownerByNo } = facts;
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

    const existing = usersByEmail.get(r.email);
    const owner = r.student_no ? ownerByNo.get(r.student_no) : undefined;
    if (owner !== undefined && owner !== existing) return problem('student_no_mismatch');

    // The file never changes an existing user: name, role and student_no are ignored from here on.
    if (existing !== undefined) return { ...out, result: 'already_exists' };

    if (!ROLES.includes(r.role)) return problem('invalid_role');
    if (r.student_no && r.role !== 'student') return problem('student_no_only_for_students');
    if (!r.full_name) return problem('name_required');
    if (r.role === 'student' && !SIIT.test(r.email)) return problem('not_siit_email');
    if (r.student_no && !STUDENT_NO.test(r.student_no)) return problem('invalid_student_no');
    return { ...out, result: 'new_user', full_name: r.full_name, role: r.role, student_no: r.student_no || null };
  });
}

const KEYS = ['new_user', 'already_exists', 'problem'];
const totalsOf = (checked) => Object.fromEntries(KEYS.map((k) => [k, checked.filter((c) => c.result === k).length]));

// What the screen sees: no names, roles or student numbers.
const publicResults = (checked) =>
  checked.map(({ row, email, result, reason }) => ({ row, email, result, ...(reason && { reason }) }));

module.exports = { MAX_ROWS, clean, classify, totalsOf, publicResults };
