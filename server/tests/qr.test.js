const test = require('node:test');
const assert = require('node:assert');
const { QR_SECONDS, PREV_QR_SECONDS, CODE_BYTES, newCode, scanUrl } = require('../lib/qr');
const { validateOpenSession } = require('../lib/sessionRules');

test('a code is 6 lowercase hex characters, and two codes differ', () => {
  assert.equal(CODE_BYTES * 2, 6);
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const c = newCode();
    assert.match(c, /^[0-9a-f]{6}$/);
    codes.add(c);
  }
  assert.ok(codes.size > 190, 'codes should not repeat');
});

test('the code changes every 5 seconds', () => {
  assert.equal(QR_SECONDS, 5);
});

test('the code that was just replaced still works for 10 more seconds', () => {
  assert.equal(PREV_QR_SECONDS, 10);
});

test('scanUrl builds /scan?s=<session>&c=<code> on the given origin', () => {
  assert.equal(scanUrl('https://mahub.example.com', 12, 'ab39f2'), 'https://mahub.example.com/scan?s=12&c=ab39f2');
  assert.equal(scanUrl('http://localhost:5173/', 3, '00ff00'), 'http://localhost:5173/scan?s=3&c=00ff00');
  assert.equal(scanUrl('https://x.test///', 3, 'ab'), 'https://x.test/scan?s=3&c=ab');
});

test('scanUrl encodes anything that is not a plain code', () => {
  assert.equal(scanUrl('https://x.test', 1, 'a&b=c'), 'https://x.test/scan?s=1&c=a%26b%3Dc');
});

test('opening a session needs a campus_id that is a positive whole number', () => {
  assert.deepEqual(validateOpenSession({ campus_id: 1 }), { value: { campus_id: 1 } });
  assert.deepEqual(validateOpenSession({ campus_id: '2' }), { value: { campus_id: 2 } });
  assert.deepEqual(validateOpenSession({ campus_id: 1, section_id: 9 }), { value: { campus_id: 1 } });
  for (const body of [undefined, null, {}, { campus_id: 0 }, { campus_id: -1 }, { campus_id: 1.5 }, { campus_id: 'x' }, { campus_id: null }, { campus_id: [1] }, { room_id: 1 }]) {
    assert.deepEqual(validateOpenSession(body), { error: 'Choose a campus' }, JSON.stringify(body));
  }
});
