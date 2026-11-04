const pool = require('../db');
const { toInt } = require('../lib/fields');
const { validateNewCourse, validateCourseEdit } = require('../lib/courseRules');

const COLUMNS = 'id, code, name';

// 1 up to INT_MAX, or null. A bigger number would make Postgres throw (22003) and send a 500.
const idOf = (req) => toInt(req.params.id);

async function listCourses(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM courses ORDER BY code`);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createCourse(req, res, next) {
  try {
    const { error, value } = validateNewCourse(req.body);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `INSERT INTO courses (code, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [value.code, value.name]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    // 23505: that course code already exists.
    if (err.code === '23505') return res.status(409).json({ error: 'That course code already exists' });
    next(err);
  }
}

async function updateCourse(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'Course not found' });

    const current = await pool.query('SELECT code, name FROM courses WHERE id = $1', [id]);
    if (current.rowCount === 0) return res.status(404).json({ error: 'Course not found' });

    const { error, value } = validateCourseEdit(req.body, current.rows[0]);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `UPDATE courses SET code = $1, name = $2 WHERE id = $3 RETURNING ${COLUMNS}`,
      [value.code, value.name, id]
    );
    // The course may have been deleted between the two queries.
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That course code already exists' });
    next(err);
  }
}

async function deleteCourse(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'Course not found' });

    const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    return res.json({ ok: true });
  } catch (err) {
    // 23503: a section still points at this course.
    if (err.code === '23503') return res.status(409).json({ error: 'This course still has sections' });
    next(err);
  }
}

module.exports = { listCourses, createCourse, updateCourse, deleteCourse };
