// The QR code a class projects (docs/API.md, GET /api/sessions/:id/qr). Pure: no database.
// The code and its expiry live in class_sessions, never in server memory (Vercel restarts the server).

const crypto = require('crypto');

const QR_SECONDS = 5; // how often the code changes: the screen shows each code this long
const PREV_QR_SECONDS = 10; // after a new code replaces it, the old one still works this long, so one code is
                           // valid for about 15 s in all (a real scan takes 1-3 s; a photo stops working soon)
const CODE_BYTES = 3;  // 3 random bytes = 6 hex characters, like "ab39f2" in docs/API.md

const newCode = () => crypto.randomBytes(CODE_BYTES).toString('hex');

// origin is the site's address, like "https://mahub.example.com" (a trailing slash is fine).
function scanUrl(origin, sessionId, code) {
  const params = new URLSearchParams({ s: String(sessionId), c: code });
  return `${String(origin).replace(/\/+$/, '')}/scan?${params}`;
}

module.exports = { QR_SECONDS, PREV_QR_SECONDS, CODE_BYTES, newCode, scanUrl };
