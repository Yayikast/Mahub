// db.js - one shared connection pool for the whole app (Lab 6 pattern).
// The login comes from DATABASE_URL in .env (Lab 10), never from this file.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// TODO 1: create the pool. Like mysql.createPool in your labs, but pg takes
// one object with three settings:
//   - connectionString: the DATABASE_URL from .env (hint: process.env....)
//   - max: 3 (Vercel runs many copies of the server; keep each pool small)
//   - ssl: { ca: <the certificate's text> } so pg only trusts Supabase.
//     Read the file certs/supabase-ca.crt with fs.readFileSync(..., 'utf8').
//     Build the path with path.join(__dirname, 'certs', 'supabase-ca.crt'),
//     so it works no matter which folder the server is started from.
const pool = null; // replace null with new Pool({ ... })

// A connection that breaks while idle must not crash the whole server.
pool.on('error', (err) => console.error('Idle database connection error:', err.message));

module.exports = pool;
