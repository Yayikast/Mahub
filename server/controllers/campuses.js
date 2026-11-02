const pool = require('../db');
const { validateNewCampus, validateCampusEdit } = require('../lib/campusRules');

const COLUMNS = 'id, name, lat, lng, radius_m';
const DUPLICATE = 'That campus name already exists';

const idOf = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function listCampuses(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM campuses ORDER BY id`);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createCampus(req, res, next) {
  try {
    const { error, value } = validateNewCampus(req.body);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `INSERT INTO campuses (name, lat, lng, radius_m) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [value.name, value.lat, value.lng, value.radius_m]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE });
    next(err);
  }
}

async function updateCampus(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'Campus not found' });

    const current = await pool.query('SELECT name, lat, lng, radius_m FROM campuses WHERE id = $1', [id]);
    if (current.rowCount === 0) return res.status(404).json({ error: 'Campus not found' });

    const { error, value } = validateCampusEdit(req.body, current.rows[0]);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `UPDATE campuses SET name = $1, lat = $2, lng = $3, radius_m = $4
       WHERE id = $5 RETURNING ${COLUMNS}`,
      [value.name, value.lat, value.lng, value.radius_m, id]
    );
    // The campus may have been deleted between the two queries.
    if (rows.length === 0) return res.status(404).json({ error: 'Campus not found' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE });
    next(err);
  }
}

async function deleteCampus(req, res, next) {
  try {
    const id = idOf(req);
    if (!id) return res.status(404).json({ error: 'Campus not found' });

    const { rowCount } = await pool.query('DELETE FROM campuses WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Campus not found' });
    return res.json({ ok: true });
  } catch (err) {
    // 23503: a check-in session happened on this campus.
    if (err.code === '23503') return res.status(409).json({ error: 'A session uses this campus' });
    next(err);
  }
}

module.exports = { listCampuses, createCampus, updateCampus, deleteCampus };
