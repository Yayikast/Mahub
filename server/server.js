// server.js - starts the app on your laptop only.
// On Vercel there is no listen: Vercel imports app.js itself (see api/index.js).
const app = require('./app');

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Mahub API on http://localhost:${PORT}`));
