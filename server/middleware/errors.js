// errors.js - the last two stops for every request (see app.js).

// No route matched the address.
function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Any error passed to next(err), or thrown inside a route, ends up here.
// Express knows this is the error handler because it takes FOUR arguments.
function errorHandler(err, req, res, next) {
  
  // [ADDED 3a]: bad JSON. When express.json() can't read the body, it passes an
  // error whose err.type is 'entity.parse.failed'. In that case reply
  // 400 { "error": "Invalid JSON" } and stop (return).
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
  }

  // [ADDED 3b]: everything else is our fault, not the user's:
  //   - log the real error with console.error(err) (only the server log sees it)
  //   - reply 500 { "error": "Something went wrong" } (exact words from docs/API.md)
  else {
    console.error({ error: err })
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { notFound, errorHandler };
