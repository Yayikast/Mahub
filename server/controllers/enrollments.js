const pool = require('../db');
const { ownsSection } = require('../middleware/auth');
const { toInt } = require('../lib/fields');

// 1 up to INT_MAX, or null. A bigger number would make Postgres throw (22003) and send a 500.
const posId = (v) => toInt(v);

// Admin: any section. Instructor: only their own. Returns the status to send, or null if allowed.
async function denied(req, sectionId) {
  const found = await pool.query('SELECT id FROM sections WHERE id = $1', [sectionId]);
  if (found.rowCount === 0) return { status: 404, error: 'Section not found' };
  if (req.user.role !== 'admin' && !(await ownsSection(sectionId, req.user.id))) {
    return { status: 403, error: 'Not your section' };
  }
  return null;
}

async function listEnrollments(req, res, next) {
  try {
    const sectionId = posId(req.params.id);
    const no = sectionId ? await denied(req, sectionId) : { status: 404, error: 'Section not found' };
    if (no) return res.status(no.status).json({ error: no.error });

    const { rows } = await pool.query(
      `SELECT u.id AS student_id, u.full_name, u.email, u.student_no, e.created_by, e.created_at
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
       WHERE e.section_id = $1
       ORDER BY u.student_no NULLS LAST, u.full_name, u.id`,
      [sectionId]
    );
    // Who enrolled a student, and when, is for the admin only.
    if (req.user.role !== 'admin') {
      return res.json(rows.map(({ created_by, created_at, ...student }) => student));
    }
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

// One enrollment and its audit entry, in one transaction.
async function addEnrollment(req, res, next) {
  try {
    const sectionId = posId(req.params.id);
    const found = sectionId ? await pool.query('SELECT id FROM sections WHERE id = $1', [sectionId]) : { rowCount: 0 };
    if (found.rowCount === 0) return res.status(404).json({ error: 'Section not found' });

    const studentId = toInt((req.body ?? {}).student_id);
    if (studentId === null) return res.status(400).json({ error: 'student_id must be a user id' });
    const student = await pool.query(
      'SELECT id, full_name, email, student_no, role FROM users WHERE id = $1', [studentId]);
    if (student.rowCount === 0 || student.rows[0].role !== 'student') {
      return res.status(400).json({ error: 'Choose a student' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const made = await client.query(
        `INSERT INTO enrollments (section_id, student_id, created_by) VALUES ($1, $2, $3)
         RETURNING created_by, created_at`,
        [sectionId, studentId, req.user.id]
      );
      await client.query('SELECT log_enrollment($1::int, $2::int, $3::text, $4::int)',
        [sectionId, studentId, 'INSERT', req.user.id]);
      await client.query('COMMIT');

      const { id, full_name, email, student_no } = student.rows[0];
      return res.status(201).json({ student_id: id, full_name, email, student_no, ...made.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    // 23505: already enrolled. 23503: the section or student was deleted after we checked.
    if (err.code === '23505') return res.status(409).json({ error: 'Already enrolled' });
    if (err.code === '23503') return res.status(404).json({ error: 'Section or student not found' });
    next(err);
  }
}

async function removeEnrollment(req, res, next) {
  try {
    const sectionId = posId(req.params.id);
    const studentId = posId(req.params.studentId);
    if (!sectionId || !studentId) return res.status(404).json({ error: 'Enrollment not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gone = await client.query(
        'DELETE FROM enrollments WHERE section_id = $1 AND student_id = $2', [sectionId, studentId]);
      if (gone.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Enrollment not found' });
      }
      await client.query('SELECT log_enrollment($1::int, $2::int, $3::text, $4::int)',
        [sectionId, studentId, 'DELETE', req.user.id]);
      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { listEnrollments, addEnrollment, removeEnrollment };
