/**
 * _effectiveWeek: price the provider's week, advanced one when the current week's games
 * are all final (or the scoreboard already ticked ahead). Run: `node server/live/weekAdvance.test.mjs`
 */
import { _effectiveWeek } from './nflGameStatus.js';

let failures = 0;
const check = (name, got, want) => { const ok = got === want; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}  (got ${got}, want ${want})`); if (!ok) failures += 1; };

const now = Date.now();
// Cold start: scoreboard never read -> trust provider week.
check('cold start (at=0) does not advance', _effectiveWeek(1, { week: null, states: [], at: 0 }), 1);
// Week 1 in progress (some games live/scheduled) -> hold.
check('week in progress holds', _effectiveWeek(1, { week: 1, states: ['post', 'in', 'pre'], at: now }), 1);
// Thursday done only -> hold.
check('only TNF final holds', _effectiveWeek(1, { week: 1, states: ['post', 'pre', 'pre'], at: now }), 1);
// Week 1 fully final (MNF ended) -> advance to 2.
check('week fully final advances +1', _effectiveWeek(1, { week: 1, states: ['post', 'post', 'post'], at: now }), 2);
// Scoreboard already ticked to week 2 (pre games) while provider still says 1 -> follow to 2.
check('scoreboard ticked ahead advances', _effectiveWeek(1, { week: 2, states: ['pre', 'pre'], at: now }), 2);
// No games listed (bye-only / empty) -> hold.
check('empty states holds', _effectiveWeek(3, { week: 3, states: [], at: now }), 3);
// Never advance more than one beyond provider (scoreboard wildly ahead -> ignore).
check('does not jump multiple weeks', _effectiveWeek(1, { week: 5, states: ['pre'], at: now }), 1);
// Cap at 18.
check('caps at 18', _effectiveWeek(18, { week: 18, states: ['post'], at: now }), 18);
// Mid-season complete week advances.
check('mid-season complete advances', _effectiveWeek(6, { week: 6, states: ['post', 'post'], at: now }), 7);

console.log(`\n${failures === 0 ? 'ALL WEEK-ADVANCE INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
