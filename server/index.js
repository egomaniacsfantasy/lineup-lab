/**
 * Odds Gods server — serves the built SPA and proxies/caches all league
 * provider traffic. The browser never calls provider APIs directly.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { adminRouter } from './routes/admin.js';
import { assetsRouter } from './routes/assets.js';
import { projectionsRouter } from './routes/projections.js';
import { loadProjections } from './projections/loadFromRepo.js';
import { warmAdjustedProjections } from './projections/adjusted.js';
import { callLog, callsInLastMinute } from './cache.js';
import { isGameWindow } from './gameWindows.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT ?? 8799;

const app = express();
app.use(express.json());

app.use('/api/admin', adminRouter);
app.use('/api/img', assetsRouter);
app.use('/api/projections', projectionsRouter);
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
  // Warm the projections cache on boot so the first request is instant.
  try {
    loadProjections();
  } catch (error) {
    console.error('[projections] boot load failed', error);
  }
  warmAdjustedProjections();
});

// Call-volume heartbeat: Sleeper asks < 1000 calls/min per IP — ours
// aggregates all users, so the rate is logged from day one.
setInterval(() => {
  console.log(
    `[metrics] upstream calls total=${callLog.total} lastMinute=${callsInLastMinute()} gameWindow=${isGameWindow()}`,
  );
}, 5 * 60_000).unref();
