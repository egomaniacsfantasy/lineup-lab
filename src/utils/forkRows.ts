import type { WeekFork as ForkData } from '../services/predictor.ts';
import type { ForkRow } from '../components/league/WeekFork.tsx';

/** Flatten the API shape into rows the component draws. */
export function forkRows(
  forks: readonly ForkData[],
  nameFor: (rosterId: string) => string | null,
  userRosterId: string | null,
): ForkRow[] {
  const rows: ForkRow[] = [];
  for (const fork of forks) {
    for (const [index, side] of fork.sides.entries()) {
      const teamName = nameFor(side.rosterId);
      const opponentName = nameFor(fork.sides[1 - index].rosterId);
      /* A side we cannot name is skipped rather than drawn against a roster
         id: a bar with no team on it is a bar about nobody. */
      if (!teamName || !opponentName) continue;
      rows.push({
        rosterId: side.rosterId,
        teamName,
        opponentName,
        isUser: userRosterId != null && side.rosterId === userRosterId,
        nowProb: side.nowProb,
        winProb: side.winProb,
        lossProb: side.lossProb,
        importance: fork.importance,
      });
    }
  }
  return rows;
}
