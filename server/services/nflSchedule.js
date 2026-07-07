const ESPN_SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const TWELVE_HOURS = 12 * 60 * 60_000;

export const SLEEPER_NFL_TEAMS = [
  'ARI',
  'ATL',
  'BAL',
  'BUF',
  'CAR',
  'CHI',
  'CIN',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GB',
  'HOU',
  'IND',
  'JAX',
  'KC',
  'LAC',
  'LAR',
  'LV',
  'MIA',
  'MIN',
  'NE',
  'NO',
  'NYG',
  'NYJ',
  'PHI',
  'PIT',
  'SEA',
  'SF',
  'TB',
  'TEN',
  'WAS',
];

export const ESPN_TO_SLEEPER_TEAM = {
  ARI: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  HOU: 'HOU',
  IND: 'IND',
  JAC: 'JAX',
  JAX: 'JAX',
  KC: 'KC',
  LAC: 'LAC',
  SD: 'LAC',
  LA: 'LAR',
  LAR: 'LAR',
  STL: 'LAR',
  LV: 'LV',
  OAK: 'LV',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NO: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  TB: 'TB',
  TEN: 'TEN',
  WAS: 'WAS',
  WSH: 'WAS',
};

const cache = new Map();

function cacheKey(season, week) {
  return `${season}:${week}`;
}

function normalizeTeam(raw) {
  const key = String(raw ?? '').trim().toUpperCase();
  const mapped = ESPN_TO_SLEEPER_TEAM[key];
  if (!mapped) {
    throw new Error(`unmapped_nfl_team:${key || 'blank'}`);
  }
  return mapped;
}

function cleanIso(raw) {
  return new Date(raw).toISOString().replace('.000Z', 'Z');
}

function normalizeEvent(event, week, season) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  if (competitors.length !== 2) {
    throw new Error(`invalid_nfl_event:${event.id ?? 'unknown'}`);
  }

  const entries = competitors.map((competitor) => ({
    team: normalizeTeam(competitor.team?.abbreviation),
    homeAway: competitor.homeAway,
  }));
  const home = entries.find((entry) => entry.homeAway === 'home');
  const away = entries.find((entry) => entry.homeAway === 'away');
  if (!home || !away) {
    throw new Error(`invalid_nfl_home_away:${event.id ?? 'unknown'}`);
  }

  const kickoffIso = cleanIso(competition?.date ?? event.date);
  const gameId = String(event.id ?? competition?.id ?? '');

  return [
    {
      team: home.team,
      week,
      season,
      opponent: away.team,
      homeAway: 'home',
      kickoffIso,
      gameId,
    },
    {
      team: away.team,
      week,
      season,
      opponent: home.team,
      homeAway: 'away',
      kickoffIso,
      gameId,
    },
  ];
}

async function fetchSchedule(season, week) {
  const params = new URLSearchParams({
    week: String(week),
    seasontype: '2',
    dates: String(season),
  });
  const response = await fetch(`${ESPN_SCOREBOARD}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`espn_scoreboard_${response.status}`);
  }

  const body = await response.json();
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) {
    throw new Error('espn_scoreboard_empty');
  }

  const games = events.flatMap((event) => normalizeEvent(event, week, season));
  const seen = new Set(games.map((game) => game.team));
  const byes = SLEEPER_NFL_TEAMS.filter((team) => !seen.has(team));

  if (seen.size + byes.length !== SLEEPER_NFL_TEAMS.length) {
    throw new Error('nfl_schedule_team_count_mismatch');
  }

  return {
    available: true,
    season,
    week,
    games,
    byes,
  };
}

export async function getNflSchedule({ season, week }) {
  const safeSeason = Number(season);
  const safeWeek = Number(week);
  if (!Number.isInteger(safeSeason) || !Number.isInteger(safeWeek)) {
    return { available: false };
  }

  const key = cacheKey(safeSeason, safeWeek);
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < TWELVE_HOURS) {
    return cached.payload;
  }

  try {
    const payload = await fetchSchedule(safeSeason, safeWeek);
    cache.set(key, { fetchedAt: now, payload });
    return payload;
  } catch (error) {
    if (cached) {
      return { ...cached.payload, stale: true };
    }
    return { available: false };
  }
}
