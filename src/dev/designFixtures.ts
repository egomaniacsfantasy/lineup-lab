import { getWeek8ReplayProjection, playerFromManifest } from '../data/playerManifest';
import { getAcceptanceLingo } from '../utils/acceptanceLingo';
import type { StoredConnection } from '../contexts/LeagueConnectionContext';
import type {
  LeagueBootstrap,
  LeaguePricing,
  LineHistoryEntry,
  ScheduleWeek,
  TradeAnalysis,
  TradeCounter,
  TradeResult,
  TradeSuggestions,
} from '../services/leagueApi';
import type { DensityHistogram, MatchupHistograms } from '../types/matchup';

export type DesignScene =
  | 'matchup-cold'
  | 'matchup'
  | 'matchup-live'
  | 'market'
  | 'league'
  | 'board';

const FIXTURE_IDS = {
  'matchup-cold': 'og-design-matchup-cold',
  matchup: 'og-design-matchup-empty',
  'matchup-live': 'og-design-matchup-live',
  market: 'og-design-market-live',
  league: 'og-design-league-live',
  board: 'og-design-league-live',
} as const;

const FIXTURE_SCENE_BY_ID = new Map<string, DesignScene>(
  Object.entries(FIXTURE_IDS).map(([scene, leagueId]) => [leagueId, scene as DesignScene]),
);

const WEEK = 8;
const COMPUTED_AT = new Date('2026-07-22T11:42:00-04:00').getTime();
const MATCHUP_COLD_DELAY_MS = 2200;
const MATCHUP_IDS = {
  user: 801,
  apollo: 802,
  poseidon: 803,
};

/**
 * Conditioned playoff odds for the replay week.
 *
 * `nowProb` matches each team's `playoffProb` in the futures block below on
 * purpose: they are the same quantity from the same sim, and a fixture where
 * the fork and the futures table disagree would train the eye to accept a
 * contradiction the real product must never ship.
 */
const DESIGN_FORKS = {
  week: WEEK,
  available: true,
  forks: [
    {
      matchupId: MATCHUP_IDS.user,
      importance: 100,
      sides: [
        { rosterId: '1', nowProb: 75.6, winProb: 88.2, lossProb: 61.0 },
        { rosterId: '2', nowProb: 64.3, winProb: 79.4, lossProb: 47.1 },
      ],
    },
    {
      matchupId: MATCHUP_IDS.apollo,
      importance: 90,
      sides: [
        { rosterId: '3', nowProb: 85.1, winProb: 93.4, lossProb: 75.2 },
        { rosterId: '4', nowProb: 43.1, winProb: 61.8, lossProb: 26.4 },
      ],
    },
    {
      matchupId: MATCHUP_IDS.poseidon,
      importance: 94,
      sides: [
        { rosterId: '5', nowProb: 71.7, winProb: 84.0, lossProb: 57.9 },
        { rosterId: '6', nowProb: 23.7, winProb: 39.6, lossProb: 11.2 },
      ],
    },
  ],
};

type FixtureBundle = {
  bootstrap: LeagueBootstrap;
  schedule: ScheduleWeek[];
  pricing: LeaguePricing;
  history: LineHistoryEntry[];
  suggestions: TradeSuggestions;
  trades: Record<
    string,
    {
      result: TradeResult;
      analysis: TradeAnalysis;
      counter?: TradeCounter;
    }
  >;
  delayMs?: number;
};

const SLOT_ORDER = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

const USER_TEAM = {
  rosterId: 1,
  teamId: 'zeus-bolts',
  ownerId: 'andre',
  ownerName: 'Andre',
  teamName: "Zeus's Bolts",
  avatarUrl: null,
  record: { wins: 5, losses: 2, ties: 0 },
  pointsFor: 1012.4,
  pointsAgainst: 944.6,
  isUser: true,
  starters: [
    'p-mahomes',
    'd-henry',
    'b-robinson',
    'j-jefferson',
    'c-lamb',
    't-kelce',
    't-mclaurin',
    'b-aubrey',
    'sf-def',
  ],
  bench: ['s-barkley', 'd-smith', 't-mcbride', 'j-burrow', 'k-fairbairn', 'phi-def'],
};

const HERMES_TEAM = {
  rosterId: 2,
  teamId: 'hermes-express',
  ownerId: 'marcus',
  ownerName: 'Marcus',
  teamName: 'Hermes Express',
  avatarUrl: null,
  record: { wins: 4, losses: 3, ties: 0 },
  pointsFor: 986.3,
  pointsAgainst: 962.8,
  isUser: false,
  starters: [
    'l-jackson',
    'j-gibbs',
    'j-jacobs',
    'j-chase',
    'p-nacua',
    'b-bowers',
    'd-london',
    'k-fairbairn',
    'min-def',
  ],
  bench: ['a-stbrown', 'j-allen', 'd-smith', 'phi-def'],
};

const APOLLO_TEAM = {
  rosterId: 3,
  teamId: 'apollo-archers',
  ownerId: 'nina',
  ownerName: 'Nina',
  teamName: 'Apollo Archers',
  avatarUrl: null,
  record: { wins: 6, losses: 1, ties: 0 },
  pointsFor: 1088.7,
  pointsAgainst: 938.1,
  isUser: false,
  starters: [
    'j-allen',
    's-barkley',
    'j-gibbs',
    'a-stbrown',
    'd-smith',
    't-mcbride',
    'j-chase',
    'b-aubrey',
    'phi-def',
  ],
  bench: ['j-burrow', 'd-london', 't-kelce', 'j-jefferson'],
};

const ATHENA_TEAM = {
  rosterId: 4,
  teamId: 'athena-owls',
  ownerId: 'olivia',
  ownerName: 'Olivia',
  teamName: 'Athena Owls',
  avatarUrl: null,
  record: { wins: 3, losses: 4, ties: 0 },
  pointsFor: 957.5,
  pointsAgainst: 995.8,
  isUser: false,
  starters: [
    'j-burrow',
    'd-henry',
    'j-jacobs',
    'd-london',
    't-mclaurin',
    't-kelce',
    'b-robinson',
    'k-fairbairn',
    'sf-def',
  ],
  bench: ['p-mahomes', 'p-nacua', 'b-bowers'],
};

const POSEIDON_TEAM = {
  rosterId: 5,
  teamId: 'poseidon-waves',
  ownerId: 'reece',
  ownerName: 'Reece',
  teamName: 'Poseidon Waves',
  avatarUrl: null,
  record: { wins: 5, losses: 2, ties: 0 },
  pointsFor: 1001.2,
  pointsAgainst: 970.4,
  isUser: false,
  starters: [
    'p-mahomes',
    's-barkley',
    'j-gibbs',
    'a-stbrown',
    'p-nacua',
    'b-bowers',
    'd-smith',
    'b-aubrey',
    'min-def',
  ],
  bench: ['c-lamb', 'j-allen', 'phi-def'],
};

const HADES_TEAM = {
  rosterId: 6,
  teamId: 'hades-hounds',
  ownerId: 'owen',
  ownerName: 'Owen',
  teamName: 'Hades Hounds',
  avatarUrl: null,
  record: { wins: 2, losses: 5, ties: 0 },
  pointsFor: 931.8,
  pointsAgainst: 1014.9,
  isUser: false,
  starters: [
    'l-jackson',
    'd-henry',
    'b-robinson',
    'j-jefferson',
    'd-london',
    't-mcbride',
    'j-jacobs',
    'k-fairbairn',
    'sf-def',
  ],
  bench: ['j-burrow', 'j-chase', 'b-aubrey'],
};

const TEAM_POOL = [USER_TEAM, HERMES_TEAM, APOLLO_TEAM, ATHENA_TEAM, POSEIDON_TEAM, HADES_TEAM];
const ACCEPTANCE_57 = getAcceptanceLingo(57)?.label ?? '57%';
const ACCEPTANCE_48 = getAcceptanceLingo(48)?.label ?? '48%';
const ACCEPTANCE_33 = getAcceptanceLingo(33)?.label ?? '33%';

const ALL_PLAYER_IDS = [...new Set(TEAM_POOL.flatMap((team) => [...team.starters, ...team.bench]))];

const PLAYER_CATALOG = Object.fromEntries(
  ALL_PLAYER_IDS.map((id) => {
    const player = playerFromManifest(id as never);
    return [
      id,
      {
        id,
        name: player.name,
        team: player.team,
        position: player.position,
        status: player.isActive ? 'Active' : 'Inactive',
        injuryStatus: player.injuryStatus ?? null,
      },
    ];
  }),
);

const PLAYER_MEANS = Object.fromEntries(
  ALL_PLAYER_IDS.map((id) => {
    const mean = Number(getWeek8ReplayProjection(id).toFixed(1));
    const position = PLAYER_CATALOG[id]?.position;
    const stdev =
      position === 'QB'
        ? 4.8
        : position === 'RB'
          ? 4.1
          : position === 'WR'
            ? 4.4
            : position === 'TE'
              ? 3.2
              : position === 'K'
                ? 2.2
                : 2.9;
    return [id, { mean, stdev, unpriced: false, zeroed: false, derived: false }];
  }),
);

const SUGGESTION_KEY_ONE_FOR_ONE = tradeKey(2, ['t-mclaurin'], ['d-london']);
const SUGGESTION_KEY_THREE_FOR_ONE = tradeKey(3, ['b-robinson', 't-kelce', 'b-aubrey'], ['j-jefferson']);

function tradeKey(partnerRosterId: number, give: string[], get: string[]) {
  return [
    partnerRosterId,
    [...give].sort((left, right) => left.localeCompare(right)).join(','),
    [...get].sort((left, right) => left.localeCompare(right)).join(','),
  ].join('::');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playersPoints(ids: string[]) {
  return Object.fromEntries(ids.map((id) => [id, PLAYER_MEANS[id]?.mean ?? 0]));
}

function buildTeam(team: typeof USER_TEAM) {
  return {
    rosterId: team.rosterId,
    teamId: team.teamId,
    ownerId: team.ownerId,
    ownerName: team.ownerName,
    teamName: team.teamName,
    avatarUrl: team.avatarUrl,
    players: [...team.starters, ...team.bench],
    starters: [...team.starters],
    reserve: [],
    record: team.record,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    isUser: team.isUser,
    division: null,
  };
}

function buildWeekMatchups(
  week: number,
  pairs: Array<[number, number]>,
  playedScores: Record<number, [number, number]> = {},
) {
  return pairs.flatMap(([left, right], index) => {
    const matchupId = week * 100 + index + 1;
    const leftTeam = TEAM_POOL.find((team) => team.rosterId === left)!;
    const rightTeam = TEAM_POOL.find((team) => team.rosterId === right)!;
    const leftPlayers = [...leftTeam.starters, ...leftTeam.bench];
    const rightPlayers = [...rightTeam.starters, ...rightTeam.bench];
    const [leftPoints, rightPoints] = playedScores[matchupId] ?? [0, 0];
    return [
      {
        matchupId,
        week,
        rosterId: leftTeam.rosterId,
        points: leftPoints,
        playersPoints: playersPoints(leftPlayers),
        starters: [...leftTeam.starters],
        players: leftPlayers,
      },
      {
        matchupId,
        week,
        rosterId: rightTeam.rosterId,
        points: rightPoints,
        playersPoints: playersPoints(rightPlayers),
        starters: [...rightTeam.starters],
        players: rightPlayers,
      },
    ];
  });
}

function buildSchedule() {
  const schedulePlan: Array<{ week: number; pairs: Array<[number, number]>; scores?: Record<number, [number, number]> }> = [
    {
      week: 1,
      pairs: [[1, 6], [2, 5], [3, 4]],
      scores: { 101: [151.4, 134.1], 102: [140.3, 146.8], 103: [158.7, 129.5] },
    },
    {
      week: 2,
      pairs: [[1, 5], [6, 4], [2, 3]],
      scores: { 201: [148.9, 139.6], 202: [127.7, 132.4], 203: [142.1, 154.3] },
    },
    {
      week: 3,
      pairs: [[1, 4], [5, 3], [6, 2]],
      scores: { 301: [131.2, 138.5], 302: [143.9, 151.8], 303: [129.4, 145.6] },
    },
    {
      week: 4,
      pairs: [[1, 3], [4, 2], [5, 6]],
      scores: { 401: [156.3, 149.2], 402: [136.4, 141.7], 403: [147.8, 133.9] },
    },
    {
      week: 5,
      pairs: [[1, 2], [3, 6], [4, 5]],
      scores: { 501: [140.1, 144.9], 502: [153.2, 131.7], 503: [132.6, 147.4] },
    },
    {
      week: 6,
      pairs: [[1, 6], [2, 5], [3, 4]],
      scores: { 601: [149.7, 126.8], 602: [137.2, 141.9], 603: [155.1, 136.6] },
    },
    {
      week: 7,
      pairs: [[1, 5], [6, 4], [2, 3]],
      scores: { 701: [151.8, 143.4], 702: [128.9, 139.6], 703: [140.4, 150.2] },
    },
    {
      week: 8,
      pairs: [[1, 2], [3, 4], [5, 6]],
    },
    {
      week: 9,
      pairs: [[1, 4], [2, 6], [3, 5]],
    },
    {
      week: 10,
      pairs: [[1, 3], [4, 6], [2, 5]],
    },
  ];

  return schedulePlan.map((entry) => ({
    week: entry.week,
    matchups: buildWeekMatchups(entry.week, entry.pairs, entry.scores),
  }));
}

/* DEV FIXTURE ONLY. The design scenes replay a server payload so each surface
   can be reviewed without a live league. This mirrors the shape the engine
   serves from `matchupHistograms` (server/engine/engine.js) so the matchup
   distributions render under /design. It is NOT a model: the connected path
   always shows the engine's real seeded Monte Carlo histograms, and nothing
   here is ever used outside the design fixtures. */
function designHistogram(mean: number, sd: number): DensityHistogram {
  const nbins = 32;
  const min = mean - 3.2 * sd;
  const max = mean + 3.2 * sd;
  const binWidth = (max - min) / nbins;
  const bins = Array.from({ length: nbins }, (_, i) => {
    const x = min + binWidth * (i + 0.5);
    const z = (x - mean) / sd;
    return {
      x: Number(x.toFixed(3)),
      density: Number((Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI))).toFixed(6)),
    };
  });
  return {
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    mean,
    binWidth: Number(binWidth.toFixed(4)),
    bins,
  };
}

/* Kept consistent with the user's fixture line below: the two score spreads
   combine to the margin spread, and 6.6 / 22.77 puts the win share at the
   61.4% the same fixture line already quotes. */
const DESIGN_HISTOGRAMS: MatchupHistograms = {
  sims: 5000,
  winProb: 0.614,
  you: designHistogram(149.8, 16.2),
  opponent: designHistogram(143.1, 16.0),
  margin: designHistogram(6.6, 22.77),
};

function lineFor(
  matchupId: number,
  teamA: { rosterId: number; moneyline: number; winProbability: number; projection: number; spread: number; total: number },
  teamB: { rosterId: number; moneyline: number; winProbability: number; projection: number; spread: number; total: number },
  histograms?: MatchupHistograms,
) {
  return {
    matchupId,
    week: WEEK,
    computedAt: COMPUTED_AT,
    inputsHash: `design-${matchupId}`,
    sides: {
      [String(teamA.rosterId)]: {
        moneyline: teamA.moneyline,
        winProbability: teamA.winProbability,
        projection: teamA.projection,
        spread: teamA.spread,
        total: teamA.total,
        unpricedStarters: [],
        zeroedStarters: [],
        ...(histograms ? { histograms } : {}),
      },
      [String(teamB.rosterId)]: {
        moneyline: teamB.moneyline,
        winProbability: teamB.winProbability,
        projection: teamB.projection,
        spread: teamB.spread,
        total: teamB.total,
        unpricedStarters: [],
        zeroedStarters: [],
      },
    },
  };
}

function buildHistory() {
  const entries = [
    {
      at: new Date('2026-07-18T09:15:00-04:00').getTime(),
      trigger: 'opening board',
      matchupLines: {
        [MATCHUP_IDS.user]: [58.4, 41.6],
        [MATCHUP_IDS.apollo]: [64.9, 35.1],
        [MATCHUP_IDS.poseidon]: [52.1, 47.9],
      },
      titleProb: { 1: 18.7, 2: 18.4, 3: 28.9, 4: 9.8, 5: 18.0, 6: 6.2 },
      playoffProb: { 1: 72.1, 2: 66.7, 3: 86.8, 4: 41.2, 5: 69.9, 6: 25.6 },
    },
    {
      at: new Date('2026-07-19T11:40:00-04:00').getTime(),
      trigger: 'lineup change',
      matchupLines: {
        [MATCHUP_IDS.user]: [59.8, 40.2],
        [MATCHUP_IDS.apollo]: [66.2, 33.8],
        [MATCHUP_IDS.poseidon]: [51.4, 48.6],
      },
      titleProb: { 1: 19.4, 2: 17.9, 3: 28.1, 4: 10.1, 5: 18.6, 6: 5.9 },
      playoffProb: { 1: 73.4, 2: 65.9, 3: 86.2, 4: 41.7, 5: 70.5, 6: 25.2 },
    },
    {
      at: new Date('2026-07-20T08:25:00-04:00').getTime(),
      trigger: 'projection refresh',
      matchupLines: {
        [MATCHUP_IDS.user]: [60.7, 39.3],
        [MATCHUP_IDS.apollo]: [67.4, 32.6],
        [MATCHUP_IDS.poseidon]: [53.6, 46.4],
      },
      titleProb: { 1: 19.9, 2: 17.5, 3: 27.9, 4: 10.3, 5: 18.7, 6: 5.7 },
      playoffProb: { 1: 74.2, 2: 65.1, 3: 85.8, 4: 42.4, 5: 70.9, 6: 24.8 },
    },
    {
      at: new Date('2026-07-21T15:05:00-04:00').getTime(),
      trigger: 'waiver run',
      matchupLines: {
        [MATCHUP_IDS.user]: [61.1, 38.9],
        [MATCHUP_IDS.apollo]: [67.7, 32.3],
        [MATCHUP_IDS.poseidon]: [54.2, 45.8],
      },
      titleProb: { 1: 20.2, 2: 17.3, 3: 27.8, 4: 10.4, 5: 18.8, 6: 5.5 },
      playoffProb: { 1: 75.1, 2: 64.7, 3: 85.4, 4: 42.8, 5: 71.3, 6: 24.1 },
    },
    {
      at: COMPUTED_AT,
      trigger: 'latest board',
      matchupLines: {
        [MATCHUP_IDS.user]: [61.4, 38.6],
        [MATCHUP_IDS.apollo]: [68.1, 31.9],
        [MATCHUP_IDS.poseidon]: [54.9, 45.1],
      },
      titleProb: { 1: 20.4, 2: 17.1, 3: 27.7, 4: 10.5, 5: 18.9, 6: 5.4 },
      playoffProb: { 1: 75.6, 2: 64.3, 3: 85.1, 4: 43.1, 5: 71.7, 6: 23.7 },
    },
  ];

  return entries.map((entry, index) => ({
    computedAt: entry.at,
    inputsHash: `design-history-${index}`,
    projectionVersion: 'design-pass-replay-v1',
    /* Spread across the three weeks leading into WEEK rather than stamped with
       one. A fixture where every snapshot belongs to the same week cannot
       exercise anything that reasons about weeks — the time machine correctly
       refuses to render with fewer than two priced weeks, so a single-week
       fixture made it invisible and therefore unreviewable. That is how the
       connect screen shipped scrolling on both axes. */
    /* Two snapshots land in the current week and one in each of the two
       before it. Movement needs an open and a later price IN THE SAME WEEK, so
       an even spread left the current week holding a single snapshot and the
       board's Move column empty — correct behaviour, and invisible to review.
       It is also the realistic shape: the live week reprices most. */
    week: index < 1 ? Math.max(1, WEEK - 2) : index < 2 ? Math.max(1, WEEK - 1) : WEEK,
    trigger: entry.trigger,
    lines: [
      {
        matchupId: MATCHUP_IDS.user,
        sides: {
          '1': { moneyline: index === entries.length - 1 ? -159 : -150 + index * -3, winProbability: entry.matchupLines[MATCHUP_IDS.user][0] },
          '2': { moneyline: index === entries.length - 1 ? 134 : 128 + index * 2, winProbability: entry.matchupLines[MATCHUP_IDS.user][1] },
        } as Record<string, { moneyline: number; winProbability: number }>,
      },
      {
        matchupId: MATCHUP_IDS.apollo,
        sides: {
          '3': { moneyline: -214 + index * -4, winProbability: entry.matchupLines[MATCHUP_IDS.apollo][0] },
          '4': { moneyline: 176 + index * 3, winProbability: entry.matchupLines[MATCHUP_IDS.apollo][1] },
        } as Record<string, { moneyline: number; winProbability: number }>,
      },
      {
        matchupId: MATCHUP_IDS.poseidon,
        sides: {
          '5': { moneyline: -122 + index * -2, winProbability: entry.matchupLines[MATCHUP_IDS.poseidon][0] },
          '6': { moneyline: 104 + index * 2, winProbability: entry.matchupLines[MATCHUP_IDS.poseidon][1] },
        } as Record<string, { moneyline: number; winProbability: number }>,
      },
    ],
    titleProb: {
      '1': entry.titleProb[1],
      '2': entry.titleProb[2],
      '3': entry.titleProb[3],
      '4': entry.titleProb[4],
      '5': entry.titleProb[5],
      '6': entry.titleProb[6],
    },
    playoffProb: {
      '1': entry.playoffProb[1],
      '2': entry.playoffProb[2],
      '3': entry.playoffProb[3],
      '4': entry.playoffProb[4],
      '5': entry.playoffProb[5],
      '6': entry.playoffProb[6],
    },
    /* The store writes one of these per team per recorded entry, keyed by
       roster id. The matchup line-movement chart reads them, so without them
       here the panel can only ever say there has been no movement. */
    teamSnapshots: ([1, 2, 3, 4, 5, 6] as const).map((rosterId) => {
      const pair = rosterId <= 2
        ? entry.matchupLines[MATCHUP_IDS.user]
        : rosterId <= 4
          ? entry.matchupLines[MATCHUP_IDS.apollo]
          : entry.matchupLines[MATCHUP_IDS.poseidon];
      return {
        rosterId,
        computedAt: entry.at,
        trigger: entry.trigger,
        winProbThisWeek: rosterId % 2 === 1 ? pair[0] : pair[1],
        titleOdds: null,
        playoffOdds: null,
      };
    }),
  }));
}

function buildPricing(leagueId: string, pricingMode: 'empty' | 'live'): LeaguePricing {
  const lines = [
    lineFor(
      MATCHUP_IDS.user,
      { rosterId: 1, moneyline: -159, winProbability: 61.4, projection: 149.8, spread: 6.6, total: 292.9 },
      { rosterId: 2, moneyline: 159, winProbability: 38.6, projection: 143.1, spread: -6.6, total: 292.9 },
      pricingMode === 'live' ? DESIGN_HISTOGRAMS : undefined,
    ),
    lineFor(
      MATCHUP_IDS.apollo,
      { rosterId: 3, moneyline: -213, winProbability: 68.1, projection: 154.2, spread: 10.7, total: 297.7 },
      { rosterId: 4, moneyline: 213, winProbability: 31.9, projection: 143.5, spread: -10.7, total: 297.7 },
    ),
    lineFor(
      MATCHUP_IDS.poseidon,
      { rosterId: 5, moneyline: -122, winProbability: 54.9, projection: 147.3, spread: 3.1, total: 291.5 },
      { rosterId: 6, moneyline: 122, winProbability: 45.1, projection: 144.2, spread: -3.1, total: 291.5 },
    ),
  ];

  return {
    available: true,
    projectionVersion: 'design-pass-replay-v1',
    computedAt: COMPUTED_AT,
    inputsHash: `design-pricing-${pricingMode}`,
    week: WEEK,
    scoringNote: 'Design fixture replay. Display only.',
    lines,
    playerMeans: PLAYER_MEANS,
    userSwaps:
      pricingMode === 'live'
        ? [
            {
              slotIndex: 6,
              slotLabel: 'FLEX',
              starterId: 't-mclaurin',
              benchId: 'd-smith',
              starterMean: 12.4,
              benchMean: 15.7,
              deltaWinProb: 3.2,
              resultingWinProb: 64.6,
              resultingMoneyline: -182,
              resultingProjection: 153.1,
            },
            {
              slotIndex: 1,
              slotLabel: 'RB',
              starterId: 'd-henry',
              benchId: 's-barkley',
              starterMean: 15.2,
              benchMean: 16.8,
              deltaWinProb: 1.6,
              resultingWinProb: 63.0,
              resultingMoneyline: -170,
              resultingProjection: 151.4,
            },
          ]
        : [],
    futures: [
      {
        rosterId: 3,
        teamName: 'Apollo Archers',
        record: { wins: 6, losses: 1, ties: 0 },
        projRecord: '9.8-4.2',
        projWins: 9.8,
        projLosses: 4.2,
        playoffProb: 85.1,
        playoffOdds: -571,
        titleProb: 27.7,
        finalsProb: 51.8,
        championOdds: 261,
        avgSeed: 2.1,
        isUser: false,
      },
      {
        rosterId: 1,
        teamName: "Zeus's Bolts",
        record: { wins: 5, losses: 2, ties: 0 },
        projRecord: '8.7-5.3',
        projWins: 8.7,
        projLosses: 5.3,
        playoffProb: 75.6,
        playoffOdds: -310,
        titleProb: 20.4,
        finalsProb: 43.6,
        championOdds: 390,
        avgSeed: 3.3,
        isUser: true,
      },
      {
        rosterId: 5,
        teamName: 'Poseidon Waves',
        record: { wins: 5, losses: 2, ties: 0 },
        projRecord: '8.6-5.4',
        projWins: 8.6,
        projLosses: 5.4,
        playoffProb: 71.7,
        playoffOdds: -253,
        titleProb: 18.9,
        finalsProb: 41.1,
        championOdds: 429,
        avgSeed: 3.6,
        isUser: false,
      },
      {
        rosterId: 2,
        teamName: 'Hermes Express',
        record: { wins: 4, losses: 3, ties: 0 },
        projRecord: '8.1-5.9',
        projWins: 8.1,
        projLosses: 5.9,
        playoffProb: 64.3,
        playoffOdds: -180,
        titleProb: 17.1,
        finalsProb: 36.9,
        championOdds: 485,
        avgSeed: 4.0,
        isUser: false,
      },
      {
        rosterId: 4,
        teamName: 'Athena Owls',
        record: { wins: 3, losses: 4, ties: 0 },
        projRecord: '7.0-7.0',
        projWins: 7.0,
        projLosses: 7.0,
        playoffProb: 43.1,
        playoffOdds: 132,
        titleProb: 10.5,
        finalsProb: 24.2,
        championOdds: 852,
        avgSeed: 4.9,
        isUser: false,
      },
      {
        rosterId: 6,
        teamName: 'Hades Hounds',
        record: { wins: 2, losses: 5, ties: 0 },
        projRecord: '5.9-8.1',
        projWins: 5.9,
        projLosses: 8.1,
        playoffProb: 23.7,
        playoffOdds: 322,
        titleProb: 5.4,
        finalsProb: 13.1,
        championOdds: 1752,
        avgSeed: 5.8,
        isUser: false,
      },
    ],
    movers:
      pricingMode === 'live'
        ? [
            {
              kind: 'trade',
              leagueId,
              headline: 'Send Terry McLaurin for Drake London',
              detail: 'London keeps your WR2 ceiling intact and cleans up the FLEX floor.',
              givePlayerIds: ['t-mclaurin'],
              getPlayerIds: ['d-london'],
              partnerRosterId: 2,
              partnerGain: 0.8,
              verdict: ACCEPTANCE_57,
              valueGap: -0.6,
              acceptanceProbability: 57,
              acceptanceReason: 'Hermes adds a usable starter without taking a title hit.',
              pricedAt: COMPUTED_AT,
              valueGain: 1.7,
              titleOddsBefore: 390,
              titleOddsAfter: 345,
            },
            {
              kind: 'trade',
              leagueId,
              headline: 'Package Kelce and Aubrey for McBride and Puka',
              detail: 'A cleaner depth-for-ceiling play if you want a younger TE plus another WR start.',
              givePlayerIds: ['t-kelce', 'b-aubrey'],
              getPlayerIds: ['t-mcbride', 'p-nacua'],
              partnerRosterId: 5,
              partnerGain: 0.9,
              verdict: ACCEPTANCE_48,
              valueGap: 0.3,
              acceptanceProbability: 48,
              acceptanceReason: 'Poseidon likes the two-for-two structure but loses some week-winning juice.',
              pricedAt: COMPUTED_AT,
              valueGain: 1.1,
              titleOddsBefore: 390,
              titleOddsAfter: 362,
            },
            {
              kind: 'trade',
              leagueId,
              headline: 'Offer a 3-for-1 swing at Jefferson',
              detail: 'It consolidates your lineup, but Apollo only listens if the package stays rich.',
              givePlayerIds: ['b-robinson', 't-kelce', 'b-aubrey'],
              getPlayerIds: ['j-jefferson'],
              partnerRosterId: 3,
              partnerGain: 2.1,
              verdict: ACCEPTANCE_33,
              valueGap: 2.4,
              acceptanceProbability: 33,
              acceptanceReason: 'Apollo gains depth and keeps leverage, so they need a strong overpay.',
              pricedAt: COMPUTED_AT,
              valueGain: -1.4,
              titleOddsBefore: 390,
              titleOddsAfter: 468,
            },
          ]
        : [],
    /* Real recorded history is what the band's trend line draws. Eight weeks
       of the user's title price shortening from +1180 to +390, so the design
       fixture shows the shape a live league would. */
    titleHistory: [
      { week: 1, odds: { 1: 1180, 2: 700, 3: 520, 4: 760, 5: 640, 6: 1400 }, at: COMPUTED_AT - 7 * 7 * 24 * 60 * 60 * 1000 },
      { week: 2, odds: { 1: 1040, 2: 660, 3: 470, 4: 800, 5: 610, 6: 1520 }, at: COMPUTED_AT - 6 * 7 * 24 * 60 * 60 * 1000 },
      { week: 3, odds: { 1: 960, 2: 690, 3: 430, 4: 840, 5: 560, 6: 1610 }, at: COMPUTED_AT - 5 * 7 * 24 * 60 * 60 * 1000 },
      { week: 4, odds: { 1: 880, 2: 640, 3: 400, 4: 880, 5: 520, 6: 1580 }, at: COMPUTED_AT - 4 * 7 * 24 * 60 * 60 * 1000 },
      { week: 5, odds: { 1: 700, 2: 600, 3: 360, 4: 900, 5: 495, 6: 1660 }, at: COMPUTED_AT - 3 * 7 * 24 * 60 * 60 * 1000 },
      { week: 6, odds: { 1: 560, 2: 540, 3: 320, 4: 870, 5: 470, 6: 1700 }, at: COMPUTED_AT - 2 * 7 * 24 * 60 * 60 * 1000 },
      { week: 7, odds: { 1: 450, 2: 510, 3: 290, 4: 860, 5: 445, 6: 1720 }, at: COMPUTED_AT - 1 * 7 * 24 * 60 * 60 * 1000 },
      { week: 8, odds: { 1: 390, 2: 485, 3: 261, 4: 852, 5: 429, 6: 1752 }, at: COMPUTED_AT - 0 * 7 * 24 * 60 * 60 * 1000 },
    ],
    leagueMedian: { mean: 145.1, sigma: 18.4 },
    weeklyLines: [
      {
        week: 8,
        opponentRosterId: 2,
        opponentName: 'Hermes Express',
        moneyline: -159,
        winProb: 61.4,
        projection: 149.8,
        opponentProjection: 143.1,
        note: 'Live line. Reprices as lineups move.',
      },
      {
        week: 9,
        opponentRosterId: 4,
        opponentName: 'Athena Owls',
        moneyline: -132,
        winProb: 56.9,
        projection: 148.6,
        opponentProjection: 144.7,
        note: 'Best-lineup projection.',
      },
      {
        week: 10,
        opponentRosterId: 3,
        opponentName: 'Apollo Archers',
        moneyline: 108,
        winProb: 48.1,
        projection: 147.5,
        opponentProjection: 148.7,
        note: 'Toughest regular-season spot left.',
      },
    ],
  };
}

function buildBootstrap(leagueId: string): LeagueBootstrap {
  return {
    league: {
      id: leagueId,
      providerId: leagueId,
      name: 'Odds Gods Design Replay',
      season: '2026',
      totalTeams: TEAM_POOL.length,
      scoringFamily: 'ppr',
      hasCustomScoring: false,
      status: 'in_season',
      scoringSettings: {},
      rosterPositions: [...SLOT_ORDER, 'BN', 'BN', 'BN', 'BN'],
      playoffWeekStart: 11,
      playoffTeams: 4,
      lastScoredWeek: 7,
      regularSeasonWeeks: 10,
      leagueType: 'redraft',
      bestBall: false,
      divisions: null,
      playoffReseed: null,
      divisionWinnerPriority: null,
    },
    teams: TEAM_POOL.map(buildTeam),
    week: WEEK,
    matchups: buildWeekMatchups(WEEK, [[1, 2], [3, 4], [5, 6]]),
    players: PLAYER_CATALOG,
    state: { season: '2026', week: WEEK, seasonType: 'regular' },
    lastUpdated: COMPUTED_AT,
  };
}

function baseTrades(): FixtureBundle['trades'] {
  return {
    [SUGGESTION_KEY_ONE_FOR_ONE]: {
      result: {
        available: true,
        you: {
          teamName: "Zeus's Bolts",
          titleBefore: 390,
          titleAfter: 345,
          titleProbBefore: 20.4,
          titleProbAfter: 22.5,
          valueDelta: 1.8,
          depthBefore: { WR: 4, FLEX: 3 },
          depthAfter: { WR: 4, FLEX: 3 },
        },
        them: {
          teamName: 'Hermes Express',
          titleBefore: 485,
          titleAfter: 518,
          valueDelta: -0.9,
        },
        verdict: 'GOOD VALUE.',
        acceptance: {
          band: ACCEPTANCE_57,
          probability: 57,
          reasons: ['Hermes picks up a startable WR', 'Their title dip stays modest'],
        },
        valueGap: -0.6,
        fairCounter: null,
        bestPlayer: { name: 'Drake London', toThem: false },
      },
      analysis: {
        available: true,
        you: {
          rosterId: 1,
          teamName: "Zeus's Bolts",
          isUser: true,
          before: { playoffProb: 75.6, titleProb: 20.4, avgSeed: 3.3, expWins: 8.7 },
          after: { playoffProb: 79.1, titleProb: 22.5, avgSeed: 2.9, expWins: 9.1 },
          delta: { playoffProb: 3.5, titleProb: 2.1, avgSeed: -0.4, expWins: 0.4 },
        },
        partner: {
          rosterId: 2,
          teamName: 'Hermes Express',
          isUser: false,
          before: { playoffProb: 64.3, titleProb: 17.1, avgSeed: 4.0, expWins: 8.1 },
          after: { playoffProb: 62.4, titleProb: 15.9, avgSeed: 4.3, expWins: 7.8 },
          delta: { playoffProb: -1.9, titleProb: -1.2, avgSeed: 0.3, expWins: -0.3 },
        },
      },
      counter: {
        available: true,
        needed: false,
      },
    },
    [SUGGESTION_KEY_THREE_FOR_ONE]: {
      result: {
        available: true,
        you: {
          teamName: "Zeus's Bolts",
          titleBefore: 390,
          titleAfter: 468,
          titleProbBefore: 20.4,
          titleProbAfter: 17.7,
          valueDelta: -2.4,
          depthBefore: { RB: 3, TE: 2, WR: 4 },
          depthAfter: { RB: 2, TE: 1, WR: 3 },
        },
        them: {
          teamName: 'Apollo Archers',
          titleBefore: 261,
          titleAfter: 224,
          valueDelta: 2.1,
        },
        verdict: 'OVERPAY.',
        acceptance: {
          band: ACCEPTANCE_33,
          probability: 33,
          reasons: ['Apollo gains three live assets', 'You pay a premium to consolidate'],
        },
        valueGap: 2.4,
        fairCounter: null,
        bestPlayer: { name: 'Justin Jefferson', toThem: false },
        isDepthPackage: true,
      },
      analysis: {
        available: true,
        you: {
          rosterId: 1,
          teamName: "Zeus's Bolts",
          isUser: true,
          before: { playoffProb: 75.6, titleProb: 20.4, avgSeed: 3.3, expWins: 8.7 },
          after: { playoffProb: 71.8, titleProb: 17.7, avgSeed: 3.8, expWins: 8.2 },
          delta: { playoffProb: -3.8, titleProb: -2.7, avgSeed: 0.5, expWins: -0.5 },
        },
        partner: {
          rosterId: 3,
          teamName: 'Apollo Archers',
          isUser: false,
          before: { playoffProb: 85.1, titleProb: 27.7, avgSeed: 2.1, expWins: 9.8 },
          after: { playoffProb: 87.4, titleProb: 29.6, avgSeed: 1.8, expWins: 10.1 },
          delta: { playoffProb: 2.3, titleProb: 1.9, avgSeed: -0.3, expWins: 0.3 },
        },
      },
      counter: {
        available: true,
        needed: true,
        whoAdds: 'them',
        add: [{ id: 'd-london', name: 'Drake London' }],
        before: { youDelta: -2.7, partnerDelta: 1.9 },
        after: { youDelta: -0.8, partnerDelta: 0.2 },
      },
    },
  };
}

function buildSuggestions(): TradeSuggestions {
  return {
    available: true,
    suggestions: [
      {
        partnerRosterId: 2,
        partnerName: 'Hermes Express',
        give: [{ id: 't-mclaurin', name: 'Terry McLaurin' }],
        get: [{ id: 'd-london', name: 'Drake London' }],
        youDelta: 2.1,
        partnerDelta: -1.2,
        youPlayoffDelta: 2.8,
        partnerPlayoffDelta: -1.6,
        youWeekDelta: 3.4,
        partnerWeekDelta: -2.1,
      },
      {
        partnerRosterId: 2,
        partnerName: 'Hermes Express',
        give: [{ id: 't-mcbride', name: 'Trey McBride' }],
        get: [{ id: 'b-bowers', name: 'Brock Bowers' }],
        youDelta: 1.4,
        partnerDelta: -0.8,
        youPlayoffDelta: 1.9,
        partnerPlayoffDelta: -1.1,
        youWeekDelta: 0.6,
        partnerWeekDelta: -0.4,
      },
      {
        partnerRosterId: 3,
        partnerName: 'Apollo Archers',
        give: [
          { id: 'b-robinson', name: 'Bijan Robinson' },
          { id: 't-kelce', name: 'Travis Kelce' },
          { id: 'b-aubrey', name: 'Brandon Aubrey' },
        ],
        get: [{ id: 'j-jefferson', name: 'Justin Jefferson' }],
        youDelta: -2.7,
        partnerDelta: 1.9,
        youPlayoffDelta: -3.4,
        partnerPlayoffDelta: 2.6,
        youWeekDelta: -1.8,
        partnerWeekDelta: 1.5,
      },
      /* Two more Apollo deals so /design/market shows a STACK, and shows the
         positive verdict tones. One card in one tone reviews nothing. */
      {
        partnerRosterId: 3,
        partnerName: 'Apollo Archers',
        give: [
          { id: 'd-henry', name: 'Derrick Henry' },
          { id: 't-mcbride', name: 'Trey McBride' },
        ],
        get: [
          { id: 'p-nacua', name: 'Puka Nacua' },
          { id: 'b-bowers', name: 'Brock Bowers' },
        ],
        youDelta: 2.2,
        partnerDelta: 0.4,
        youPlayoffDelta: 2.9,
        partnerPlayoffDelta: 0.6,
        youWeekDelta: 1.3,
        partnerWeekDelta: 0.2,
      },
      {
        partnerRosterId: 3,
        partnerName: 'Apollo Archers',
        give: [{ id: 'c-lamb', name: 'CeeDee Lamb' }],
        get: [{ id: 'j-gibbs', name: 'Jahmyr Gibbs' }],
        youDelta: 0.4,
        partnerDelta: -0.2,
        youPlayoffDelta: 0.6,
        partnerPlayoffDelta: -0.3,
        youWeekDelta: -0.9,
        partnerWeekDelta: 0.7,
      },
    ],
    debug: { enumerated: 18, scanned: 18, resimmed: 6, positive: 3, ms: 382 },
  };
}

function buildBundle(leagueId: string, pricingMode: 'empty' | 'live', delayMs = 0): FixtureBundle {
  return {
    bootstrap: buildBootstrap(leagueId),
    schedule: buildSchedule(),
    pricing: buildPricing(leagueId, pricingMode),
    history: buildHistory(),
    suggestions: buildSuggestions(),
    trades: baseTrades(),
    delayMs,
  };
}

const BUNDLES = new Map<string, FixtureBundle>([
  [FIXTURE_IDS['matchup-cold'], buildBundle(FIXTURE_IDS['matchup-cold'], 'empty', MATCHUP_COLD_DELAY_MS)],
  [FIXTURE_IDS.matchup, buildBundle(FIXTURE_IDS.matchup, 'empty')],
  [FIXTURE_IDS['matchup-live'], buildBundle(FIXTURE_IDS['matchup-live'], 'live')],
  [FIXTURE_IDS.market, buildBundle(FIXTURE_IDS.market, 'live')],
  [FIXTURE_IDS.league, buildBundle(FIXTURE_IDS.league, 'live')],
]);

export function connectionForDesignScene(scene: DesignScene): StoredConnection {
  const leagueId = FIXTURE_IDS[scene];
  return {
    provider: 'espn',
    leagueId,
    leagueName: 'Odds Gods Design Replay',
    userId: 'andre-design-user',
    username: 'andre',
    displayName: 'Andre',
    allLeagueIds: [leagueId],
    allLeagues: [{ id: leagueId, name: 'Odds Gods Design Replay', season: '2026' }],
    season: '2026',
    espnS2: null,
    swid: null,
  };
}

export function isDesignFixtureLeague(leagueId: string) {
  return BUNDLES.has(leagueId);
}

export function sceneForFixtureLeague(leagueId: string): DesignScene | null {
  return (FIXTURE_SCENE_BY_ID.get(leagueId) as DesignScene | undefined) ?? null;
}

async function maybeDelay(bundle: FixtureBundle) {
  if (bundle.delayMs) await delay(bundle.delayMs);
}

/**
 * Read ?failTrade when this module loads, and keep it.
 *
 * Evaluated at import rather than on first use: the builder restores its
 * state from the query string on mount and rewrites it, so by the time the
 * first trade request is made the switch is already gone from the URL. Read
 * lazily it was reliably missed.
 */
const failTradeMode: string | null =
  typeof window === 'undefined'
    ? null
    : new URL(window.location.href).searchParams.get('failTrade');

function designFailTrade() {
  return failTradeMode;
}

/* How long the fixture makes a conditioned run take. Long enough that the
   busy state is a state rather than a flicker, and ?slowPredictor stretches
   it further for anyone looking at that state on purpose. */
const DESIGN_PREDICTOR_MS =
  typeof window !== 'undefined' && window.location.search.includes('slowPredictor') ? 8_000 : 900;

/* The client hashes a pick set to throw away runs whose picks are no longer
   on screen. The fixture has to agree with it or every answer is discarded. */
function predictorHash(picks: { week?: number; matchupId?: number; winnerRosterId?: string }[]) {
  return picks
    .map((pick) => `${pick.week}:${pick.matchupId}:${pick.winnerRosterId}`)
    .sort()
    .join('|');
}

/* The one username the fixtures answer for. */
const DESIGN_HANDLE = 'designgods';

export async function maybeHandleDesignFixtureRequest(path: string, init?: RequestInit) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;

  const url = new URL(path, window.location.origin);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api') return null;

  /* The phone's front door: a Sleeper username with no account behind it.
     Answering it here is what makes that screen designable and testable at
     all, the same gap that hid the Predictor's waiting state for weeks. Only
     the one reserved handle resolves; anything else falls through so the
     "we could not find that account" state stays reachable too. */
  if (parts[1] === 'connect') {
    if (decodeURIComponent(parts[2] ?? '').toLowerCase() !== DESIGN_HANDLE) return null;
    await new Promise((resolve) => setTimeout(resolve, 700));
    const leagueId = FIXTURE_IDS.league;
    const bundle = BUNDLES.get(leagueId)!;
    return {
      user: { id: 'design-user', username: DESIGN_HANDLE, displayName: 'Vlahakis' },
      season: '2026',
      leagues: [
        {
          id: leagueId,
          providerId: leagueId,
          name: 'Mount Olympus',
          season: '2026',
          totalTeams: bundle.bootstrap.teams?.length ?? 12,
          scoringFamily: 'ppr',
          hasCustomScoring: false,
          status: 'in_season',
        },
      ],
    };
  }

  if (parts[1] !== 'league') return null;

  const leagueId = parts[2];
  const endpoint = parts[3];
  if (!leagueId || !endpoint || !BUNDLES.has(leagueId)) return null;

  const bundle = BUNDLES.get(leagueId)!;
  const method = (init?.method ?? 'GET').toUpperCase();

  if (endpoint === 'bootstrap' && method === 'GET') {
    await maybeDelay(bundle);
    return bundle.bootstrap;
  }
  if (endpoint === 'schedule' && method === 'GET') {
    return { weeks: bundle.schedule, lastUpdated: COMPUTED_AT };
  }
  if (endpoint === 'lines' && method === 'GET') {
    await maybeDelay(bundle);
    return bundle.pricing;
  }
  if (endpoint === 'line-history' && method === 'GET') {
    return { history: bundle.history };
  }
  if (endpoint === 'forks' && method === 'GET') {
    /* ?slowForks holds the answer back so the strip's waiting state can be
       looked at, and asserted against, at all. The conditioned sim is the
       slowest call the tab makes in production and the fastest here, which
       meant the one state built to cover that wait was the one state the
       design scene could never show. */
    const held = Number(new URL(window.location.href).searchParams.get('slowForks'));
    if (Number.isFinite(held) && held > 0) {
      await new Promise((resolve) => { setTimeout(resolve, held); });
    }
    return DESIGN_FORKS;
  }
  /* The Predictor's conditioned board.

     Without this the design league answered 500 on every pick, which meant
     the one state the Predictor exists to produce could not be looked at or
     asserted against outside a live league. That is why its busy state went
     unnoticed for so long: nobody could reach the moment it appears.

     The numbers are NOT a simulation. Each called game nudges its winner up
     and its loser down from the futures baseline, which is enough to design a
     board that moves and nothing like enough to price one. It never leaves
     dev, and the delay is here because the real run is slow and the waiting
     is the part being designed. */
  if (endpoint === 'predictor' && method === 'POST') {
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const picks = Array.isArray(body.picks) ? (body.picks as { winnerRosterId?: string }[]) : [];
    const winners = new Set(picks.map((pick) => String(pick.winnerRosterId)));

    await new Promise((resolve) => setTimeout(resolve, DESIGN_PREDICTOR_MS));

    const clamp = (value: number) => Math.max(0.1, Math.min(99.9, value));
    return {
      available: true,
      pickSetHash: String(body.picks ? predictorHash(picks) : ''),
      picked: picks.length,
      simulated: 0,
      sims: 4000,
      bracket: null,
      rows: (bundle.pricing.futures ?? []).map((team) => {
        const called = winners.has(String(team.rosterId));
        const nudge = picks.length === 0 ? 0 : called ? 6.5 : -2.5;
        return {
          rosterId: String(team.rosterId),
          playoffProb: clamp(team.playoffProb + nudge),
          titleProb: clamp(team.titleProb + nudge / 2),
          avgSeed: team.avgSeed,
          playoffOdds: team.playoffOdds,
          titleOdds: team.championOdds,
          record: team.record,
          pointsFor: null,
        };
      }),
    };
  }

  if (endpoint === 'trade-suggestions' && method === 'POST') {
    return bundle.suggestions;
  }

  const body =
    typeof init?.body === 'string'
      ? JSON.parse(init.body)
      : init?.body instanceof FormData
        ? Object.fromEntries(init.body.entries())
        : {};
  const key = tradeKey(
    Number(body.partnerRosterId ?? 0),
    Array.isArray(body.give) ? body.give : [],
    Array.isArray(body.get) ? body.get : [],
  );
  const trade = bundle.trades[key];

  /* ?failTrade makes the two pricing calls reject, which is the state a real
     league reaches on a timeout or a 500 and the one the design scene could
     not otherwise produce — the fixture answers every request successfully,
     so the failure path was unreachable by hand and untestable.
     ?failTrade=analysis fails only the season-impact half, which is the more
     common real failure: it is the heavier call. */
  const failTrade = designFailTrade();
  if (failTrade && endpoint === 'trade' && method === 'POST' && failTrade !== 'analysis') {
    throw new Error('The simulation is not reachable.');
  }
  if (failTrade && endpoint === 'trade-analyze' && method === 'POST') {
    throw new Error('The season impact could not be simulated.');
  }

  if (endpoint === 'trade' && method === 'POST') {
    return trade?.result ?? { available: false, reason: 'design_fixture_missing_trade' };
  }
  if (endpoint === 'trade-analyze' && method === 'POST') {
    return trade?.analysis ?? { available: false, reason: 'design_fixture_missing_trade' };
  }
  if (endpoint === 'trade-counter' && method === 'POST') {
    return trade?.counter ?? { available: true, needed: false };
  }

  return null;
}
