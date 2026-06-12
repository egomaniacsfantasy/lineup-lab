/**
 * Owner-only projections admin. Protected by ADMIN_PASSWORD (env var) —
 * single shared secret, no user system in v1. A Tuesday update should
 * take under two minutes: drop file, resolve unmatched, confirm.
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import {
  buildProjections,
  crosswalk,
  parseFrancoWorkbooks,
  parseWorkbook,
} from '../projections/importer.js';
import {
  activateVersion,
  getConfirmedMatches,
  listVersions,
  rememberMatches,
  saveVersion,
} from '../projections/store.js';
import { sleeperProvider } from '../providers/sleeperProvider.js';
import { invalidate } from '../cache.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'olympus-admin';
if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    '[admin] ADMIN_PASSWORD env var not set — using the dev default. Set it in production.',
  );
}

// Pending previews held in memory until confirmed (10 most recent).
const pending = new Map();

function nextVersionName() {
  const today = new Date().toISOString().slice(0, 10);
  const existing = listVersions().versions.filter((v) => v.version.startsWith(`franco-${today}`));
  return existing.length > 0 ? `franco-${today}-${existing.length + 1}` : `franco-${today}`;
}

function requireAdmin(req, res, next) {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'unauthorized', message: 'Wrong admin password.' });
    return;
  }
  next();
}

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/projections', (_req, res) => {
  res.json(listVersions());
});

adminRouter.post('/projections/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'no_file', message: 'Attach an XLSX file.' });
      return;
    }

    const pointsAre = req.body.pointsAre === 'full-season' ? 'full-season' : 'per-game';
    const scoringBasis = req.body.scoringBasis ?? 'ppr';

    const { tabs, rows } = parseWorkbook(req.file.buffer, { pointsAre });
    const catalog = await sleeperProvider.getPlayerCatalog();
    const { matched, unmatched } = crosswalk(rows, catalog, getConfirmedMatches());

    const pendingId = crypto.randomUUID();
    pending.set(pendingId, { matched, unmatched, pointsAre, scoringBasis });
    if (pending.size > 10) pending.delete(pending.keys().next().value);

    res.json({
      pendingId,
      tabs,
      totalRows: rows.length,
      matchedCount: matched.length,
      unmatched: unmatched.map(({ key, name, team, position, candidates }) => ({
        key,
        name,
        team,
        position,
        candidates,
      })),
      pointsAre,
      scoringBasis,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/projections/confirm', (req, res, next) => {
  try {
    const { pendingId, resolutions = {} } = req.body;
    const entry = pending.get(pendingId);

    if (!entry) {
      res.status(404).json({
        error: 'preview_expired',
        message: 'That preview expired — upload the file again.',
      });
      return;
    }

    const resolvedRows = [];
    const newConfirmed = {};
    let skipped = 0;

    for (const u of entry.unmatched) {
      const playerId = resolutions[u.key];
      if (playerId) {
        resolvedRows.push({ ...u.row, playerId, matchType: 'reviewed' });
        newConfirmed[u.key] = playerId;
      } else {
        skipped += 1;
      }
    }

    if (Object.keys(newConfirmed).length > 0) {
      rememberMatches(newConfirmed);
    }

    const version = nextVersionName();

    const projections = buildProjections([...entry.matched, ...resolvedRows], {
      source: version,
      scoringBasis: entry.scoringBasis,
    });

    saveVersion(version, projections, {
      scoringBasis: entry.scoringBasis,
      pointsAre: entry.pointsAre,
      skippedUnmatched: skipped,
    });

    pending.delete(pendingId);
    invalidate('pricing:'); // all lines recompute against the new version

    res.json({ version, count: projections.length, skippedUnmatched: skipped, active: true });
  } catch (error) {
    next(error);
  }
});

/**
 * One-shot import for Franco's combined-format files (all six positions
 * in one drop). No preview/confirm round-trip: exact + previously
 * confirmed matches import immediately, unmatched are reported back —
 * never silently guessed.
 */
adminRouter.post('/projections/import-franco', upload.array('files', 8), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      res.status(400).json({ error: 'no_files', message: 'Attach the position XLSX files.' });
      return;
    }

    // owner-confirmed crosswalk picks from a prior attempt's unmatched list
    let resolutions = {};
    try {
      resolutions = JSON.parse(req.body?.resolutions ?? '{}');
    } catch {
      resolutions = {};
    }
    if (Object.keys(resolutions).length > 0) rememberMatches(resolutions);

    const { tabs, rows } = parseFrancoWorkbooks(
      req.files.map((f) => ({ name: f.originalname, buffer: f.buffer })),
    );
    const catalog = await sleeperProvider.getPlayerCatalog();
    const { matched, unmatched } = crosswalk(rows, catalog, getConfirmedMatches());

    const version = nextVersionName();
    const projections = buildProjections(matched, { source: version, scoringBasis: 'ppr' });

    saveVersion(version, projections, {
      scoringBasis: 'ppr',
      pointsAre: 'per-game',
      format: 'franco-combined',
      files: tabs,
      skippedUnmatched: unmatched.length,
    });
    invalidate('pricing:');

    res.json({
      version,
      active: true,
      count: projections.length,
      tabs,
      unmatched: unmatched.map(({ key, name, team, position, candidates }) => ({
        key,
        name,
        team,
        position,
        candidates,
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/projections/activate', (req, res, next) => {
  try {
    activateVersion(req.body.version);
    invalidate('pricing:');
    res.json({ ok: true, active: req.body.version });
  } catch (error) {
    next(error);
  }
});
