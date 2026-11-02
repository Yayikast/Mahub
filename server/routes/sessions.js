const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { mySections, listSessions, openSession, closeSession, getQr } = require('../controllers/sessions');

// Mount in app.js with: app.use('/api', require('./routes/sessions'))
// These addresses start in three places (/my, /sections, /sessions), so the paths are written in full here.
const router = express.Router();

// Instructors only. The controller then checks the section or session is theirs (403 if not).
const instructor = [requireLogin, requireRole('instructor')];

router.get('/my/sections', instructor, mySections);
router.get('/sections/:id/sessions', instructor, listSessions);
router.post('/sections/:id/sessions', instructor, openSession);
router.post('/sessions/:id/close', instructor, closeSession);
router.get('/sessions/:id/qr', instructor, getQr);

module.exports = router;
