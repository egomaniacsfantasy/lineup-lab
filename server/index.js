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
import { startRepriceScheduler } from './scheduler.js';
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

/* Every failure in here used to come out as one sentence: "The league provider
   did not respond." That is a diagnosis, and it was wrong about half the time —
   a TypeError in our own mapping code is not the provider failing to answer,
   and reporting it that way sends whoever is debugging to look at Sleeper's
   status page instead of at us. It also threw the message away, so a bug that
   only reproduces in production could not be read from production.

   So: say which of the two it is, and carry the detail. Provider errors are of
   the form "Sleeper /league/x responded 500" and contain no secrets; league ids
   and usernames in them are values the client already sent. */
const UPSTREAM = /responded \d{3}|fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|aborted/i;

app.use('/api', (error, req, res, _next) => {
  const detail = error instanceof Error ? error.message : String(error);
  const isUpstream = UPSTREAM.test(detail);
  console.error('[api]', req.method, req.originalUrl, '->', detail, error?.stack ?? '');
  res.status(isUpstream ? 502 : 500).json({
    error: isUpstream ? 'upstream_error' : 'server_error',
    message: isUpstream
      ? 'The league provider did not respond. Try again in a minute.'
      : 'Something on our side broke loading that league.',
    detail,
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
  // Keep league futures charts fed with a 6-hourly reprice snapshot.
  startRepriceScheduler();
});

// Call-volume heartbeat: Sleeper asks < 1000 calls/min per IP — ours
// aggregates all users, so the rate is logged from day one.
setInterval(() => {
  console.log(
    `[metrics] upstream calls total=${callLog.total} lastMinute=${callsInLastMinute()} gameWindow=${isGameWindow()}`,
  );
}, 5 * 60_000).unref();
