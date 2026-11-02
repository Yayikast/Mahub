const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { listSections, createSection, updateSection, deleteSection } = require('../controllers/sections');
const { listEnrollments, addEnrollment, removeEnrollment } = require('../controllers/enrollments');

// Mount in app.js with: app.use('/api/sections', require('./routes/sections'))
// (the enrollment import router is mounted on the same address)
const router = express.Router();

const admin = [requireLogin, requireRole('admin')];

router.get('/', admin, listSections);
router.post('/', admin, createSection);
router.put('/:id', admin, updateSection);
router.delete('/:id', admin, deleteSection);

// An instructor may read their own section's list (the controller checks whose section it is).
router.get('/:id/enrollments', requireLogin, requireRole('admin', 'instructor'), listEnrollments);
// Adding and removing stay admin only: removing a student changes past attendance numbers.
router.post('/:id/enrollments', admin, addEnrollment);
router.delete('/:id/enrollments/:studentId', admin, removeEnrollment);

module.exports = router;
