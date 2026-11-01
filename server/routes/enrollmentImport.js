const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { importEnrollments } = require('../controllers/enrollmentImport');

// Mount in app.js with: app.use('/api/sections', require('./routes/enrollmentImport'))
const router = express.Router();

router.post('/:id/enrollments/import', requireLogin, requireRole('admin', 'instructor'), importEnrollments);

module.exports = router;
