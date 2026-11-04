const pool = require('../db');
const { toInt } = require('../lib/fields');
const { ownsSection } = require('../middleware/auth');
const { MAX_ROWS, clean, classify, totalsOf, publicResults } = require('../lib/enrollmentImportRules');

// Loads what the rules need for these rows. With `lock`, the user rows are held
// (FOR SHARE) until the transaction ends so a role or student_no can't change mid-import.
async function check(db, sectionId, rows, canCreate, lock) {
  const cleaned = rows.map(clean);
  const emails = cleaned.map((r) => r.email);
  const numbers = cleaned.map((r) => r.student_no).filter(Boolean);

  const users = await db.query(
    `SELECT id, email, role, student_no FROM users
     WHERE email = ANY($1::text[]) OR student_no = ANY($2::text[])${lock ? ' FOR SHARE' : ''}`,
    [emails, numbers]
  );
  const enrolled = await db.query('SELECT student_id FROM enrollments WHERE section_id = $1', [sectionId]);

  const usersByEmail = new Map();
  const ownerByNo = new Map();
  for (const u of users.rows) {
    usersByEmail.set(u.email, { id: u.id, role: u.role });
    if (u.student_no) ownerByNo.set(u.student_no, u.id);
  }
  return classify(rows, {
    usersByEmail,
    ownerByNo,
    enrolled: new Set(enrolled.rows.map((e) => e.student_id)),
    canCreate,
  });
}

async function importEnrollments(req, res, next) {
  try {
    const sectionId = toInt(req.params.id); // 1 up to INT_MAX, or null
    const isAdmin = req.user.role === 'admin';

    const found = sectionId
      ? await pool.query('SELECT id FROM sections WHERE id = $1', [sectionId])
      : { rowCount: 0 };
    if (found.rowCount === 0) return res.status(404).json({ error: 'Section not found' });
    if (!isAdmin && !(await ownsSection(sectionId, req.user.id))) {
      return res.status(403).json({ error: 'Not your section' });
    }

    const { dry_run: dryRun, rows } = req.body ?? {};
    if (typeof dryRun !== 'boolean') return res.status(400).json({ error: 'dry_run must be true or false' });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Import at most ${MAX_ROWS} rows at a time` });

    if (dryRun) {
      const checked = await check(pool, sectionId, rows, isAdmin, false);
      return res.json({ dry_run: true, results: publicResults(checked), totals: totalsOf(checked) });
    }
    return await realRun(req, res, sectionId, rows, isAdmin);
  } catch (err) {
    next(err);
  }
}

// All or nothing, in one transaction. Every row is checked again here; the preview is not trusted.
async function realRun(req, res, sectionId, rows, isAdmin) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-check the section and the caller's ownership inside the transaction, and hold the section row.
    const sec = await client.query('SELECT instructor_id FROM sections WHERE id = $1 FOR SHARE', [sectionId]);
    if (sec.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Section not found' });
    }
    if (!isAdmin && sec.rows[0].instructor_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your section' });
    }

    const checked = await check(client, sectionId, rows, isAdmin, true);
    const totals = totalsOf(checked);
    const results = publicResults(checked);

    if (totals.problem > 0) {
      await client.query('ROLLBACK');
      const n = totals.problem;
      return res.status(400).json({
        error: `Nothing was saved: ${n} ${n === 1 ? 'row has a problem' : 'rows have problems'}`,
        dry_run: false, results, totals,
      });
    }

    const studentIds = checked.filter((c) => c.result === 'enroll').map((c) => c.student_id);
    const fresh = checked.filter((c) => c.result === 'new_user');
    if (fresh.length > 0) {
      const made = await client.query(
        `INSERT INTO users (email, full_name, role, student_no, created_by)
         SELECT t.email, t.full_name, 'student', t.student_no, $4::int
         FROM unnest($1::text[], $2::text[], $3::text[]) AS t(email, full_name, student_no)
         RETURNING id`,
        [fresh.map((c) => c.email), fresh.map((c) => c.full_name), fresh.map((c) => c.student_no), req.user.id]
      );
      studentIds.push(...made.rows.map((u) => u.id));
    }
    if (studentIds.length > 0) {
      await client.query(
        `INSERT INTO enrollments (section_id, student_id, created_by)
         SELECT $1::int, s, $3::int FROM unnest($2::int[]) AS s
         ON CONFLICT DO NOTHING`,
        [sectionId, studentIds, req.user.id]
      );
      const { enroll, new_user, already_enrolled } = totals;
      await client.query('SELECT log_import($1, $2::jsonb, $3)', [
        sectionId, JSON.stringify({ enroll, new_user, already_enrolled }), req.user.id,
      ]);
    }

    await client.query('COMMIT');
    return res.json({ dry_run: false, results, totals });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // 23505: someone created the same email or student_no between our check and our insert.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Another change got in the way. Nothing was saved, please try again' });
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { importEnrollments };
