/**
 * Projections API — serves the six combined workbooks committed under /projections
 * directly to the client, with the human "agreement" values overlaid on top.
 *   GET  /api/projections                 → full dataset (season + weekly + agreement)
 *   POST /api/projections/reload          → force re-read of the workbooks (admin)
 *   POST /api/projections/agreement       → set one player's agreement value (admin)
 *   GET  /api/projections/agreement/export→ { position: { name: value } } for the pipeline
 * The files are the source of truth for projections; agreementStore is the source
 * of truth for the human input (kept separate so regeneration never wipes it).
 */
import { Router } from 'express';
import { loadProjections, reloadProjections } from '../projections/loadFromRepo.js';
import {
  getAllAgreement,
  setAgreement,
  POSITIONS,
  COLUMNS,
  COLUMN_KEYS,
} from '../projections/agreementStore.js';

export const projectionsRouter = Router();

function requireAdmin(req, res) {
  // Trim both sides: a trailing space/newline in the Render env value (a common
  // paste gotcha) shouldn't make a correctly-typed password fail.
  const expected = (process.env.ADMIN_PASSWORD ?? 'olympus-admin').trim();
  const supplied = (req.get('x-admin-password') ?? '').trim();
  if (supplied !== expected) {
    res.status(401).json({ error: 'unauthorized', message: 'Wrong admin password.' });
    return false;
  }
  return true;
}

/** Attach each player's agreement cell { vlahakis, williams } without mutating the loader cache. */
function withAgreement(dataset) {
  const agree = getAllAgreement();
  return {
    ...dataset,
    agreementColumns: COLUMNS,
    players: dataset.players.map((p) => ({
      ...p,
      agreement: agree[p.position]?.[p.name] ?? {},
    })),
  };
}

projectionsRouter.get('/', (_req, res) => {
  try {
    res.json(withAgreement(loadProjections()));
  } catch (error) {
    console.error('[projections] load failed', error);
    res.status(500).json({ error: 'projections_load_failed', message: String(error?.message ?? error) });
  }
});

projectionsRouter.post('/reload', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const data = reloadProjections();
    res.json({ ok: true, count: data.count, perPosition: data.perPosition, updatedAt: data.updatedAt });
  } catch (error) {
    console.error('[projections] reload failed', error);
    res.status(500).json({ error: 'projections_reload_failed', message: String(error?.message ?? error) });
  }
});

// Lightweight password check so the client can validate at unlock time
// (before the user tries to save) and detect a stale/wrong cached password.
projectionsRouter.get('/agreement/check', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true });
});

projectionsRouter.post('/agreement', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { position, name, column, value, agreement } = req.body ?? {};
  const col = column ?? 'vlahakis'; // back-compat default
  const val = value ?? agreement ?? '';
  if (!POSITIONS.includes(position) || !name || !COLUMN_KEYS.includes(col)) {
    return res.status(400).json({ error: 'bad_request', message: 'position, name and a valid column are required.' });
  }
  try {
    const cell = setAgreement(position, name, col, val);
    res.json({ ok: true, position, name, column: col, agreement: cell });
  } catch (error) {
    console.error('[projections] set agreement failed', error);
    res.status(500).json({ error: 'agreement_save_failed', message: String(error?.message ?? error) });
  }
});

// Read-only export the combine pipeline pulls to fold agreement back into the xlsx.
projectionsRouter.get('/agreement/export', (_req, res) => {
  try {
    res.json(getAllAgreement());
  } catch (error) {
    res.status(500).json({ error: 'agreement_export_failed', message: String(error?.message ?? error) });
  }
});
