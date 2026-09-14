/**
 * applyLiveLocks must lock ONLY the current week (zero variance = actual score) and
 * leave every FUTURE week projecting normally with full variance. The old version
 * zeroed the global stdev, flattening a finished player's rest-of-season variance --
 * which, once nearly everyone has played, made the season sim near-deterministic and
 * inflated the stronger teams' playoff/title odds (a team could even rise after losing).
 * Run: `node server/engine/liveLockVariance.test.mjs`
 */
import { applyLiveLocks, teamDistribution, simulateSeason, computeInputsHash } from './engine.js';

let failures = 0;
const check = (name, pass, detail = '') => { console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`); if (!pass) failures += 1; };

// ---- Unit: a locked player keeps future-week variance -------------------
{
  const catalog = { z: { position: 'WR', name: 'Zeus' } };
  const weekly = {}; const weeklyCI = {};
  for (let w = 1; w <= 18; w += 1) { weekly[String(w)] = 15; weeklyCI[String(w)] = { floor: 10, ceiling: 20 }; }
  const proj = { playerId: 'z', position: 'WR', mean: 15, stdev: 5, weekly, weeklyCI };
  const pmap = new Map([['z', proj]]);

  applyLiveLocks(pmap, { z: 27.3 }, 1); // he already played week 1, scored 27.3

  // Current week: locked to the actual, zero variance.
  const cur = teamDistribution(['z'], pmap, catalog, 1);
  check('current week mean == actual score (27.3)', Math.abs(cur.mean - 27.3) < 1e-9, `(got ${cur.mean})`);
  check('current week variance == 0 (locked)', cur.sigma === 0, `(sigma ${cur.sigma})`);

  // Future weeks: normal projection WITH variance (the bug zeroed this).
  for (const fw of [2, 8, 15]) {
    const fut = teamDistribution(['z'], pmap, catalog, fw);
    check(`week ${fw} keeps its projection (mean ~15)`, Math.abs(fut.mean - 15) < 1e-9, `(mean ${fut.mean})`);
    check(`week ${fw} keeps FULL variance (sigma > 0)`, fut.sigma > 0, `(sigma ${fut.sigma})`);
  }

  // The global stdev must NOT have been mutated to 0.
  check('global stdev untouched (still 5)', pmap.get('z').stdev === 5, `(stdev ${pmap.get('z').stdev})`);
}

// ---- Season: locking finished players must NOT collapse the title race ---
// Build a competitive league, lock EVERY player's current week to their projection
// (simulating "everyone played"), and confirm the championship is still spread across
// teams (variance preserved) rather than handed near-100% to one team (the old bug).
{
  const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
  const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN'];
  const REG_WEEKS = 14;
  const catalog = {}; const projections = []; let uid = 0;
  const P = (position, ppg) => {
    const id = `p${uid++}`;
    catalog[id] = { position, name: `${position}${id}` };
    const weekly = {}; const weeklyCI = {};
    for (let w = 1; w <= 18; w += 1) { weekly[String(w)] = ppg; weeklyCI[String(w)] = { floor: ppg * 0.6, ceiling: ppg * 1.4 }; }
    projections.push({ playerId: id, position, mean: ppg, stdev: ppg * 0.4, weekly, weeklyCI });
    return id;
  };
  const buildTeam = (rosterId, isUser, scale) => {
    const players = [P('QB', 20 * scale), P('RB', 16 * scale), P('RB', 12 * scale), P('WR', 15 * scale),
      P('WR', 11 * scale), P('TE', 9 * scale), P('K', 8 * scale), P('DEF', 8 * scale), P('RB', 7 * scale), P('WR', 6 * scale)];
    return { rosterId, teamName: `T${rosterId}`, isUser, players, starters: players.slice(0, 10), record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0 };
  };
  // Four CLOSE teams (scales 1.03..0.97) so no one should dominate if variance is intact.
  const teams = [buildTeam(1, true, 1.03), buildTeam(2, false, 1.01), buildTeam(3, false, 0.99), buildTeam(4, false, 0.97)];
  const MATCHINGS = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
  const scheduleWeeks = [];
  for (let w = 1; w <= REG_WEEKS; w += 1) {
    const m = MATCHINGS[w % 3]; const matchups = [];
    m.forEach((pair, pi) => pair.forEach((rid) => matchups.push({ rosterId: rid, matchupId: w * 10 + pi })));
    scheduleWeeks.push({ week: w, matchups });
  }
  const seed = parseInt(computeInputsHash({ projectionVersion: 'llv', teams, week: 1, overlay: null }).slice(0, 8), 16);
  const league = { rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS, playoffWeekStart: REG_WEEKS + 1, playoffTeams: 2, lastScoredWeek: 0 };

  const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
  // Lock EVERY player's week-1 to their projected value (stands in for "already played").
  const locks = {}; for (const p of projections) locks[p.playerId] = p.mean;
  applyLiveLocks(projectionMap, locks, 1);

  const res = simulateSeason({ league, teams, scheduleWeeks, week: 1, projectionMap, catalog, slotLabels: SLOTS, seed });
  const maxTitle = Math.max(...res.map((r) => r.titleProb));
  const minTitle = Math.min(...res.map((r) => r.titleProb));
  check('title race NOT collapsed to one team (variance preserved)', maxTitle < 85, `(max title ${maxTitle.toFixed(1)}%)`);
  check('every close team keeps a real title chance', minTitle > 3, `(min title ${minTitle.toFixed(1)}%)`);
  check('title% sums to ~100', Math.abs(res.reduce((a, r) => a + r.titleProb, 0) - 100) < 1.0);
}

console.log(`\n${failures === 0 ? 'ALL LIVE-LOCK VARIANCE INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
