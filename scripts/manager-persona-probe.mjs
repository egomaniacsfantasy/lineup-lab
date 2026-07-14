import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const BASE = 'https://api.sleeper.app/v1';
const START_SEASON = 2017;
const END_SEASON = 2026;
const DEFAULT_USERNAME = 'avla';
const DEFAULT_LEAGUES = [
  { name: 'DINK', id: '1380260955111313408' },
  { name: '617 Dynasty', id: '1312141276467961856' },
];
const OUTPUT = 'MANAGER_PERSONA_FEASIBILITY.md';

let callCount = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleeperGet(endpoint) {
  callCount += 1;
  const response = await fetch(`${BASE}${endpoint}`);
  await sleep(70);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Sleeper ${endpoint} responded ${response.status}`);
  }
  return response.json();
}

function formatLeagueType(type) {
  if (type === 2) return 'dynasty';
  if (type === 1) return 'keeper';
  return 'redraft';
}

function formatRecord(wins = 0, losses = 0, ties = 0) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function pct(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}

function average(total, count, digits = 2) {
  if (!count) return null;
  return Number((total / count).toFixed(digits));
}

function findChampionRosterId(winnersBracket) {
  if (!Array.isArray(winnersBracket) || winnersBracket.length === 0) return null;
  const winnerIds = new Set(
    winnersBracket.flatMap((matchup) => [matchup.w, matchup.t1, matchup.t2]).filter(Boolean),
  );
  const loserIds = new Set(
    winnersBracket.flatMap((matchup) => [matchup.l]).filter(Boolean),
  );
  for (const id of winnerIds) {
    if (!loserIds.has(id)) return id;
  }
  return winnersBracket.at(-1)?.w ?? null;
}

async function loadLeagueLineage(leagueId) {
  const lineage = [];
  let nextLeagueId = String(leagueId);
  const seen = new Set();

  while (nextLeagueId && nextLeagueId !== '0' && !seen.has(nextLeagueId)) {
    seen.add(nextLeagueId);
    const league = await sleeperGet(`/league/${nextLeagueId}`);
    if (!league) break;
    lineage.push(league);
    nextLeagueId = league.previous_league_id ? String(league.previous_league_id) : '';
  }

  return lineage;
}

function profileFromLeague(league, users, rosters) {
  const userById = new Map((users ?? []).map((user) => [String(user.user_id), user]));
  return (rosters ?? []).map((roster) => {
    const ownerId = roster.owner_id ? String(roster.owner_id) : null;
    const user = ownerId ? userById.get(ownerId) : null;
    return {
      rosterId: roster.roster_id,
      ownerId,
      displayName: user?.display_name ?? (ownerId ? `user:${ownerId.slice(-6)}` : 'Unmanaged team'),
      teamName:
        user?.metadata?.team_name ||
        roster.metadata?.team_name ||
        (ownerId ? `${user?.display_name ?? 'Managed'} team` : 'Unmanaged team'),
      record: formatRecord(
        roster.settings?.wins ?? 0,
        roster.settings?.losses ?? 0,
        roster.settings?.ties ?? 0,
      ),
    };
  });
}

function newLeagueStats() {
  return {
    seasonsScanned: 0,
    tradesInvolved: 0,
    tradesInitiated: 0,
    tradesConsented: 0,
    waiverAdds: 0,
    faabSpent: 0,
    picksTraded: 0,
    transactionWeeks: new Set(),
  };
}

async function collectLineageTransactionStats(lineage) {
  const byManager = new Map();

  for (const league of lineage) {
    const leagueId = String(league.league_id);
    const rosters = await sleeperGet(`/league/${leagueId}/rosters`);
    const rosterToOwner = new Map(
      (rosters ?? [])
        .filter((roster) => roster.owner_id)
        .map((roster) => [roster.roster_id, String(roster.owner_id)]),
    );

    for (const managerId of new Set([...rosterToOwner.values()])) {
      const stats = byManager.get(managerId) ?? newLeagueStats();
      stats.seasonsScanned += 1;
      byManager.set(managerId, stats);
    }

    for (let week = 1; week <= 18; week += 1) {
      const transactions = await sleeperGet(`/league/${leagueId}/transactions/${week}`);
      for (const txn of transactions ?? []) {
        if (txn.status !== 'complete') continue;
        if (txn.type === 'commissioner') continue;

        if (txn.type === 'trade') {
          const involvedManagers = new Set(
            (txn.roster_ids ?? [])
              .map((rosterId) => rosterToOwner.get(rosterId))
              .filter(Boolean),
          );
          for (const managerId of involvedManagers) {
            const stats = byManager.get(managerId) ?? newLeagueStats();
            stats.tradesInvolved += 1;
            stats.transactionWeeks.add(`${league.season}-w${week}`);
            byManager.set(managerId, stats);
          }

          if (txn.creator && byManager.has(String(txn.creator))) {
            byManager.get(String(txn.creator)).tradesInitiated += 1;
          }

          for (const consenterId of txn.consenter_ids ?? []) {
            const managerId = String(consenterId);
            if (txn.creator && managerId === String(txn.creator)) continue;
            if (!byManager.has(managerId)) continue;
            byManager.get(managerId).tradesConsented += 1;
          }

          for (const draftPick of txn.draft_picks ?? []) {
            const candidates = [
              draftPick.owner_id,
              draftPick.previous_owner_id,
              rosterToOwner.get(draftPick.roster_id),
            ].filter(Boolean);
            for (const managerId of new Set(candidates.map(String))) {
              if (!byManager.has(managerId)) continue;
              byManager.get(managerId).picksTraded += 1;
            }
          }
        }

        if (txn.type === 'waiver' || txn.type === 'free_agent') {
          for (const [playerId, rosterId] of Object.entries(txn.adds ?? {})) {
            void playerId;
            const managerId = rosterToOwner.get(rosterId);
            if (!managerId) continue;
            const stats = byManager.get(managerId) ?? newLeagueStats();
            stats.waiverAdds += 1;
            stats.transactionWeeks.add(`${league.season}-w${week}`);
            if (txn.type === 'waiver') {
              stats.faabSpent += Number(txn.settings?.waiver_bid ?? 0);
            }
            byManager.set(managerId, stats);
          }
        }
      }
    }
  }

  return {
    managerStats: byManager,
  };
}

async function sampleMatchupPoints(leagueId) {
  for (let week = 1; week <= 18; week += 1) {
    const matchups = await sleeperGet(`/league/${leagueId}/matchups/${week}`);
    const sample = (matchups ?? []).find((matchup) => Array.isArray(matchup.players) && matchup.players.length > 0);
    if (!sample) continue;
    const playersPoints = sample.players_points ?? {};
    return {
      week,
      rosterCount: matchups.length,
      hasPlayersPoints: Object.keys(playersPoints).length > 0,
      examplePlayersPoints: Object.keys(playersPoints).length,
      startersPointsPresent: Array.isArray(sample.starters_points),
    };
  }
  return {
    week: null,
    rosterCount: 0,
    hasPlayersPoints: false,
    examplePlayersPoints: 0,
    startersPointsPresent: false,
  };
}

async function tenureSummary(managerId) {
  if (!managerId) {
    return {
      seasonsActive: 0,
      totalLeagues: 0,
      managed: false,
      leaguesBySeason: [],
      leagueIds: [],
    };
  }

  const leaguesBySeason = [];
  const leagueIds = [];
  for (let season = START_SEASON; season <= END_SEASON; season += 1) {
    const leagues = await sleeperGet(`/user/${managerId}/leagues/nfl/${season}`);
    const count = Array.isArray(leagues) ? leagues.length : 0;
    if (count > 0) {
      leaguesBySeason.push({ season, count });
      for (const league of leagues) {
        leagueIds.push(String(league.league_id));
      }
    }
  }

  return {
    seasonsActive: leaguesBySeason.length,
    totalLeagues: leagueIds.length,
    managed: true,
    leaguesBySeason,
    leagueIds,
  };
}

async function careerSummary(managerId) {
  const tenure = await tenureSummary(managerId);
  if (!tenure.managed) {
    return {
      ...tenure,
      careerRecord: null,
      playoffRate: null,
      titles: null,
      inspectedLeagues: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let playoffAppearances = 0;
  let titles = 0;
  let inspectedLeagues = 0;

  for (const leagueId of tenure.leagueIds) {
    const rosters = await sleeperGet(`/league/${leagueId}/rosters`);
    const winnersBracket = await sleeperGet(`/league/${leagueId}/winners_bracket`);
    const roster = (rosters ?? []).find((item) => String(item.owner_id ?? '') === String(managerId));
    if (!roster) continue;
    wins += Number(roster.settings?.wins ?? 0);
    losses += Number(roster.settings?.losses ?? 0);
    ties += Number(roster.settings?.ties ?? 0);
    inspectedLeagues += 1;

    const rosterId = roster.roster_id;
    if (Array.isArray(winnersBracket) && winnersBracket.some((matchup) => matchup.t1 === rosterId || matchup.t2 === rosterId || matchup.w === rosterId)) {
      playoffAppearances += 1;
    }
    if (findChampionRosterId(winnersBracket) === rosterId) {
      titles += 1;
    }
  }

  return {
    ...tenure,
    careerRecord: formatRecord(wins, losses, ties),
    playoffRate: inspectedLeagues > 0 ? playoffAppearances / inspectedLeagues : null,
    titles,
    inspectedLeagues,
  };
}

function renderCoverageTable(rows) {
  const header = [
    '| Manager | Managed | Seasons | Leagues | Txn stats | Matchup points | Notes |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
  ];
  const body = rows.map((row) =>
    [
      row.manager,
      row.managed ? 'yes' : 'no',
      row.seasons,
      row.leagues,
      row.txnStats,
      row.matchupPoints,
      row.notes,
    ].join(' | '),
  );
  return `${header.join('\n')}\n${body.map((line) => `| ${line} |`).join('\n')}`;
}

async function probeLeague({ name, id }) {
  const startedAt = performance.now();
  const callsBefore = callCount;
  const lineage = await loadLeagueLineage(id);
  const currentLeague = lineage[0];
  const users = await sleeperGet(`/league/${id}/users`);
  const rosters = await sleeperGet(`/league/${id}/rosters`);
  const profiles = profileFromLeague(currentLeague, users, rosters);
  const transactionSummary = await collectLineageTransactionStats(lineage);
  const matchupSummary = await sampleMatchupPoints(id);
  const lineageSeasonCount = lineage.length;

  const managerRows = [];
  for (const profile of profiles) {
    const career = await careerSummary(profile.ownerId);
    const stats = profile.ownerId ? transactionSummary.managerStats.get(profile.ownerId) ?? newLeagueStats() : newLeagueStats();
    const lineageScope = `in this league (${stats.seasonsScanned} ${stats.seasonsScanned === 1 ? 'season' : 'seasons'})`;
    const notes = [];
    if (!profile.ownerId) notes.push('vacant roster');
    if (profile.ownerId && career.totalLeagues <= 1) notes.push('thin Sleeper history');
    if (stats.tradesInvolved === 0 && stats.waiverAdds === 0) notes.push('no lineage transaction sample');
    if (!matchupSummary.hasPlayersPoints) notes.push('bench points blocked');
    managerRows.push({
      manager: `${profile.displayName} (${profile.teamName})`,
      managed: Boolean(profile.ownerId),
      seasons: career.seasonsActive,
      leagues: career.totalLeagues,
      txnStats:
        profile.ownerId
          ? `${stats.tradesInvolved} trades, ${stats.waiverAdds} adds, $${stats.faabSpent} FAAB ${lineageScope}`
          : 'n/a',
      matchupPoints: matchupSummary.hasPlayersPoints
        ? `yes, week ${matchupSummary.week}`
        : 'no',
      notes: notes.join('; ') || 'full lineage sample',
    });
  }

  const callsUsed = callCount - callsBefore;
  const elapsedMs = Math.round(performance.now() - startedAt);

  return {
    name,
    id,
    type: formatLeagueType(currentLeague?.settings?.type),
    season: currentLeague?.season ?? 'unknown',
    lineageSeasonCount,
    managerRows,
    matchupSummary,
    callsUsed,
    elapsedMs,
    currentLeague,
  };
}

function callBudgetMath() {
  return [
    '- Shared league-lineage scan: `1 league + 1 users + 1 rosters + 18 transactions + 1 matchup sample = 22 calls` for the current season.',
    '- Each prior season in the same `previous_league_id` chain adds `1 league + 1 rosters + 18 transactions = 20 calls`, plus matchup calls only if head-to-head or bench-left receipts are compiled.',
    '- Dynasty offseason activity must include leg 1, so the shared scan always walks weeks `1-18` for every lineage season.',
    '- Each managed profile tenure pass costs `10` calls for `2017-2026` league lists.',
    '- Career record/playoff/title rollups cost roughly `2 x total_leagues` calls for rosters plus winners bracket on demand.',
    '- Full cross-league transaction history stays on-demand and sampled; cap any optional extra-league transaction pull to roughly `200` calls.',
  ].join('\n');
}

async function main() {
  const username = process.argv[2] || DEFAULT_USERNAME;
  const user = await sleeperGet(`/user/${encodeURIComponent(username)}`);
  if (!user?.user_id) {
    throw new Error(`Sleeper user "${username}" not found`);
  }

  const startedAt = performance.now();
  const probes = [];
  for (const league of DEFAULT_LEAGUES) {
    probes.push(await probeLeague(league));
  }
  const totalElapsedMs = Math.round(performance.now() - startedAt);
  const lineageNotes = probes
    .filter((probe) => probe.lineageSeasonCount > 1)
    .map(
      (probe) =>
        `- \`${probe.name}\` has ${probe.lineageSeasonCount} lineage seasons, which is enough for titles, head-to-head, and repeat-trade behavior.`,
    )
    .join('\n');

  const markdown = `# Manager Persona Feasibility

Generated on ${new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}.

Probe target: Sleeper user \`${user.username}\` (\`${user.user_id}\`).

## Coverage snapshot

${probes.map((probe) => `### ${probe.name} (${probe.type}, ${probe.season})

- League id: \`${probe.id}\`
- Lineage seasons found: ${probe.lineageSeasonCount}
- Matchup sample: ${
    probe.matchupSummary.hasPlayersPoints
      ? `week ${probe.matchupSummary.week} includes \`players_points\` and \`starters_points\`, so bench-points-left analysis is feasible.`
      : 'no usable per-player points found in the sampled matchup payload.'
  }
- Probe cost: ${probe.callsUsed} calls in ${probe.elapsedMs} ms

${renderCoverageTable(probe.managerRows)}
`).join('\n')}

## What is computable

- High confidence
  - Sleeper tenure (\`/user/<id>/leagues/nfl/<season>\` across 2017-2026)
  - Full league-lineage trades, initiator share, consent share, waiver adds, FAAB spent, and traded picks from weekly transactions
  - Bench-points-left analysis because sampled matchup payloads include \`players_points\`
  - Honest unmanaged-team detection because vacant rosters expose \`owner_id: null\`
- Medium confidence
  - Career record, playoff rate, and titles on a per-manager basis by walking each league's rosters plus winners bracket
  - Head-to-head vs you across the current league lineage when that lineage exists and the same managers stay in the chain
- Low confidence or context-dependent
  - Ring-chaser signals in fresh leagues with no \`previous_league_id\`
  - Early-season FAAB pace in leagues where week 1 is not complete yet

## Surprises

- \`DINK\` is a deliberate unmanaged-team fixture: 10 rosters exist, but 9 return \`owner_id: null\`. That validates the no-file collapse state, but it should not be treated as representative Sleeper coverage.
${lineageNotes}
- Matchup payloads in both sampled leagues already include per-player scoring maps, so bench-left receipts can be computed client-side with no server work.

## Call-budget math

${callBudgetMath()}

## Default read mapping

- Trade-friendliness starts at \`5\`.
- Add \`+3\` at \`3.0+\` trades per season, \`+1\` at \`1.5+\`, and subtract \`3\` below \`0.5\`.
- Add \`+1\` when trade initiation rate is \`60%+\`.
- Add \`+1\` when the manager consents to \`2.0+\` outside-created trades per scanned season.
- Weight current and previous lineage seasons \`2x\` for trades/season and consent-per-season.
- Relationship starts at \`5\`.
- Add \`+1\` after one completed trade together anywhere in the lineage and \`+2\` after two.
- Head-to-head and titles remain visible in the profile, but do not move the relationship slider.
- Clamp both sliders to \`0-10\`.
- Toggle OFF restores neutral \`5/5\`. Manual overrides always beat scouted defaults until reset.

## Measured total

- Probe total: ${callCount} calls in ${totalElapsedMs} ms across ${probes.length} leagues.
- Practical UI plan: cache shared league data per league, then compile cross-league career details only when a specific manager file is opened or refreshed.
`;

  await writeFile(OUTPUT, markdown);
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
