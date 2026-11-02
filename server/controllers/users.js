const pool = require('../db');
const { validateNewUser, validateUserEdit } = require('../lib/userRules');

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

module.exports = { listUsers, createUser, updateUser, deleteUser };
