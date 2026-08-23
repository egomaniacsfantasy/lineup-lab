/**
 * Verify ESPN's draft view against a real league before trusting it.
 *
 * The field names in mDraftDetail are the whole risk here. Guess one wrong and
 * getDraftPicks returns an empty list forever, which looks exactly like a
 * league that has not drafted: no error, no crash, just a feature that quietly
 * does nothing. This prints what ESPN actually sends.
 *
 * Run: node scripts/probe-espn-draft.mjs <leagueId> [season]
 * A private league needs ESPN_S2 and ESPN_SWID in the environment.
 */
const [, , leagueId, season = String(new Date().getUTCFullYear())] = process.argv;
if (!leagueId) {
  console.error('usage: node scripts/probe-espn-draft.mjs <leagueId> [season]');
  process.exit(1);
}

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
const headers = {};
if (process.env.ESPN_S2 && process.env.ESPN_SWID) {
  const swid = process.env.ESPN_SWID.startsWith('{')
    ? process.env.ESPN_SWID
    : `{${process.env.ESPN_SWID}}`;
  headers.Cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${swid}`;
  console.log('using cookies from the environment');
}

const get = async (views) => {
  const url = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}?${views
    .map((v) => `view=${v}`)
    .join('&')}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`espn_${res.status} on ${views.join('+')}`);
  return res.json();
};

const draft = await get(['mDraftDetail']);
const detail = draft?.draftDetail;
console.log('\n--- draftDetail ---');
if (!detail) {
  console.log('NO draftDetail KEY. Top-level keys:', Object.keys(draft).join(', '));
  process.exit(1);
}
console.log('keys:', Object.keys(detail).join(', '));
console.log('drafted:', detail.drafted, ' inProgress:', detail.inProgress);
const picks = detail.picks ?? [];
console.log('picks:', picks.length);
if (picks.length === 0) {
  console.log('no picks; either the draft has not run or the shape differs');
  process.exit(1);
}
console.log('\n--- first pick, verbatim ---');
console.log(JSON.stringify(picks[0], null, 1));

/* The exact fields the provider reads. Anything undefined here is a rename. */
/* memberId is deliberately absent from this list: a real league returned it on
   zero of 180 picks, so the owner is resolved from the pick's team instead. */
const READS = ['overallPickNumber', 'roundId', 'roundPickNumber', 'teamId', 'playerId', 'keeper', 'bidAmount'];
console.log('\n--- fields the provider depends on ---');
for (const key of READS) {
  const present = picks.filter((p) => p[key] !== undefined).length;
  console.log(`  ${key.padEnd(20)} present on ${present}/${picks.length}`);
}

const rosters = await get(['mRoster']);
const rostered = new Set();
for (const team of rosters.teams ?? []) {
  for (const entry of team.roster?.entries ?? []) {
    const id = entry.playerPoolEntry?.player?.id;
    if (id != null) rostered.add(Number(id));
  }
}
const orphans = picks.filter((p) => !rostered.has(Number(p.playerId)));
console.log('\n--- name resolution ---');
console.log(`  ${rostered.size} players currently rostered`);
console.log(`  ${orphans.length}/${picks.length} picks are of players nobody now rosters`);
console.log('  (those are the drafted-then-dropped ones that cannot be named from rosters alone)');
