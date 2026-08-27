import type { WeekFork as ForkData } from '../services/predictor.ts';
import type { ForkPair, ForkSide } from '../components/league/WeekFork.tsx';

export interface ForkTeam {
  teamName: string;
  avatarUrl: string | null;
}

/**
 * Group the API shape into the pairs the graphic draws.
 *
 * This used to flatten every fork into a list of sides, because the old
 * rendering was one row per team. Drawing the two branches of a matchup apart
 * from each other threw away the one relationship that makes them readable:
 * they are mirror images. If you win, they lose. A pair drawn together is one
 * question with two answers; the same pair drawn eight rows apart is two
 * unrelated bars.
 */
export function forkPairs(
  forks: readonly ForkData[],
  teamFor: (rosterId: string) => ForkTeam | null,
  userRosterId: string | null,
): ForkPair[] {
  const pairs: ForkPair[] = [];

  for (const fork of forks) {
    /* Anything that is not a two-sided matchup is not a fork. A bye, or a
       payload we do not understand, gets dropped rather than drawn as half a
       graphic. */
    if (fork.sides.length !== 2) continue;

    const sides = fork.sides.map((side): ForkSide | null => {
      const team = teamFor(side.rosterId);
      /* A side we cannot name is skipped rather than drawn against a roster
         id: a bar with no team on it is a bar about nobody. */
      if (!team) return null;
      return {
        rosterId: side.rosterId,
        teamName: team.teamName,
        avatarUrl: team.avatarUrl,
        isUser: userRosterId != null && side.rosterId === userRosterId,
        nowProb: side.nowProb,
        winProb: side.winProb,
        lossProb: side.lossProb,
      };
    });

    if (!sides[0] || !sides[1]) continue;

    pairs.push({
      matchupId: fork.matchupId,
      importance: fork.importance,
      sides: [sides[0], sides[1]],
    });
  }

  return pairs;
}

/**
 * The one ruler every bar in the strip is drawn against.
 *
 * `reach` is the largest single-branch move in the week, rounded up to a
 * multiple of five, and every leg is measured as a fraction of it. Sharing it
 * across all games is the whole point: scaling each matchup to its own range
 * would draw a game worth two points of playoff probability exactly as tall
 * as one worth thirty, which is the single distinction this graphic exists to
 * make.
 *
 * The floor of 5 keeps a week where nothing much is at stake from magnifying
 * rounding noise into a chart full of dramatic bars.
 */
export function forkScale(pairs: readonly ForkPair[]) {
  const sides = pairs.flatMap((pair) => pair.sides);
  const branches = sides.flatMap((side) => [
    side.winProb - side.nowProb,
    side.nowProb - side.lossProb,
  ]);
  const reach = Math.max(5, Math.ceil(Math.max(...branches.map(Math.abs)) / 5) * 5);
  /* Half the track above the now-line and half below, so an up leg and a down
     leg of the same size are drawn the same length. */
  const leg = (delta: number) => Math.min(50, Math.max(0, (Math.abs(delta) / reach) * 50));
  return { reach, leg };
}
