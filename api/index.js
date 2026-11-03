// Vercel runs every file in api/ as a function. This one hands each request to the Express app;
// vercel.json sends /api/*, /auth/* and /scan here. On a laptop, server/server.js runs the same app.
module.exports = require('../server/app');
