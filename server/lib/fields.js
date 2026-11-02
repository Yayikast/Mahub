// Small helpers the rules files share. Pure: no database.

const INT_MAX = 2147483647; // the largest value an INT column holds

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

// A whole number from min to max, given as a number or as digits in a string. Anything else is null.
function toInt(v, min = 1, max = INT_MAX) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Any finite number, given as a number or as a numeric string. Anything else is null.
function toNumber(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

module.exports = { INT_MAX, text, toInt, toNumber };
