const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { getRoster, putMark, clearMark, listAttempts } = require('../controllers/attendance');

// Mount in app.js with: app.use('/api', require('./routes/attendance'))
// (the same address as routes/sessions.js, so the paths are written in full)
const router = express.Router();

// Instructors only. The controller then checks the session is theirs (403 if not).
const instructor = [requireLogin, requireRole('instructor')];

router.get('/sessions/:id/roster', instructor, getRoster);
router.put('/sessions/:id/attendance/:studentId', instructor, putMark);
router.delete('/sessions/:id/attendance/:studentId', instructor, clearMark);
router.get('/sessions/:id/attempts', instructor, listAttempts);

module.exports = router;
