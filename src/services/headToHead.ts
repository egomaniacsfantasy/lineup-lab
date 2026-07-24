const BASE = 'https://api.sleeper.app/v1';
const CACHE_VERSION = '2026-07-24-v1';

interface SleeperLeague {
  league_id?: string;
  season?: string;
  previous_league_id?: string | number | null;
  settings?: {
    playoff_week_start?: number;
  };
}

interface SleeperRoster {
  roster_id: number;
  owner_id?: string | null;
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points?: number;
}

type HeadToHeadGame = {
  leagueId: string;
  season: number;
  week: number;
  yourPoints: number;
  opponentPoints: number;
  result: 'W' | 'L' | 'T';
};

export interface SleeperHeadToHeadSummary {
  record: string;
  streak: string;
  averageScore: string;
  timeline: Array<{
    key: string;
    result: 'W' | 'L' | 'T';
    label: string;
  }>;
}

const jsonCache = new Map<string, Promise<unknown | null>>();

function cacheKey(leagueId: string, viewerOwnerId: string, opponentOwnerId: string) {
  return `og.h2h.${CACHE_VERSION}.${leagueId}.${viewerOwnerId}.${opponentOwnerId}`;
}

function regularSeasonWeeks(league: SleeperLeague | null | undefined) {
  const playoffStart = Number(league?.settings?.playoff_week_start ?? 0);
  return playoffStart > 1 ? playoffStart - 1 : 14;
}

function recordLabel(wins: number, losses: number, ties: number) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function average(total: number, count: number) {
  if (!count) return 0;
  return Number((total / count).toFixed(0));
}

function streakLabel(games: HeadToHeadGame[]) {
  const latest = games.at(-1);
  if (!latest) return '';
  let streak = 0;
  for (let index = games.length - 1; index >= 0; index -= 1) {
    if (games[index].result !== latest.result) break;
    streak += 1;
  }
  return `${latest.result}${streak}`;
}

async function sleeperGet<T>(endpoint: string): Promise<T | null> {
  if (!jsonCache.has(endpoint)) {
    jsonCache.set(
      endpoint,
      (async () => {
        const response = await fetch(`${BASE}${endpoint}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Sleeper ${endpoint} responded ${response.status}`);
        return response.json();
      })(),
    );
  }
  return (await jsonCache.get(endpoint)) as T | null;
}

function readCachedSummary(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SleeperHeadToHeadSummary;
  } catch {
    return null;
  }
}

function writeCachedSummary(key: string, summary: SleeperHeadToHeadSummary | null) {
  try {
    if (!summary) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(summary));
  } catch {
    // ignore
  }
}

export async function fetchSleeperHeadToHeadSummary({
  leagueId,
  viewerOwnerId,
  opponentOwnerId,
  currentWeek,
}: {
  leagueId: string;
  viewerOwnerId: string;
  opponentOwnerId: string;
  currentWeek: number;
}) {
  const storageKey = cacheKey(leagueId, viewerOwnerId, opponentOwnerId);
  const cached = readCachedSummary(storageKey);
  if (cached) return cached;

  const games: HeadToHeadGame[] = [];
  const seen = new Set<string>();
  let nextLeagueId: string | null = leagueId;
  let isCurrentLeague = true;

  while (nextLeagueId && nextLeagueId !== '0' && !seen.has(nextLeagueId)) {
    seen.add(nextLeagueId);
    const league: SleeperLeague | null = await sleeperGet<SleeperLeague>(`/league/${nextLeagueId}`);
    if (!league) break;
    const rosters = (await sleeperGet<SleeperRoster[]>(`/league/${nextLeagueId}/rosters`)) ?? [];
    const yourRoster = rosters.find((roster) => String(roster.owner_id ?? '') === viewerOwnerId);
    const theirRoster = rosters.find((roster) => String(roster.owner_id ?? '') === opponentOwnerId);
    const maxWeek = isCurrentLeague
      ? Math.max(0, Math.min(currentWeek - 1, regularSeasonWeeks(league)))
      : regularSeasonWeeks(league);

    if (yourRoster && theirRoster && yourRoster.roster_id !== theirRoster.roster_id) {
      for (let week = 1; week <= maxWeek; week += 1) {
        const matchups = (await sleeperGet<SleeperMatchup[]>(`/league/${nextLeagueId}/matchups/${week}`)) ?? [];
        const yours = matchups.find((matchup) => matchup.roster_id === yourRoster.roster_id);
        const theirs = matchups.find((matchup) => matchup.roster_id === theirRoster.roster_id);
        if (!yours || !theirs || yours.matchup_id !== theirs.matchup_id) continue;
        const yourPoints = Number(yours.points ?? 0);
        const opponentPoints = Number(theirs.points ?? 0);
        games.push({
          leagueId: nextLeagueId,
          season: Number(league.season ?? new Date().getFullYear()),
          week,
          yourPoints,
          opponentPoints,
          result: yourPoints > opponentPoints ? 'W' : opponentPoints > yourPoints ? 'L' : 'T',
        });
      }
    }

    isCurrentLeague = false;
    nextLeagueId = league.previous_league_id ? String(league.previous_league_id) : null;
  }

  games.sort((left, right) => {
    if (left.season !== right.season) return left.season - right.season;
    return left.week - right.week;
  });

  if (games.length === 0) {
    writeCachedSummary(storageKey, null);
    return null;
  }

  const wins = games.filter((game) => game.result === 'W').length;
  const losses = games.filter((game) => game.result === 'L').length;
  const ties = games.filter((game) => game.result === 'T').length;
  const summary: SleeperHeadToHeadSummary = {
    record: recordLabel(wins, losses, ties),
    streak: streakLabel(games),
    averageScore: `${average(games.reduce((sum, game) => sum + game.yourPoints, 0), games.length)}-${average(games.reduce((sum, game) => sum + game.opponentPoints, 0), games.length)}`,
    timeline: games.slice(-8).map((game) => ({
      key: `${game.season}-${game.week}-${game.leagueId}`,
      result: game.result,
      label: `${game.result} · ${game.season} Wk ${game.week} · ${game.yourPoints.toFixed(1)}-${game.opponentPoints.toFixed(1)}`,
    })),
  };
  writeCachedSummary(storageKey, summary);
  return summary;
}
