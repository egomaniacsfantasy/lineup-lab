import type { Player, ScoringFormat } from '../types';
import { tiltFromConsensus, adjustFP, scaleBound, type TiltScoring } from '../services/agreementTilt';

export const MATCHUP_STATE_THRESHOLDS = {
  heavyUnderdog: 35,
  underdog: 46,
  favorite: 54,
  heavyFavorite: 65,
} as const;

export type MatchupState =
  | 'heavy-underdog'
  | 'underdog'
  | 'coin-flip'
  | 'favorite'
  | 'heavy-favorite';

export type VolatilityProfileName = 'floor-safe' | 'balanced' | 'volatile';

export interface VolatilityProfile {
  floor: number | null;
  median: number | null;
  ceiling: number | null;
  bandWidth: number | null;
  profile: VolatilityProfileName | null;
  available: boolean;
}

type ProjectionRow = {
  id: string;
  position: Player['position'];
  name: string;
  team: string | null;
  weekly: Record<string, unknown>[];
  /** Consensus agreement across all voters, from /api/projections. */
  consensus?: { avg?: number | null } | null;
};

export interface VolatilityProjectionSet {
  players?: ProjectionRow[];
}

type ProfileByWeek = Map<number, Map<string, VolatilityProfile>>;

const EMPTY_PROFILE: VolatilityProfile = {
  floor: null,
  median: null,
  ceiling: null,
  bandWidth: null,
  profile: null,
  available: false,
};

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupKeys(player: Pick<Player, 'name' | 'position' | 'team'>) {
  const name = normalize(player.name);
  const team = normalize(player.team);
  return {
    exact: `${player.position}::${name}::${team}`,
    fallback: `${player.position}::${name}`,
  };
}

function projectionKeys(row: ProjectionRow) {
  const name = normalize(row.name);
  const team = normalize(row.team);
  return {
    exact: `${row.position}::${name}::${team}`,
    fallback: `${row.position}::${name}`,
  };
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoringSuffix(position: Player['position'], scoringFormat: ScoringFormat) {
  if (position !== 'RB' && position !== 'WR' && position !== 'TE') return '';
  if (scoringFormat === 'half-ppr') return '_half';
  if (scoringFormat === 'standard') return '_nonppr';
  return '';
}

function weeklyMedianKey(position: Player['position'], scoringFormat: ScoringFormat) {
  if (position === 'K') return 'total_projected_fp';
  return `fantasy_pts${scoringSuffix(position, scoringFormat)}`;
}

function weeklyFloorKey(position: Player['position'], scoringFormat: ScoringFormat) {
  return `fantasy_pts_floor${scoringSuffix(position, scoringFormat)}`;
}

function weeklyCeilingKey(position: Player['position'], scoringFormat: ScoringFormat) {
  return `fantasy_pts_ceiling${scoringSuffix(position, scoringFormat)}`;
}

function weeklyFor(row: ProjectionRow, week: number) {
  return row.weekly.find((entry) => Number(entry.week) === week) ?? null;
}

function readWeeklyProfile(
  row: ProjectionRow,
  week: number,
  scoringFormat: ScoringFormat,
): VolatilityProfile {
  const weekly = weeklyFor(row, week);
  if (!weekly) return EMPTY_PROFILE;

  // Raw model values from the game_level grid.
  const rawMean = toNumber(weekly[weeklyMedianKey(row.position, scoringFormat)]);
  const rawFloor = toNumber(weekly[weeklyFloorKey(row.position, scoringFormat)]);
  const rawCeiling = toNumber(weekly[weeklyCeilingKey(row.position, scoringFormat)]);

  if (rawFloor == null || rawMean == null || rawCeiling == null || rawMean <= 0) {
    return EMPTY_PROFILE;
  }

  // Apply the SAME consensus tilt the Projections page shows, so the compare
  // range = the agreement-adjusted mean + floor/ceiling for this exact week.
  const suf = scoringSuffix(row.position, scoringFormat) as TiltScoring;
  const delta = tiltFromConsensus(row.consensus?.avg ?? null);
  const mean = adjustFP(row.position, rawMean, weekly, suf, 'weekly', delta) ?? rawMean;
  const floor = scaleBound(rawFloor, rawMean, mean) ?? rawFloor;
  const ceiling = scaleBound(rawCeiling, rawMean, mean) ?? rawCeiling;

  return {
    floor,
    median: mean, // this is the model MEAN (point projection), not a median
    ceiling,
    bandWidth: (ceiling - floor) / mean,
    profile: null,
    available: true,
  };
}

function classifyProfiles(
  rows: ProjectionRow[],
  week: number,
  scoringFormat: ScoringFormat,
) {
  const readById = new Map<string, VolatilityProfile>();
  const widthsByPosition = new Map<Player['position'], number[]>();

  for (const row of rows) {
    const profile = readWeeklyProfile(row, week, scoringFormat);
    readById.set(row.id, profile);
    if (!profile.available || profile.bandWidth == null) continue;

    const widths = widthsByPosition.get(row.position) ?? [];
    widths.push(profile.bandWidth);
    widthsByPosition.set(row.position, widths);
  }

  const bandsByPosition = new Map<Player['position'], { lowerMax: number; upperMin: number }>();
  widthsByPosition.forEach((widths, position) => {
    const sorted = [...widths].sort((a, b) => a - b);
    if (sorted.length < 3) return;
    bandsByPosition.set(position, {
      lowerMax: sorted[Math.ceil(sorted.length / 3) - 1],
      upperMin: sorted[Math.floor((sorted.length * 2) / 3)],
    });
  });

  const profiles = new Map<string, VolatilityProfile>();
  const fallbackProfiles = new Map<string, VolatilityProfile>();

  for (const row of rows) {
    const base = readById.get(row.id) ?? EMPTY_PROFILE;
    const bands = bandsByPosition.get(row.position);
    const profileName: VolatilityProfileName | null =
      base.available && base.bandWidth != null && bands
        ? base.bandWidth <= bands.lowerMax
          ? 'floor-safe'
          : base.bandWidth >= bands.upperMin
            ? 'volatile'
            : 'balanced'
        : null;
    const profile = base.available ? { ...base, profile: profileName ?? 'balanced' } : base;
    const keys = projectionKeys(row);
    profiles.set(keys.exact, profile);
    if (!fallbackProfiles.has(keys.fallback)) {
      fallbackProfiles.set(keys.fallback, profile);
    }
  }

  return { profiles, fallbackProfiles };
}

export function getMatchupState(winProbability: number): MatchupState {
  if (winProbability < MATCHUP_STATE_THRESHOLDS.heavyUnderdog) return 'heavy-underdog';
  if (winProbability < MATCHUP_STATE_THRESHOLDS.underdog) return 'underdog';
  if (winProbability <= MATCHUP_STATE_THRESHOLDS.favorite) return 'coin-flip';
  if (winProbability <= MATCHUP_STATE_THRESHOLDS.heavyFavorite) return 'favorite';
  return 'heavy-favorite';
}

export function createVolatilityResolver(
  projectionSet: VolatilityProjectionSet | null,
  scoringFormat: ScoringFormat,
) {
  const cache: ProfileByWeek = new Map();
  const rows = projectionSet?.players ?? [];

  return {
    getVolatilityProfile(player: Player, week: number): VolatilityProfile {
      if (rows.length === 0) return EMPTY_PROFILE;
      if (!cache.has(week)) {
        const { profiles, fallbackProfiles } = classifyProfiles(rows, week, scoringFormat);
        const merged = new Map<string, VolatilityProfile>(fallbackProfiles);
        profiles.forEach((profile, key) => merged.set(key, profile));
        cache.set(week, merged);
      }

      const keys = lookupKeys(player);
      const profiles = cache.get(week);
      return profiles?.get(keys.exact) ?? profiles?.get(keys.fallback) ?? EMPTY_PROFILE;
    },
  };
}
