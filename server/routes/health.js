// GET /api/health - is the server up, and does the database answer?
const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/health', async (req, res) => {
  // [ADDED 2]: ask the database the smallest possible question, SELECT 1,
  // with pool.query(...) inside try/catch (Lab 4 pattern).
  //   - It worked:  res.json({ status: 'ok' })            (200 is the default)
  //   - It failed:  log the real error with console.error, then reply
  //                 503 { "status": "unavailable" }. 503 means "service unavailable":
  //                 the server is fine, but something it needs (the database) isn't.
  //                 Don't put err.message in the reply (Lab 10: generic errors).
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error({ error: err.message })
    res.status(503).json({ status: 'unavailable' });
  }
});

module.exports = router;
