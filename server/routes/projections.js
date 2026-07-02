/**
 * Projections API — serves the six combined workbooks committed under /projections
 * directly to the client. No upload, no crosswalk: the files are the source of truth.
 *   GET  /api/projections            → full dataset (every player, season + weekly)
 *   POST /api/projections/reload     → force re-read from disk (admin-gated)
 * The reload lets an operator refresh mid-season the instant new files land,
 * without waiting on a Render redeploy.
 */
import { Router } from 'express';
import { loadProjections, reloadProjections } from '../projections/loadFromRepo.js';

export const projectionsRouter = Router();

projectionsRouter.get('/', (_req, res) => {
  try {
    res.json(loadProjections());
  } catch (error) {
    console.error('[projections] load failed', error);
    res.status(500).json({ error: 'projections_load_failed', message: String(error?.message ?? error) });
  }
});

projectionsRouter.post('/reload', (req, res) => {
  const supplied = req.get('x-admin-password') ?? '';
  if (process.env.ADMIN_PASSWORD && supplied !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const data = reloadProjections();
    res.json({ ok: true, count: data.count, perPosition: data.perPosition, updatedAt: data.updatedAt });
  } catch (error) {
    console.error('[projections] reload failed', error);
    res.status(500).json({ error: 'projections_reload_failed', message: String(error?.message ?? error) });
  }
});
