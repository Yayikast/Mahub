const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/users');

// Mount in app.js with: app.use('/api/users', require('./routes/users'))
const router = express.Router();

router.use(requireLogin, requireRole('admin'));

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
