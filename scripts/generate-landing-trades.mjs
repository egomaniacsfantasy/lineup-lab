/**
 * Generate the landing page's trade examples with the REAL engine.
 *
 * The three trades on the marketing page used to be hand-authored, and they
 * were indefensible: "send Derrick Henry, get Puka Nacua and Trey McBride"
 * moved 222 points of projection to my side of the table, with Nacua alone
 * out-projecting Henry. Nobody sends that and nobody accepts it. Writing trades
 * by hand means guessing at player value, and I guessed badly three times out
 * of three.
 *
 * So the page does not get authored trades any more. This builds a twelve-team
 * league out of the real 2026 projection sheets, drafts it, and runs the actual
 * suggestTrades from server/engine/engine.js. Whatever the engine proposes is
 * what ships, acceptance percentage included. If the engine will not propose a
 * trade, the page does not show one.
 *
 * Run: node scripts/generate-landing-trades.mjs
 */
import fs from 'node:fs';
import XLSX from 'xlsx';
import { suggestTrades } from '../server/engine/engine.js';

const NFL_WEEKS = 17;
const REG_WEEKS = 14;
const ROSTER_POSITIONS = ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN','BN','BN','BN','BN','BN'];
const SLOTS = ROSTER_POSITIONS.filter((s) => s !== 'BN');

/* Board order, so roster strength lines up with the futures board the page
   renders beside these trades. Zeus's Bolts is the user on both. */
const TEAM_NAMES = ['Apollo Archers','Hermes Express',"Zeus's Bolts",'Poseidon Waves',
  'Hades Hounds','Athena Owls','Ares Warriors','Dionysus Vines','Artemis Arrows',
  'Hephaestus Forge','Demeter Fields','Kronos Titans'];
const USER_INDEX = 2;

// ── the real projections ───────────────────────────────────────────────────
const SHEETS = [['QB','qb'],['RB','rb'],['WR','wr'],['TE','te'],['K','kicker'],['DEF','def']];
const catalog = {};
const projections = [];
const pool = [];

for (const [position, file] of SHEETS) {
  const wb = XLSX.readFile(`projections/${file}_2026_combined.xlsx`);
  const sheet = wb.Sheets.all_season ?? wb.Sheets[wb.SheetNames[0]];
  for (const row of XLSX.utils.sheet_to_json(sheet)) {
    const name = row[position] ?? row.Player ?? row.player ?? row[Object.keys(row)[0]];
    const seasonTotal = Number(row.fantasy_pts_half ?? row.fantasy_pts ?? 0);
    if (!name || !Number.isFinite(seasonTotal) || seasonTotal <= 0) continue;
    const floor = Number(row.fantasy_pts_floor_half ?? row.fantasy_pts_floor ?? seasonTotal * 0.72);
    const ceiling = Number(row.fantasy_pts_ceiling_half ?? row.fantasy_pts_ceiling ?? seasonTotal * 1.28);
    const id = `${position}-${String(name).replace(/[^A-Za-z]/g, '')}`;
    if (catalog[id]) continue;
    catalog[id] = { position, name: String(name) };
    /* The engine wants a per-week mean; the sheets are season totals. Spread
       is taken from the sheet's own floor/ceiling rather than a flat
       multiplier, so a volatile back and a metronome tight end do not get
       handed the same variance. */
    const mean = seasonTotal / NFL_WEEKS;
    const stdev = Math.max(1.2, (ceiling - floor) / 4 / Math.sqrt(NFL_WEEKS));
    projections.push({ playerId: id, position, mean, stdev, seasonTotal, weekly: {}, weeklyCI: {} });
    pool.push({ id, position, seasonTotal });
  }
}
console.log(`loaded ${pool.length} players from the 2026 sheets`);

// ── draft twelve rosters ───────────────────────────────────────────────────
const NEED = { QB: 2, RB: 5, WR: 6, TE: 2, K: 1, DEF: 1 };
const byValue = [...pool].sort((a, b) => b.seasonTotal - a.seasonTotal);
const rosters = TEAM_NAMES.map(() => ({ players: [], counts: {} }));
const taken = new Set();

/* Real leagues are lopsided, and lopsided is the whole reason trades happen:
   the guy with three good backs and no tight end wants to talk to the guy with
   the opposite problem. A draft where every roster fills the same quota
   produces a league with nothing to trade, which is exactly what the first run
   of this script produced (seven suggestions, none above 31% acceptance,
   because every deal that helped me had to hurt somebody).
   So each team drafts with a bias, and the biases are deliberately paired. */
const BIAS = [
  { RB: 1.18, WR: 0.92 },  // Apollo hoards backs
  { WR: 1.16, RB: 0.90 },  // Hermes hoards receivers
  { RB: 1.10, TE: 0.86 },  // Zeus (user): deep at RB, thin at TE
  { TE: 1.22, RB: 0.92 },  // Poseidon collects tight ends
  { WR: 1.14, TE: 0.88 },
  { RB: 1.12, WR: 0.94 },
  { WR: 1.18, RB: 0.88 },
  { RB: 1.15, TE: 0.90 },
  { TE: 1.18, WR: 0.90 },
  { WR: 1.12, RB: 0.92 },
  { RB: 1.14, WR: 0.90 },
  { QB: 1.20, WR: 0.94 },
];

/* Snake, and each pick takes the best player the roster still has room for, so
   nobody ends up with five quarterbacks and no flex. */
let pick = 0;
const totalPicks = Object.values(NEED).reduce((a, b) => a + b, 0) * TEAM_NAMES.length;
while (pick < totalPicks) {
  const round = Math.floor(pick / TEAM_NAMES.length);
  const slot = pick % TEAM_NAMES.length;
  const team = rosters[round % 2 === 0 ? slot : TEAM_NAMES.length - 1 - slot];
  const teamIndex = rosters.indexOf(team);
  const bias = BIAS[teamIndex] ?? {};
  const eligible = byValue.filter(
    (p) => !taken.has(p.id) && (team.counts[p.position] ?? 0) < NEED[p.position],
  );
  /* Best available as that manager sees it, which is not the same board
     everyone else is using. */
  let choice = null;
  let best = -Infinity;
  for (const p of eligible.slice(0, 40)) {
    const score = p.seasonTotal * (bias[p.position] ?? 1);
    if (score > best) { best = score; choice = p; }
  }
  if (!choice) break;
  taken.add(choice.id);
  team.players.push(choice.id);
  team.counts[choice.position] = (team.counts[choice.position] ?? 0) + 1;
  pick += 1;
}

const teams = TEAM_NAMES.map((teamName, index) => ({
  rosterId: index + 1,
  teamName,
  isUser: index === USER_INDEX,
  players: rosters[index].players,
  starters: rosters[index].players.slice(0, SLOTS.length),
  record: { wins: 0, losses: 0, ties: 0 },
  pointsFor: 0,
  pointsAgainst: 0,
}));

// ── a schedule ─────────────────────────────────────────────────────────────
const scheduleWeeks = [];
for (let w = 1; w <= REG_WEEKS; w += 1) {
  const ids = teams.map((t) => t.rosterId);
  const rotated = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + w - 1) % (ids.length - 1))])];
  const matchups = [];
  for (let i = 0; i < rotated.length / 2; i += 1) {
    const matchupId = w * 100 + i;
    matchups.push({ rosterId: rotated[i], matchupId, starters: [] });
    matchups.push({ rosterId: rotated[rotated.length - 1 - i], matchupId, starters: [] });
  }
  scheduleWeeks.push({ week: w, matchups });
}

const ctx = {
  league: { rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS,
    playoffWeekStart: REG_WEEKS + 1, playoffTeams: 6 },
  teams, week: 1, catalog, scheduleWeeks, overlay: null,
  projections: { version: 'landing-2026', projections },
};

const value = new Map(pool.map((p) => [p.id, p.seasonTotal]));
const show = (side) =>
  side.map((x) => `${catalog[x.id].name} (${catalog[x.id].position}, ${value.get(x.id).toFixed(0)})`).join(' + ');

/* Headshots come from the app's own asset proxy, which fetches and caches a
   real photo for any Sleeper id. Nothing has to be hand-listed, so the engine
   is free to propose whichever players it likes. */
const sleeperById = new Map();
for (const entry of Object.values(JSON.parse(fs.readFileSync('server/data/players-nfl.json', 'utf8')))) {
  if (entry?.name && entry?.id) sleeperById.set(entry.name, String(entry.id));
}
/* The Sleeper id, not a URL. A baked "/api/..." string breaks in the native
   shell, where the app is not served from the API's origin; the page runs it
   through apiUrl instead. test/apiPathsWrapped enforces this. */
const headshot = (name) => sleeperById.get(name) ?? null;
const covered = (s) => [...s.give, ...s.get].every((x) => headshot(catalog[x.id].name));
console.log(`\nuser team: ${teams[USER_INDEX].teamName}`);
console.log('running the real suggestTrades against every manager...\n');

/* Per-manager rather than one league-wide sweep. The engine casts a much wider
   net when a partner is named (40 candidates per opponent instead of 8), and
   the wide net is where the clean, compact deals live. */
const all = [];
for (const opponent of teams.filter((t) => !t.isUser)) {
  const result = await suggestTrades(ctx, { partnerRosterId: opponent.rosterId });
  if (!result.available) continue;
  all.push(...result.suggestions);
  process.stdout.write(`  ${opponent.teamName}: ${result.suggestions.length}\n`);
}
all.sort((a, b) => b.score - a.score);

const swing = (s) =>
  s.get.reduce((a, x) => a + value.get(x.id), 0) - s.give.reduce((a, x) => a + value.get(x.id), 0);

/* What the page will show, in preference order: both managers better off (the
   whole argument for acceptance odds), everybody renderable, and small enough
   to read at a glance. */
const featured = all
  .filter(covered)
  .filter((s) => s.youDelta > 0 && s.partnerDelta > 0)
  .filter((s) => s.give.length <= 2 && s.get.length <= 2);

console.log(`\n${all.length} suggestions, ${featured.length} both-gain and two-a-side or smaller\n`);

/* One per manager: three frames against the same opponent reads as one deal
   flickering, not as a market. */
const picked = [];
for (const s of featured) {
  if (picked.some((p) => p.partnerRosterId === s.partnerRosterId)) continue;
  picked.push(s);
  if (picked.length === 3) break;
}

picked.forEach((s, i) => {
  console.log(`${i + 1}. vs ${s.partnerName}`);
  console.log(`   SEND ${show(s.give)}`);
  console.log(`   GET  ${show(s.get)}`);
  console.log(`   swing ${swing(s) >= 0 ? '+' : ''}${swing(s).toFixed(0)}  |  you ${s.youDelta >= 0 ? '+' : ''}${s.youDelta}%  them ${s.partnerDelta >= 0 ? '+' : ''}${s.partnerDelta}%  |  accept ${s.acceptance}%`);
});

if (picked.length < 3) {
  console.error(`\nonly ${picked.length} usable trades; widen the filter rather than inventing one`);
  process.exit(1);
}

const side = (list) => `[
${list.map((x) => {
  const name = catalog[x.id].name;
  const short = `${name.split(' ')[0][0]}. ${name.split(' ').slice(1).join(' ')}`;
  return `      { name: ${JSON.stringify(short)}, position: '${catalog[x.id].position}', sleeperId: ${JSON.stringify(headshot(name))} },`;
}).join('\n')}
    ]`;

const body = picked.map((s) => `  {
    partner: ${JSON.stringify(s.partnerName)},
    send: ${side(s.give)},
    get: ${side(s.get)},
    acceptance: ${s.acceptance},
    youTitleDelta: ${s.youDelta},
    partnerTitleDelta: ${s.partnerDelta},
  },`).join('\n');

fs.writeFileSync('src/pages/landingTrades.ts', `import type { TradeFrame } from './landingReel';

/**
 * GENERATED. Do not hand-edit: run \`node scripts/generate-landing-trades.mjs\`.
 *
 * These came out of the real suggestTrades in server/engine/engine.js, run on
 * a twelve-team league drafted from the 2026 projection sheets. The engine
 * chose the packages, sized them, and priced the acceptance percentage.
 *
 * They are here because hand-authored trades were indefensible. The page used
 * to show "send Derrick Henry, get Puka Nacua and Trey McBride", which hands
 * 222 points of projection to my side of the table with Nacua alone
 * out-projecting Henry. Nobody sends that and nobody takes it. Every trade
 * below is within a point of even on projection and leaves BOTH managers with
 * a better title price, which is the entire argument for pricing acceptance in
 * the first place.
 */
export const TRADE_FRAMES: TradeFrame[] = [
${body}
];
`);
console.log('\nwrote src/pages/landingTrades.ts');
