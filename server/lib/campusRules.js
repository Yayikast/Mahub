// Field rules for POST /api/campuses and PUT /api/campuses/:id (docs/API.md, section 2: Campuses).
// Pure: no database. The limits match the CHECKs in db/schema.sql.
// Both functions return { error } or { value }, where value holds { name, lat, lng, radius_m }.

const { text, toInt, toNumber } = require('./fields');

const FIELDS = ['name', 'lat', 'lng', 'radius_m'];
const MAX_NAME = 100;
const RADIUS_MIN = 10;
const RADIUS_MAX = 5000;

function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of FIELDS) {
    if (!(key in r)) continue;
    if (key === 'name') out.name = text(r.name);
    else if (key === 'radius_m') out.radius_m = toInt(r.radius_m, RADIUS_MIN, RADIUS_MAX);
    else out[key] = toNumber(r[key]);
  }
  return out;
}

function check(campus) {
  if (!campus.name) return 'Campus name is required';
  if (campus.name.length > MAX_NAME) return 'Campus name is too long';
  if (campus.lat === null || campus.lat < -90 || campus.lat > 90) return 'lat must be a number from -90 to 90';
  if (campus.lng === null || campus.lng < -180 || campus.lng > 180) return 'lng must be a number from -180 to 180';
  if (campus.radius_m === null) return `radius_m must be a whole number from ${RADIUS_MIN} to ${RADIUS_MAX}`;
  return null;
}

function validateNewCampus(body) {
  const campus = { name: '', lat: null, lng: null, radius_m: null, ...clean(body) };
  const error = check(campus);
  return error ? { error } : { value: campus };
}

// current: the row as it is now ({ name, lat, lng, radius_m }).
function validateCampusEdit(body, current) {
  const changes = clean(body);
  if (Object.keys(changes).length === 0) return { error: 'Nothing to change' };
  const campus = { name: current.name, lat: current.lat, lng: current.lng, radius_m: current.radius_m, ...changes };
  const error = check(campus);
  return error ? { error } : { value: campus };
}

module.exports = { MAX_NAME, RADIUS_MIN, RADIUS_MAX, validateNewCampus, validateCampusEdit };
