import { useEffect, useState } from 'react';
import { apiUrl } from '../services/apiBase';
import type { TeamGameState } from '../utils/liveScoreline';

/* Every open Hub polls this, and the server answers from a scoreboard cache that
   refreshes every 90s, so a minute is as fresh as the data can be. */
const POLL_MS = 60_000;

export type GameStateMap = Readonly<Record<string, TeamGameState>>;

/* Design fixtures must never read the real scoreboard. They did for an
   afternoon: a rendered test that expects a projection failed because a real
   game involving that player happened to be live, which is a test depending on
   the NFL. Under /design/ the map is empty, unless ?liveGames asks for this
   fixed Sunday so the tags can be looked at and asserted against. */
const DESIGN_LIVE_GAMES: GameStateMap = {
  BAL: { state: 'post', period: 4, clock: '0:00', detail: 'Final' },
  ATL: { state: 'post', period: 4, clock: '0:00', detail: 'Final' },
  MIN: { state: 'in', period: 3, clock: '4:12', detail: '4:12 - 3rd' },
  DET: { state: 'in', period: 5, clock: '2:00', detail: '2:00 - OT' },
  WAS: { state: 'in', period: 2, clock: '0:00', detail: 'Halftime' },
  PHI: { state: 'post', period: 5, clock: '0:00', detail: 'Final/OT' },
};

const NO_GAMES: GameStateMap = {};

function designGameStates(): GameStateMap | null {
  if (typeof window === 'undefined' || !window.location.pathname.startsWith('/design/')) return null;
  return window.location.search.includes('liveGames') ? DESIGN_LIVE_GAMES : NO_GAMES;
}

/* Shared across every component on the page: the Hub and an open game dialog
   should not each run their own clock and disagree about whether a game is over. */
let latest: GameStateMap = {};
/* The NFL week the scoreboard read above belongs to. Null until the first answer.
   Callers that show a specific fantasy week gate on this: after a week rolls over,
   the scoreboard still reports LAST week's games as final for a day or two, and
   stamping those "Final" tags onto the new week's (unplayed) rows is the "every
   game shows FINAL / 0.0 in week 2" bug. When the weeks disagree, the row must
   fall back to its kickoff time and read as upcoming. */
let latestWeek: number | null = null;
const listeners = new Set<() => void>();
let timer: number | undefined;
let inFlight = false;

async function poll() {
  if (inFlight) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  inFlight = true;
  try {
    const response = await fetch(apiUrl('/api/nfl/game-state'));
    if (!response.ok) return;
    const body = (await response.json()) as {
      at?: number; week?: number | null; teams?: Record<string, TeamGameState>;
    };
    /* at 0 means the server has not read the scoreboard yet. Keep what we have
       rather than announce that every game in the league is unknown. */
    if (!body.at || !body.teams) return;
    latest = body.teams;
    latestWeek = body.week ?? null;
    listeners.forEach((listener) => listener());
  } catch {
    // a missed poll keeps the last known state; the next one tries again
  } finally {
    inFlight = false;
  }
}

/**
 * Each NFL team's game this week, keyed by team code: not started, live or
 * final, with the quarter and clock. Empty until the first answer, and callers
 * fall back to kickoff times while it is.
 */
export function useNflGameState(enabled = true): GameStateMap {
  const design = designGameStates();
  const [, force] = useState(0);

  useEffect(() => {
    if (!enabled || design || typeof window === 'undefined') return undefined;
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    if (listeners.size === 1) {
      void poll();
      timer = window.setInterval(() => void poll(), POLL_MS);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
  }, [enabled, design]);

  return design ?? latest;
}

/**
 * The scoreboard game states, but ONLY when the scoreboard's NFL week matches the
 * fantasy week being shown (or the week is unknown). After a week rolls over, the
 * scoreboard still reports the prior week's finals for a day or two; applying those
 * to the new week's rows stamps every player "Final" over a 0.0 score. When the
 * weeks disagree, this returns an empty map so each row falls back to its kickoff
 * time and reads as upcoming (opponent + game time), which is what week 2 should show
 * before its games kick off. Design fixtures are returned as-is (no live scoreboard).
 */
export function useNflGameStateForWeek(fantasyWeek: number | null, enabled = true): GameStateMap {
  const map = useNflGameState(enabled);
  if (designGameStates()) return map;
  if (fantasyWeek == null || latestWeek == null || latestWeek === fantasyWeek) return map;
  return NO_GAMES;
}
