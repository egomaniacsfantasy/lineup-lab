/**
 * Olympus server — serves the built SPA and proxies/caches all league
 * provider traffic. The browser never calls provider APIs directly.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT ?? 8799;

const app = express();
app.use(express.json());

app.use('/api', apiRouter);

app.use('/api', (error, _req, res, _next) => {
  console.error('[api]', error);
  res.status(502).json({
    error: 'upstream_error',
    message: 'The league provider did not respond. Try again in a minute.',
  });
});

app.use(express.static(DIST));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[olympus] server on :${PORT}`);
});
