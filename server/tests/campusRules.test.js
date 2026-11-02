const test = require('node:test');
const assert = require('node:assert');
const { validateNewCampus, validateCampusEdit, MAX_NAME, RADIUS_MIN, RADIUS_MAX } = require('../lib/campusRules');

const campus = { name: 'Rangsit', lat: 14.0693, lng: 100.60778, radius_m: 600 };

test('a valid campus is accepted; name is trimmed; numbers may arrive as strings', () => {
  assert.deepEqual(validateNewCampus(campus).value, campus);
  assert.deepEqual(validateNewCampus({ name: ' Rangsit ', lat: '14.0693', lng: '100.60778', radius_m: '600' }).value, campus);
});

test('unknown fields are dropped', () => {
  assert.deepEqual(Object.keys(validateNewCampus({ ...campus, id: 4 }).value).sort(), ['lat', 'lng', 'name', 'radius_m']);
});

test('the edges of lat, lng and radius_m are allowed; one step past each is refused', () => {
  assert.equal(validateNewCampus({ ...campus, lat: 90, lng: 180, radius_m: RADIUS_MAX }).error, undefined);
  assert.equal(validateNewCampus({ ...campus, lat: -90, lng: -180, radius_m: RADIUS_MIN }).error, undefined);
  assert.equal(validateNewCampus({ ...campus, lat: 0, lng: 0 }).error, undefined);
  assert.equal(validateNewCampus({ ...campus, lat: 90.0001 }).error, 'lat must be a number from -90 to 90');
  assert.equal(validateNewCampus({ ...campus, lat: -91 }).error, 'lat must be a number from -90 to 90');
  assert.equal(validateNewCampus({ ...campus, lng: 180.5 }).error, 'lng must be a number from -180 to 180');
  assert.equal(validateNewCampus({ ...campus, lng: -181 }).error, 'lng must be a number from -180 to 180');
  assert.match(validateNewCampus({ ...campus, radius_m: RADIUS_MIN - 1 }).error, /^radius_m/);
  assert.match(validateNewCampus({ ...campus, radius_m: RADIUS_MAX + 1 }).error, /^radius_m/);
  assert.match(validateNewCampus({ ...campus, radius_m: 50.5 }).error, /^radius_m/);
});

test('missing, blank or non-numeric fields are refused', () => {
  assert.equal(validateNewCampus({ ...campus, name: '  ' }).error, 'Campus name is required');
  assert.equal(validateNewCampus({ ...campus, name: 'N'.repeat(MAX_NAME + 1) }).error, 'Campus name is too long');
  assert.match(validateNewCampus({ ...campus, lat: undefined }).error, /^lat/);
  assert.match(validateNewCampus({ ...campus, lat: 'north' }).error, /^lat/);
  assert.match(validateNewCampus({ ...campus, lat: '' }).error, /^lat/);
  assert.match(validateNewCampus({ ...campus, lng: null }).error, /^lng/);
  assert.match(validateNewCampus({ ...campus, lng: Infinity }).error, /^lng/);
  assert.match(validateNewCampus({ ...campus, radius_m: undefined }).error, /^radius_m/);
  assert.equal(validateNewCampus(null).error, 'Campus name is required');
});

test('an edit keeps what it does not mention', () => {
  assert.deepEqual(validateCampusEdit({ radius_m: 300 }, campus).value, { ...campus, radius_m: 300 });
  assert.deepEqual(validateCampusEdit({ name: 'Rangsit 2', lat: 14.1 }, campus).value, { ...campus, name: 'Rangsit 2', lat: 14.1 });
});

test('an edit cannot blank or break a field', () => {
  assert.equal(validateCampusEdit({ name: '' }, campus).error, 'Campus name is required');
  assert.match(validateCampusEdit({ lat: 200 }, campus).error, /^lat/);
  assert.match(validateCampusEdit({ radius_m: 1 }, campus).error, /^radius_m/);
});

test('an empty edit, or one with only unknown fields, is refused', () => {
  assert.equal(validateCampusEdit({}, campus).error, 'Nothing to change');
  assert.equal(validateCampusEdit({ id: 3 }, campus).error, 'Nothing to change');
  assert.equal(validateCampusEdit(undefined, campus).error, 'Nothing to change');
});
