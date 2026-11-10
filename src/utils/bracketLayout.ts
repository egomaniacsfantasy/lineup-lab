/**
 * Where everything sits on a playoff bracket.
 *
 * A leaf module: no app imports, so the layout runs under the node test
 * runner. It decides POSITION only. Who is in the playoffs, how they are
 * seeded and who plays whom all come from the engine's bracket; this turns
 * that list into columns of slots, puts the first-round byes where the
 * engine's own seed order puts them, and carries a known winner forward so a
 * later round can show one side before the other is settled.
 *
 * A matchup can be picked only when the engine has handed it back, never
 * because this file worked out that both sides are known. The keys a pick is
 * sent under are the engine's, and guessing them here would let the bracket
 * on screen and the bracket being simulated drift apart.
 */

export interface LayoutSide {
  /** null while the team is not known yet. */
  rosterId: string | null;
  /** null once past the first round of an unsettled bracket. */
  seed: number | null;
}

export interface LayoutMatchup {
  round: number;
  idx: number;
  week: number;
  a: { rosterId: string; seed: number };
  b: { rosterId: string; seed: number };
  winnerRosterId: string | null;
}

export interface LayoutBracket {
  seeds: { rosterId: string; seed: number }[];
  rounds: { round: number; week: number; matchups: LayoutMatchup[] }[];
  champion: string | null;
  playoffTeams: number;
  reseed: boolean;
}

export interface LayoutSlot {
  round: number;
  /** Position in the column, top to bottom. */
  position: number;
  kind: 'match' | 'bye';
  sides: LayoutSide[];
  /** The engine's matchup for this slot. Present means it can be picked. */
  matchup: LayoutMatchup | null;
}

export interface LayoutRound {
  round: number;
  week: number | null;
  slots: LayoutSlot[];
}

export interface BracketLayout {
  rounds: LayoutRound[];
  /** Positions feed forward two-into-one, so connector lines are honest.
   *  False for a reseeding bracket, where the next round is re-drawn. */
  connected: boolean;
  /** Games in the whole bracket. */
  games: number;
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** The engine's standardBracketSeeds: 4 gives [1,4,2,3], 8 gives
 *  [1,8,4,5,2,7,3,6]. Mirrored for placement only. */
export function standardSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const out: number[] = [];
  for (const seed of standardSeedOrder(size / 2)) out.push(seed, size + 1 - seed);
  return out;
}

const UNKNOWN: LayoutSide = { rosterId: null, seed: null };

export function layoutBracket(bracket: LayoutBracket | null, playoffTeamsHint: number): BracketLayout {
  const playoffTeams = Math.max(2, bracket?.playoffTeams ?? playoffTeamsHint);
  const size = nextPow2(playoffTeams);
  const rosterOfSeed = new Map((bracket?.seeds ?? []).map((entry) => [entry.seed, entry.rosterId]));
  const seedSide = (seed: number): LayoutSide => ({ rosterId: rosterOfSeed.get(seed) ?? null, seed });
  const served = (round: number, idx: number) =>
    bracket?.rounds[round]?.matchups.find((matchup) => matchup.idx === idx) ?? null;
  const weekOf = (round: number) => bracket?.rounds[round]?.week ?? null;
  const winnerSide = (matchup: LayoutMatchup | null): LayoutSide => {
    if (!matchup?.winnerRosterId) return UNKNOWN;
    return matchup.winnerRosterId === matchup.a.rosterId ? matchup.a : matchup.b;
  };
  const fromMatchup = (round: number, position: number, matchup: LayoutMatchup): LayoutSlot => ({
    round, position, kind: 'match', sides: [matchup.a, matchup.b], matchup,
  });

  if (bracket?.reseed) {
    /* Re-seeded every round: the top seeds sit out, the rest play highest
       against lowest, and the next round is drawn from whoever is left. */
    const rounds: LayoutRound[] = [];
    let survivors = playoffTeams;
    let round = 0;
    while (survivors > 1) {
      const byes = nextPow2(survivors) - survivors;
      const matches = (survivors - byes) / 2;
      const slots: LayoutSlot[] = [];
      for (let i = 0; i < byes; i += 1) {
        slots.push({
          round, position: slots.length, kind: 'bye', matchup: null,
          sides: [round === 0 ? seedSide(i + 1) : UNKNOWN],
        });
      }
      for (let i = 0; i < matches; i += 1) {
        const matchup = served(round, i);
        slots.push(
          matchup
            ? fromMatchup(round, slots.length, matchup)
            : {
                round, position: slots.length, kind: 'match', matchup: null,
                sides: round === 0
                  ? [seedSide(byes + 1 + i), seedSide(playoffTeams - i)]
                  : [UNKNOWN, UNKNOWN],
              },
        );
      }
      rounds.push({ round, week: weekOf(round), slots });
      survivors = byes + matches;
      round += 1;
    }
    return { rounds, connected: false, games: playoffTeams - 1 };
  }

  const order = standardSeedOrder(size);
  const rounds: LayoutRound[] = [];
  /* Who comes out of each slot of the round just laid out. */
  let advancing: LayoutSide[] = [];

  const first: LayoutSlot[] = [];
  for (let position = 0; position < size / 2; position += 1) {
    const pair = [order[position * 2], order[position * 2 + 1]].filter((seed) => seed <= playoffTeams);
    if (pair.length === 1) {
      first.push({ round: 0, position, kind: 'bye', sides: [seedSide(pair[0])], matchup: null });
      advancing.push(seedSide(pair[0]));
    } else {
      const matchup = served(0, position);
      first.push(
        matchup
          ? fromMatchup(0, position, matchup)
          : { round: 0, position, kind: 'match', sides: pair.map(seedSide), matchup: null },
      );
      advancing.push(winnerSide(matchup));
    }
  }
  rounds.push({ round: 0, week: weekOf(0), slots: first });

  for (let round = 1; advancing.length > 1; round += 1) {
    const slots: LayoutSlot[] = [];
    const next: LayoutSide[] = [];
    for (let position = 0; position < advancing.length / 2; position += 1) {
      const matchup = served(round, position);
      slots.push(
        matchup
          ? fromMatchup(round, position, matchup)
          : {
              round, position, kind: 'match', matchup: null,
              /* Past the first round a seed number alone says nothing: the
                 slot belongs to whoever wins, so an unknown side is blank. */
              sides: [advancing[position * 2], advancing[position * 2 + 1]].map((side) =>
                side.rosterId ? side : UNKNOWN,
              ),
            },
      );
      next.push(winnerSide(matchup));
    }
    rounds.push({ round, week: weekOf(round), slots });
    advancing = next;
  }

  return { rounds, connected: true, games: playoffTeams - 1 };
}

/** "Final", "Semifinals", "Quarterfinals", then by number. */
export function bracketRoundLabel(round: number, totalRounds: number) {
  const fromEnd = totalRounds - 1 - round;
  if (fromEnd <= 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${round + 1}`;
}
