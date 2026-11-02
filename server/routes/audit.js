const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { listAudit } = require('../controllers/audit');

// Mount in app.js with: app.use('/api/audit', require('./routes/audit'))
const router = express.Router();

router.get('/', requireLogin, requireRole('admin'), listAudit);

module.exports = router;
