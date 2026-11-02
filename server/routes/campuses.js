const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { listCampuses, createCampus, updateCampus, deleteCampus } = require('../controllers/campuses');

// Mount in app.js with: app.use('/api/campuses', require('./routes/campuses'))
const router = express.Router();

const admin = [requireLogin, requireRole('admin')];

// Instructors read the list to pick a campus when they start a check-in.
router.get('/', requireLogin, requireRole('admin', 'instructor'), listCampuses);
router.post('/', admin, createCampus);
router.put('/:id', admin, updateCampus);
router.delete('/:id', admin, deleteCampus);

module.exports = router;
