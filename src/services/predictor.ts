import { maybeHandleDesignFixtureRequest } from '../dev/designFixtures.ts';
import { withContext } from './leagueApi.ts';

/**
 * The contract between the Predictor's UI and the conditioned sim behind it.
 *
 * Everything in this file is a SHAPE and a fetch. No probability is computed
 * here and none ever should be: the frontend's job is to send a set of forced
 * results and render whatever book comes back. That boundary is the reason
 * this file exists as its own module rather than living inside the component.
 *
 * The three endpoints below are not implemented server-side yet. They are
 * specified here so the interface is fixed before either half is written, and
 * so the UI can be built, reviewed and corrected against real interaction
 * without waiting on the engine. Until they answer, every caller receives
 * `{ available: false }` and the UI says so rather than inventing numbers.
 *
 * See docs/predictor-engine-memo.md for the server-side note.
 */

/** One forced result. The pick-set is a list of these. */
export interface Pick {
  week: number;
  matchupId: number;
  /** Roster id of the side the user has picked to win. */
  winnerRosterId: string;
  /** Optional custom scores. Absent = the engine credits projected points
   *  (winner = max(winnerProj, loserProj + 1), loser = loserProj). */
  winnerPoints?: number;
  loserPoints?: number;
}

/** One team's row on a conditioned board. */
export interface ConditionedRow {
  rosterId: string;
  playoffProb: number;
  titleProb: number;
  /** Seed, averaged across the conditioned runs. */
  avgSeed: number;
  playoffOdds: number;
  titleOdds: number;
  /** Standings as the calls stand (base record + forced picks). */
  record: { wins: number; losses: number; ties: number };
  pointsFor: number | null;
}

export interface ConditionedBoard {
  available: true;
  /**
   * Hash of the pick-set this board was computed from.
   *
   * The UI discards any response whose hash does not match the picks currently
   * on screen. Without it a slow run started three clicks ago can land after a
   * fast one and repaint the board with a scenario the user has already moved
   * past — the numbers would be real and describe the wrong world.
   */
  pickSetHash: string;
  /** How many of the remaining games were forced rather than simulated. */
  picked: number;
  simulated: number;
  /** How many runs produced this. The fast pass refines to the full count. */
  sims: number;
  rows: ConditionedRow[];
}

export interface Unavailable {
  available: false;
  reason: 'not-implemented' | 'failed';
  message: string;
}

export type ConditionedResult = ConditionedBoard | Unavailable;

/**
 * Both branches of a single matchup: where each side lands if it wins, and
 * where it lands if it loses.
 *
 * This is what the week fork draws. It is the same conditioning the Predictor
 * runs, asked one game at a time.
 */
export interface ForkSide {
  rosterId: string;
  /** Playoff probability as the board stands, with nothing forced. */
  nowProb: number;
  /** Conditioned on this side winning, and on this side losing. */
  winProb: number;
  lossProb: number;
}

export interface WeekFork {
  matchupId: number;
  /** 0-100, relative to the biggest swing in the same week. */
  importance: number;
  sides: [ForkSide, ForkSide];
}

export interface WeekForksResult {
  available: boolean;
  week: number | null;
  forks: WeekFork[];
  message?: string;
}

/* Says what is true rather than "coming soon": the numbers are real work that
   has not been done, not a feature switched off. */
const NOT_IMPLEMENTED: Unavailable = {
  available: false,
  reason: 'not-implemented',
  message: 'The conditioned simulation is not wired up yet.',
};

/**
 * Ask for a board conditioned on a set of forced results.
 *
 * `signal` is required rather than optional. Every pick supersedes the run
 * before it, and a Predictor that cannot abandon the previous request is a
 * Predictor that will eventually paint a stale one.
 */
export async function fetchConditionedBoard(
  leagueId: string,
  userId: string,
  picks: readonly Pick[],
  signal: AbortSignal,
  { fast = true }: { fast?: boolean } = {},
): Promise<ConditionedResult> {
  try {
    /* withContext carries the provider (ESPN vs Sleeper) + auth headers; a raw
       fetch here made every ESPN league fall through to the Sleeper provider. */
    const [url, init] = withContext(`/api/league/${leagueId}/predictor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, picks, fast }),
      signal,
    });
    const response = await fetch(url, init);

    if (response.status === 404 || response.status === 501) return NOT_IMPLEMENTED;
    if (!response.ok) {
      return {
        available: false,
        reason: 'failed',
        message: `The simulation answered ${response.status}.`,
      };
    }
    return (await response.json()) as ConditionedBoard;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      available: false,
      reason: 'failed',
      message: 'We could not reach the simulation.',
    };
  }
}

/** Both branches of every matchup in a week. Feeds the fork graphic. */
export async function fetchWeekForks(
  leagueId: string,
  userId: string,
  week?: number,
): Promise<WeekForksResult> {
  try {
    const query = new URLSearchParams({ userId });
    if (week != null) query.set('week', String(week));
    const [url, init] = withContext(`/api/league/${leagueId}/forks?${query}`);

    /* Design-fixture leagues answer locally. Without this the replay page hit
       the real API, which has no conditioned sim behind it yet, so the one
       surface built to be designed against could only ever render its own
       error state. Reads the resolved url rather than a hoisted path literal:
       the native-shell guard requires every /api literal to sit directly
       inside withContext(), and the fixture matcher only looks at pathname. */
    const fixture = (await maybeHandleDesignFixtureRequest(url)) as
      | { week: number; forks: WeekFork[] }
      | null;
    if (fixture) return { available: true, week: fixture.week, forks: fixture.forks ?? [] };

    const response = await fetch(url, init);

    if (response.status === 404 || response.status === 501) {
      return { available: false, week: week ?? null, forks: [], message: NOT_IMPLEMENTED.message };
    }
    if (!response.ok) {
      return {
        available: false,
        week: week ?? null,
        forks: [],
        message: `The simulation answered ${response.status}.`,
      };
    }
    const body = (await response.json()) as { week: number; forks: WeekFork[] };
    return { available: true, week: body.week, forks: body.forks ?? [] };
  } catch {
    return {
      available: false,
      week: week ?? null,
      forks: [],
      message: 'We could not reach the simulation.',
    };
  }
}

/** Each team's projected points per remaining week (no sims). Feeds the
 *  per-matchup projection display and the override-box default. */
export interface ProjectedScores {
  available: boolean;
  weeks: { week: number; scores: Record<string, number> }[];
}

export async function fetchProjectedScores(
  leagueId: string,
  userId: string,
): Promise<ProjectedScores> {
  try {
    const query = new URLSearchParams({ userId });
    const [url, init] = withContext(`/api/league/${leagueId}/projected-scores?${query}`);
    const response = await fetch(url, init);
    if (!response.ok) return { available: false, weeks: [] };
    return (await response.json()) as ProjectedScores;
  } catch {
    return { available: false, weeks: [] };
  }
}

/**
 * A stable fingerprint for a pick-set.
 *
 * Order must not matter: picking game A then B is the same scenario as B then
 * A, and treating them as different would throw away a cached run and, worse,
 * make two identical scenarios quote different prices.
 */
export function pickSetHash(picks: readonly Pick[]): string {
  return picks
    .map((pick) => {
      const base = `${pick.week}:${pick.matchupId}:${pick.winnerRosterId}`;
      /* Must match server pickSetHash in engine/leverage.js exactly: custom
         scores are appended only when set, so a plain pick hashes identically. */
      return pick.winnerPoints != null || pick.loserPoints != null
        ? `${base}:${pick.winnerPoints ?? ''}:${pick.loserPoints ?? ''}`
        : base;
    })
    .sort()
    .join('|');
}
