const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { listCourses, createCourse, updateCourse, deleteCourse } = require('../controllers/courses');

// Mount in app.js with: app.use('/api/courses', require('./routes/courses'))
const router = express.Router();

router.use(requireLogin, requireRole('admin'));

router.get('/', listCourses);
router.post('/', createCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);

module.exports = router;
