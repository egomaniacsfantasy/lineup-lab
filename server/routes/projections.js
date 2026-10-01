/**
 * Projections API — serves the six combined workbooks committed under /projections.
 *   GET  /api/projections         → the model dataset, exactly as the workbooks have it
 *   POST /api/projections/reload  → force re-read of the workbooks (admin)
 *
 * The agreement/consensus layer (per-user scores that tilted a projection) was removed
 * 2026-10-01: no endpoint reads or writes those scores, and nothing here serves them.
 */
import { Router } from 'express';
import { loadProjections, reloadProjections } from '../projections/loadFromRepo.js';
import { invalidateAdjusted } from '../projections/adjusted.js';

export const projectionsRouter = Router();

function requireAdmin(req, res) {
  const expected = (process.env.ADMIN_PASSWORD ?? 'olympus-admin').trim();
  const supplied = (req.get('x-admin-password') ?? '').trim();
  if (supplied !== expected) {
    res.status(401).json({ error: 'unauthorized', message: 'Wrong admin password.' });
    return false;
  }
  return true;
}

projectionsRouter.get('/', async (_req, res) => {
  try {
    res.json(loadProjections());
  } catch (error) {
    console.error('[projections] load failed', error);
    res.status(500).json({ error: 'projections_load_failed', message: String(error?.message ?? error) });
  }
});

projectionsRouter.post('/reload', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const d = reloadProjections();
    invalidateAdjusted(); // pricing picks up the re-read workbooks immediately
    res.json({ ok: true, count: d.count, perPosition: d.perPosition, updatedAt: d.updatedAt });
  } catch (error) {
    console.error('[projections] reload failed', error);
    res.status(500).json({ error: 'projections_reload_failed', message: String(error?.message ?? error) });
  }
});
