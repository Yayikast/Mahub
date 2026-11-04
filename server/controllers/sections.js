const pool = require('../db');
const { toInt } = require('../lib/fields');
const { validateNewSection, validateSectionEdit } = require('../lib/sectionRules');

// The shape in docs/API.md: the section plus its course and instructor names.
const SELECT = `SELECT s.id, s.course_id, c.code AS course_code, c.name AS course_name,
                       s.instructor_id, u.full_name AS instructor_name, s.term, s.section_no
                FROM sections s
                JOIN courses c ON c.id = s.course_id
                JOIN users u ON u.id = s.instructor_id`;

// 1 up to INT_MAX, or null. A bigger number would make Postgres throw (22003) and send a 500.
const idOf = (req) => toInt(req.params.id);

// Whether the course exists and whether the instructor_id is really an instructor. Returns an error text or null.
async function refsError(db, section) {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM courses WHERE id = $1) AS has_course,
            (SELECT role FROM users WHERE id = $2) AS instructor_role`,
    [section.course_id, section.instructor_id]
  );
  if (!rows[0].has_course) return 'That course does not exist';
  if (rows[0].instructor_role !== 'instructor') return 'instructor_id must be a user with the instructor role';
  return null;
}

const DUPLICATE = 'That course, term and section number already exist';

async function listSections(req, res, next) {
  try {
    const { rows } = await pool.query(`${SELECT} ORDER BY s.term DESC, c.code, s.section_no`);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createSection(req, res, next) {
  try {
    const { error, value } = validateNewSection(req.body);
    if (error) return res.status(400).json({ error });
    const refs = await refsError(pool, value);
    if (refs) return res.status(400).json({ error: refs });

    const made = await pool.query(
      `INSERT INTO sections (course_id, instructor_id, term, section_no)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [value.course_id, value.instructor_id, value.term, value.section_no]
    );
    const { rows } = await pool.query(`${SELECT} WHERE s.id = $1`, [made.rows[0].id]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE });
    // 23503: the course or the instructor was deleted after we checked.
    if (err.code === '23503') return res.status(400).json({ error: 'That course or instructor no longer exists' });
    next(err);
  }
}

async function updateSection(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'Section not found' });

    const current = await pool.query(
      'SELECT course_id, instructor_id, term, section_no FROM sections WHERE id = $1', [id]);
    if (current.rowCount === 0) return res.status(404).json({ error: 'Section not found' });

    const { error, value } = validateSectionEdit(req.body, current.rows[0]);
    if (error) return res.status(400).json({ error });
    const refs = await refsError(pool, value);
    if (refs) return res.status(400).json({ error: refs });

    const done = await pool.query(
      `UPDATE sections SET course_id = $1, instructor_id = $2, term = $3, section_no = $4
       WHERE id = $5 RETURNING id`,
      [value.course_id, value.instructor_id, value.term, value.section_no, id]
    );
    // The section may have been deleted between the two queries.
    if (done.rowCount === 0) return res.status(404).json({ error: 'Section not found' });
    const { rows } = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE });
    if (err.code === '23503') return res.status(400).json({ error: 'That course or instructor no longer exists' });
    next(err);
  }
}

async function deleteSection(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'Section not found' });

    const { rowCount } = await pool.query('DELETE FROM sections WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Section not found' });
    return res.json({ ok: true });
  } catch (err) {
    // 23503: sessions or enrolled students still point at this section. Postgres only names the
    // first one it hit, so look at both and say "sessions" first, as docs/API.md does.
    if (err.code === '23503') {
      try {
        const { rows } = await pool.query(
          'SELECT EXISTS (SELECT 1 FROM class_sessions WHERE section_id = $1) AS has_sessions',
          [idOf(req)]
        );
        return res.status(409).json({
          error: rows[0].has_sessions ? 'This section still has sessions' : 'This section still has enrolled students',
        });
      } catch (lookupErr) {
        return next(lookupErr);
      }
    }
    next(err);
  }
}

module.exports = { listSections, createSection, updateSection, deleteSection };
