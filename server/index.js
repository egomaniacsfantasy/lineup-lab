/**
 * Odds Gods server — serves the built SPA and proxies/caches all league
 * provider traffic. The browser never calls provider APIs directly.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { corsMiddleware } from './cors.js';
import { adminRouter } from './routes/admin.js';
import { assetsRouter } from './routes/assets.js';
import { projectionsRouter } from './routes/projections.js';
import { supportRouter } from './routes/support.js';
import { loadProjections } from './projections/loadFromRepo.js';
import { warmAdjustedProjections } from './projections/adjusted.js';
import { startRepriceScheduler } from './scheduler.js';
import { callLog, callsInLastMinute } from './cache.js';
import { isGameWindow } from './gameWindows.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT ?? 8799;

const app = express();

/* One proxy hop, which is what Render puts in front of a web service. Without
   this req.ip is the proxy's address for every request, so the per-IP limiter
   below counts the entire internet as one visitor and starts refusing real
   people during precisely the spike it exists to survive. A limiter with the
   wrong key is worse than no limiter. */
app.set('trust proxy', 1);

/* Mounted before every /api route and before any body parser, so a preflight is
   answered whatever the route would have done. Localhost is allowed off
   production only: in development the site runs on a Vite port and the API on
   another, which is the same cross-origin situation the CDN split creates, so
   this is exercised every day rather than only after a deploy. */
app.use('/api', corsMiddleware({ allowLocalhost: process.env.NODE_ENV !== 'production' }));

/* Ahead of the shared parser on purpose. express.json() defaults to a 100KB
   limit and, mounted app-wide, it reads and rejects the body before the route
   is ever chosen — so a support router carrying its own larger limit further
   down would never see one. Every bug report with a screenshot is over 100KB,
   which made this the difference between the feature working and the feature
   failing on exactly the reports worth having. Anything else needing a body
   larger than the default has to be mounted up here too. */
app.use('/api/support', supportRouter);

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

/* Vite fingerprints everything under /assets, so those files can never change
   without changing name and are safe to cache forever. Served with no cache
   policy they were revalidated on every load, which put a round trip to this
   instance in front of every repeat visit. On one small box that shares its
   CPU with the pricing sim, those round trips are the difference between a page
   that paints and a page that hangs. */
app.use(
  '/assets',
  express.static(path.join(DIST, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }),
);

/* Everything else in dist is unfingerprinted (the logo, the favicon, the
   privacy page), so it gets a short cache rather than a permanent one.

   index: false, and HTML forced to no-cache: the shell is what names the
   current asset hashes, so caching it for an hour pins a browser to a build
   whose files may already be gone. The static middleware answers "/" with
   index.html before the route below ever runs, which is how it picked up the
   one-hour policy meant for images. */
app.use(
  express.static(DIST, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

app.get(/.*/, (req, res) => {
  /* A request for a file that is not there must fail as a file.

     This used to hand back index.html for ANY unmatched path, so a missing or
     renamed asset answered a request for a PNG with HTML and a 200. Browsers
     render that as a broken image, and because it is a 200 there is no 404 in
     any log to find: the picture is simply gone and nothing says why. That is
     also what makes it survive in a cache, since a 200 is a cacheable success.

     Anything whose last path segment carries an extension is a file request.
     Client routes have no extension, so the shell is still served for them. */
  if (/\.[a-zA-Z0-9]+$/.test(req.path.split('/').pop() ?? '')) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }

  /* The shell must never be cached: it is what points at the current asset
     hashes, and a stale copy pins a browser to a build that no longer exists. */
  res.set('Cache-Control', 'no-cache');
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
