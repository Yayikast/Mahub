const pool = require('../db');
const { parseAuditQuery, shapeAuditRow } = require('../lib/auditRules');

async function listAudit(req, res, next) {
  try {
    const { error, limit, type } = parseAuditQuery(req.query);
    if (error) return res.status(400).json({ error });

    const { rows } = await pool.query(
      `SELECT id, type, action, session_id, section_id, student_id, old_status, new_status,
              summary, changed_by, changed_at
       FROM audit_log
       WHERE ($1::text IS NULL OR type = $1)
       ORDER BY changed_at DESC, id DESC
       LIMIT $2`,
      [type, limit]
    );
    return res.json(rows.map(shapeAuditRow));
  } catch (err) {
    next(err);
  }
}

module.exports = { listAudit };
