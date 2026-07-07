/**
 * Projections API — serves the six combined workbooks committed under /projections,
 * with (a) the legacy named-column agreement overlay and (b) the new public
 * consensus overlay (average of all per-user scores from Supabase).
 *   GET  /api/projections                 → dataset + agreement (legacy) + consensus (new)
 *   POST /api/projections/reload          → force re-read of the workbooks (admin)
 *   POST /api/projections/agreement       → set one player's legacy agreement value (admin)
 *   GET  /api/projections/agreement/export→ legacy { position: { name: value } } for the pipeline
 */
import { Router } from 'express';
import { loadProjections, reloadProjections } from '../projections/loadFromRepo.js';
import { getAllAgreement, setAgreement, POSITIONS, COLUMNS, COLUMN_KEYS } from '../projections/agreementStore.js';
import { getSupabaseAdmin } from '../services/supabaseAdmin.js';

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

// --- Public consensus: the average agreement score per player across ALL users,
// read with the service role (bypasses RLS) and aggregated so individual scores
// never leave the server. Cached briefly so we don't hit the DB every request. ---
let _consensusCache = { at: 0, data: {} };
async function getConsensus() {
  const now = Date.now();
  if (now - _consensusCache.at < 30_000) return _consensusCache.data;
  const admin = getSupabaseAdmin();
  if (!admin) {
    _consensusCache = { at: now, data: {} };
    return {};
  }
  const { data, error } = await admin.from('olympus_agreement').select('position, player, score');
  if (error) {
    // Table may not exist yet (migration not applied) — fail soft, no consensus.
    console.error('[projections] consensus read failed:', error.message ?? error);
    _consensusCache = { at: now, data: _consensusCache.data };
    return _consensusCache.data;
  }
  const acc = {}; // position -> player -> { sum, n }
  for (const row of data ?? []) {
    const s = Number(row.score);
    if (!Number.isFinite(s)) continue;
    (acc[row.position] ??= {});
    (acc[row.position][row.player] ??= { sum: 0, n: 0 });
    acc[row.position][row.player].sum += s;
    acc[row.position][row.player].n += 1;
  }
  const out = {};
  for (const pos of Object.keys(acc)) {
    out[pos] = {};
    for (const pl of Object.keys(acc[pos])) {
      const { sum, n } = acc[pos][pl];
      out[pos][pl] = { avg: Math.round((sum / n) * 100) / 100, n };
    }
  }
  _consensusCache = { at: now, data: out };
  return out;
}

projectionsRouter.get('/', async (_req, res) => {
  try {
    const dataset = loadProjections();
    const agree = getAllAgreement();
    const consensus = await getConsensus();
    res.json({
      ...dataset,
      agreementColumns: COLUMNS, // legacy named columns (still consumed by current UI)
      players: dataset.players.map((p) => ({
        ...p,
        agreement: agree[p.position]?.[p.name] ?? {},
        // { avg, n } across all voters, or null if nobody has scored this player.
        consensus: consensus[p.position]?.[p.name] ?? null,
      })),
    });
  } catch (error) {
    console.error('[projections] load failed', error);
    res.status(500).json({ error: 'projections_load_failed', message: String(error?.message ?? error) });
  }
});

projectionsRouter.post('/reload', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const d = reloadProjections();
    res.json({ ok: true, count: d.count, perPosition: d.perPosition, updatedAt: d.updatedAt });
  } catch (error) {
    console.error('[projections] reload failed', error);
    res.status(500).json({ error: 'projections_reload_failed', message: String(error?.message ?? error) });
  }
});

// --- Legacy admin agreement endpoints (kept until the per-user UI ships). ---
projectionsRouter.get('/agreement/check', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true });
});

projectionsRouter.post('/agreement', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { position, name, column, value, agreement } = req.body ?? {};
  const col = column ?? 'vlahakis';
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

projectionsRouter.get('/agreement/export', (_req, res) => {
  try {
    res.json(getAllAgreement());
  } catch (error) {
    res.status(500).json({ error: 'agreement_export_failed', message: String(error?.message ?? error) });
  }
});
