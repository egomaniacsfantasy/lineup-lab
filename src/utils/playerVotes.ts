import type { BoardRow } from '../services/leagueApi';

/**
 * Crowdsourced player ranking, frontend only.
 *
 * A submission is one ordering of three players, which is three pairwise
 * comparisons. That is the shape an ELO-style rating consumes, and it is what
 * this queues for Franco. Nothing here scores, rates or values a player: it
 * selects who to ask about, records what the user said, and stores it.
 */

const QUEUE_KEY = 'og.playerVotes.queue.v2';
const STATE_KEY = 'og.playerVotes.state';
const MAX_QUEUE = 400;

export interface VoteComparison {
  /** The player the user ranked higher. */
  winner: string;
  loser: string;
}

export interface VoteSubmission {
  submittedAt: number;
  /** The three players shown, in the order they were displayed. */
  trio: string[];
  /** Best to worst, as the user ordered them. */
  ordered: string[];
  comparisons: VoteComparison[];
  /** League context, so a vote can be read in the format it was cast in. */
  context: {
    leagueId: string | null;
    scoring: string | null;
    superflex: boolean | null;
    teams: number | null;
  };
  /** Seeded checks with an obvious answer, to catch inattentive runs. */
  attentionCheck: { present: boolean; passed: boolean | null };
  msToAnswer: number;
}

interface VoteState {
  /** Epoch ms of the last time the prompt was shown. */
  lastPromptAt?: number;
  /** Epoch ms until which the user asked not to be prompted. */
  snoozedUntil?: number;
  /** User turned the prompt off in settings. */
  optedOut?: boolean;
  submitted?: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; votes stay in memory for this session only
  }
}

export function readVoteQueue(): VoteSubmission[] {
  const parsed = readJson<VoteSubmission[]>(QUEUE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function queueVote(submission: VoteSubmission) {
  const next = [...readVoteQueue(), submission].slice(-MAX_QUEUE);
  writeJson(QUEUE_KEY, next);
  const state = readVoteState();
  writeVoteState({ ...state, submitted: (state.submitted ?? 0) + 1 });
  return next.length;
}

export function readVoteState(): VoteState {
  return readJson<VoteState>(STATE_KEY, {});
}

export function writeVoteState(state: VoteState) {
  writeJson(STATE_KEY, state);
}

export function snoozeVotes(days: number) {
  const state = readVoteState();
  writeVoteState({ ...state, snoozedUntil: Date.now() + days * 24 * 60 * 60 * 1000 });
}

export function optOutOfVotes() {
  writeVoteState({ ...readVoteState(), optedOut: true });
}

export function markPromptShown() {
  writeVoteState({ ...readVoteState(), lastPromptAt: Date.now() });
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether we have earned the right to ask right now.
 *
 * Deliberately conservative: the prompt never opens the session, never
 * interrupts a decision in progress, and asks at most once a day. A person
 * who says "not now" is snoozed, not lost.
 */
export function canPromptForVote(now = Date.now()) {
  const state = readVoteState();
  if (state.optedOut) return false;
  if (state.snoozedUntil && now < state.snoozedUntil) return false;
  if (state.lastPromptAt && now - state.lastPromptAt < ONE_DAY) return false;
  return true;
}

/** Fisher-Yates, so the three cards are not always in board order. */
function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export interface VoteTrio {
  players: BoardRow[];
  attentionCheck: boolean;
  /** For a check trio, the player the user should rank first. */
  expectedTop: string | null;
}

/**
 * Pick three players worth asking about.
 *
 * Ordinary prompts take an anchor and two neighbours from nearby on the
 * board, because comparisons between players of similar standing are the ones
 * that carry information; three players miles apart tell you nothing you did
 * not already know. Roughly one in eight prompts is instead a deliberate
 * mismatch with an obvious answer, used only to detect people clicking
 * through without reading.
 *
 * Selection only. No value is computed, and the board's own order is read,
 * never rewritten.
 */
export function pickVoteTrio(board: BoardRow[], poolSize = 220): VoteTrio | null {
  const pool = board.filter((row) => row.position !== 'K' && row.position !== 'DEF').slice(0, poolSize);
  if (pool.length < 3) return null;

  const isCheck = Math.random() < 0.125;
  if (isCheck) {
    const top = pool[Math.floor(Math.random() * Math.min(12, pool.length))];
    const tail = pool.slice(Math.max(0, pool.length - 40));
    const others = shuffle(tail.filter((row) => row.playerId !== top.playerId)).slice(0, 2);
    if (others.length < 2) return null;
    return {
      players: shuffle([top, ...others]),
      attentionCheck: true,
      expectedTop: top.playerId,
    };
  }

  const anchorIndex = Math.floor(Math.random() * pool.length);
  const windowStart = Math.max(0, anchorIndex - 6);
  const neighbours = pool
    .slice(windowStart, windowStart + 13)
    .filter((row) => row.playerId !== pool[anchorIndex].playerId);
  if (neighbours.length < 2) return null;

  return {
    players: shuffle([pool[anchorIndex], ...shuffle(neighbours).slice(0, 2)]),
    attentionCheck: false,
    expectedTop: null,
  };
}

/** An ordering, best to worst, expanded into its pairwise comparisons. */
export function comparisonsFromOrder(ordered: string[]): VoteComparison[] {
  const pairs: VoteComparison[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      pairs.push({ winner: ordered[i], loser: ordered[j] });
    }
  }
  return pairs;
}
