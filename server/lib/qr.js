// The QR code a class projects (docs/API.md, GET /api/sessions/:id/qr). Pure: no database.
// The code and its expiry live in class_sessions, never in server memory (Vercel restarts the server).

const crypto = require('crypto');

const QR_SECONDS = 10; // how long one code is valid
const PREV_QR_SECONDS = 5; // after a new code replaces it, the old one still works this long (scan + network time)
const CODE_BYTES = 3;  // 3 random bytes = 6 hex characters, like "ab39f2" in docs/API.md

const newCode = () => crypto.randomBytes(CODE_BYTES).toString('hex');

// origin is the site's address, like "https://mahub.example.com" (a trailing slash is fine).
function scanUrl(origin, sessionId, code) {
  const params = new URLSearchParams({ s: String(sessionId), c: code });
  return `${String(origin).replace(/\/+$/, '')}/scan?${params}`;
}

module.exports = { QR_SECONDS, PREV_QR_SECONDS, CODE_BYTES, newCode, scanUrl };
