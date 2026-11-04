const test = require('node:test');
const assert = require('node:assert');
const { INT_MAX, toInt } = require('../lib/fields');

// toInt is what every route uses to read an id from the URL (/api/users/:id and the rest).
// null means "answer 404 without asking the database".

test('a normal id, as a number or as URL text, is accepted', () => {
  assert.equal(toInt(7), 7);
  assert.equal(toInt('7'), 7);
  assert.equal(toInt('2147483647'), INT_MAX);
});

test('an id above INT_MAX is refused, so Postgres never sees it (it would answer error 22003, a 500)', () => {
  assert.equal(toInt('2147483648'), null);
  assert.equal(toInt('99999999999'), null);
  assert.equal(toInt(INT_MAX + 1), null);
});

test('zero, negatives, decimals and text are refused', () => {
  for (const bad of ['0', '-1', '1.5', 'abc', '', ' ', '1e3x', 'NaN', 'Infinity', undefined, null, {}, [], true]) {
    assert.equal(toInt(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});
