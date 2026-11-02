const pool = require('../db');
const { validateNewUser, validateUserEdit } = require('../lib/userRules');
const { MAX_ROWS, clean, classify, totalsOf, publicResults } = require('../lib/userImportRules');

// google_sub is never sent to the screens.
const COLUMNS = 'id, email, full_name, role, student_no, created_by, created_at';

const idOf = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// 23505: the email or the student_no is already taken.
const duplicateMessage = (err) =>
  /student_no/.test(err.constraint ?? '') ? 'That student number already exists' : 'That email already exists';

async function listUsers(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users ORDER BY id`);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { error, value } = validateNewUser(req.body);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `INSERT INTO users (email, full_name, role, student_no, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [value.email, value.full_name, value.role, value.student_no, req.user.id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: duplicateMessage(err) });
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'User not found' });

    const current = await pool.query('SELECT email, full_name, role, student_no FROM users WHERE id = $1', [id]);
    if (current.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const { error, value } = validateUserEdit(req.body, current.rows[0]);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `UPDATE users SET email = $1, full_name = $2, role = $3, student_no = $4
       WHERE id = $5
       RETURNING ${COLUMNS}`,
      [value.email, value.full_name, value.role, value.student_no, id]
    );
    // The user may have been deleted between the two queries.
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: duplicateMessage(err) });
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'User not found' });

    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true });
  } catch (err) {
    // 23503: a section or an attendance record still points at this user.
    if (err.code === '23503') {
      return res.status(409).json({ error: 'This user is still used by a section or an attendance record' });
    }
    next(err);
  }
}

// Loads what the rules need for these rows. With `lock`, the matching user rows are held
// (FOR SHARE) until the transaction ends so a student_no can't change hands mid-import.
async function check(db, rows, lock) {
  const cleaned = rows.map(clean);
  const emails = cleaned.map((r) => r.email);
  const numbers = cleaned.map((r) => r.student_no).filter(Boolean);

  const found = await db.query(
    `SELECT id, email, student_no FROM users
     WHERE email = ANY($1::text[]) OR student_no = ANY($2::text[])${lock ? ' FOR SHARE' : ''}`,
    [emails, numbers]
  );

  const usersByEmail = new Map();
  const ownerByNo = new Map();
  for (const u of found.rows) {
    usersByEmail.set(u.email, u.id);
    if (u.student_no) ownerByNo.set(u.student_no, u.id);
  }
  return classify(rows, { usersByEmail, ownerByNo });
}

async function importUsers(req, res, next) {
  try {
    const { dry_run: dryRun, rows } = req.body ?? {};
    if (typeof dryRun !== 'boolean') return res.status(400).json({ error: 'dry_run must be true or false' });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Import at most ${MAX_ROWS} rows at a time` });

    if (dryRun) {
      const checked = await check(pool, rows, false);
      return res.json({ dry_run: true, results: publicResults(checked), totals: totalsOf(checked) });
    }
    return await realRun(req, res, rows);
  } catch (err) {
    next(err);
  }
}

// All or nothing, in one transaction. Every row is checked again here; the preview is not trusted.
async function realRun(req, res, rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checked = await check(client, rows, true);
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

    const fresh = checked.filter((c) => c.result === 'new_user');
    if (fresh.length > 0) {
      await client.query(
        `INSERT INTO users (email, full_name, role, student_no, created_by)
         SELECT t.email, t.full_name, t.role, t.student_no, $5::int
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(email, full_name, role, student_no)`,
        [
          fresh.map((c) => c.email), fresh.map((c) => c.full_name),
          fresh.map((c) => c.role), fresh.map((c) => c.student_no),
          req.user.id,
        ]
      );
      // section_id is NULL: a user import belongs to no section.
      const { new_user, already_exists } = totals;
      await client.query('SELECT log_import($1::int, $2::jsonb, $3::int)', [
        null, JSON.stringify({ new_user, already_exists }), req.user.id,
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

module.exports = { listUsers, createUser, updateUser, deleteUser, importUsers };
