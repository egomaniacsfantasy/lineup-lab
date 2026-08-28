import { useEffect, useState } from 'react';
import { churn, forkScale } from '../../utils/forkRows.ts';
import { TeamAvatar } from './TeamAvatar';
import './WeekFork.css';

export interface ForkSide {
  rosterId: string;
  teamName: string;
  avatarUrl: string | null;
  isUser: boolean;
  nowProb: number;
  winProb: number;
  lossProb: number;
}

export interface ForkPair {
  matchupId: number;
  /** 0-100, relative to the biggest swing in the same week. */
  importance: number;
  sides: [ForkSide, ForkSide];
}

/**
 * Drives the loading churn, and stops for anyone who has asked motion to stop.
 *
 * Returns null when the animation should not run at all, which the caller
 * reads as "draw the still version".
 */
function useChurnTick(active: boolean) {
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    setTick(0);
    /* Fast enough that no frame reads as a settled value. A slower churn is
       the dangerous one: it gives the eye long enough to take a number off a
       bar that has not been computed yet. */
    const timer = window.setInterval(() => setTick((current) => (current ?? 0) + 1), 70);
    return () => window.clearInterval(timer);
  }, [active]);

  return tick;
}

/**
 * One churning figure.
 *
 * Every one on screen goes through here, so the thing that makes it safe —
 * that it is never handed to assistive technology as a probability — is
 * stated once rather than repeated at each call site where it could be
 * dropped from one and kept in the others.
 */
function ChurnFigure({ branch, tick, seed }: { branch: 'win' | 'loss'; tick: number; seed: number }) {
  return (
    <span aria-hidden="true" className={`week-fork__churn week-fork__churn--${branch}`}>
      {churn(tick, seed)}
    </span>
  );
}

/* Shared by the strip and its skeleton: the caption is the one part that is
   known before the sim answers, so it should not blink in with the bars. */
function ForkGutter({ week }: { week: number | null }) {
  return (
    <div className="week-fork__gutter">
      <p className="week-fork__axis-label">Playoff swing</p>
      {week != null ? <p className="week-fork__week">Week {week}</p> : null}
      <p className="week-fork__key">
        <span className="week-fork__key-item week-fork__key-item--win">Win</span>
        <span className="week-fork__key-item week-fork__key-item--loss">Lose</span>
      </p>
    </div>
  );
}

function TeamChip({ side }: { side: ForkSide }) {
  return (
    <span
      className={['week-fork__team', side.isUser ? 'week-fork__team--you' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className="week-fork__team-top">
        <TeamAvatar avatarUrl={side.avatarUrl} className="week-fork__crest" name={side.teamName} />
        <span className="week-fork__team-now">{side.nowProb.toFixed(0)}%</span>
      </span>
      <span className="week-fork__team-name">
        <span>{side.teamName}</span>
      </span>
    </span>
  );
}

/**
 * What this week is worth, as a strip above the board rather than a table
 * below it.
 *
 * Every other surface in the product answers "where do you stand". This one
 * answers "what is on the line", which is a different and more urgent
 * question, and the one a weekly board should answer before you have read
 * anything.
 *
 * Each team gets a bar hanging off a shared now-line. Green above is what a
 * win adds, red below is what a loss costs, and the two are rarely the same
 * size — a team can have a game with far more downside than upside, which is
 * the fact a single bar drawn from loss to win cannot express at all. Read
 * across the strip and the longest bars are the week's real games.
 *
 * Games are grouped in pairs because the two branches of a matchup are mirror
 * images: if you win, they lose. Ordered by the engine's own importance, so
 * left to right walks the week from the game that decides most to the one
 * that decides least.
 *
 * The axis lives in the left gutter rather than in a header. A header would
 * cost a title, a subtitle and the space between them — 60-odd pixels above a
 * graphic whose entire purpose is to introduce the board without pushing it
 * down the page — to say what an axis label and two swatches say in a column
 * that was empty anyway.
 *
 * Draws nothing at all without a conditioned sim behind it. A fork with
 * invented branches is worse than no fork, because the length of those bars
 * reads as a claim about how much a week matters.
 */
export function WeekFork({
  pairs,
  week,
  unavailableMessage,
  loading = false,
  expectedGames = 0,
  mostInfluentialGame = null,
}: {
  pairs: ForkPair[];
  week: number | null;
  unavailableMessage?: string;
  /** The conditioned sim has not answered yet. */
  loading?: boolean;
  /** Games this week, from the schedule, so the skeleton is the right width. */
  expectedGames?: number;
  /** matchupId whose result swings the league's title+playoff picture most; gets the
   *  "Most influential" tag. null hides the tag entirely. */
  mostInfluentialGame?: number | null;
}) {
  const tick = useChurnTick(loading && pairs.length === 0 && expectedGames > 0);

  /* Waiting is the normal case, not an edge one.

     This strip is the first thing on the tab and the slowest thing on it:
     every bar is a conditioned sim of both branches of a game, so the server
     is doing real work while the rest of the page is already painted. With
     nothing rendered for that second the strip simply appeared out of
     nowhere and shoved the board down the page, which reads as a glitch
     rather than as a wait.

     The skeleton is the finished layout with the numbers missing, drawn at
     the same height and the same game count the real strip will use, so
     nothing moves when the answer lands. */
  if (loading && pairs.length === 0 && expectedGames > 0) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading playoff odds for this week"
        className="week-fork week-fork--loading"
      >
        <ForkGutter week={week} />
        <div className="week-fork__games">
          {Array.from({ length: expectedGames }, (_, game) => (
            <div className="week-fork__game" key={game}>
              <div aria-hidden="true" className="week-fork__grid">
                <span className="week-fork__gridline" style={{ top: '0%' }} />
                <span className="week-fork__gridline week-fork__gridline--now" style={{ top: '50%' }} />
                <span className="week-fork__gridline" style={{ top: '100%' }} />
              </div>
              <div className="week-fork__plot">
                {[0, 1].map((side) => {
                  const seed = game * 2 + side;
                  return (
                    <div className="week-fork__col" key={side}>
                      <div className="week-fork__track">
                        {/* Two legs off the same line as the real bar, both
                            swaying, out of phase with their neighbours so the
                            strip reads as a book being searched rather than a
                            row of identical metronomes. */}
                        <span
                          className="week-fork__ghost-leg week-fork__ghost-leg--up"
                          style={{ animationDelay: `${(seed % 5) * -0.31}s` }}
                        />
                        <span
                          className="week-fork__ghost-leg week-fork__ghost-leg--down"
                          style={{ animationDelay: `${(seed % 4) * -0.37}s` }}
                        />
                        {/* Hidden from assistive tech: these are motion, not
                            data, and read aloud they would be a probability
                            nobody has computed. */}
                        {tick != null ? (
                          <>
                            <ChurnFigure branch="win" seed={seed} tick={tick} />
                            <ChurnFigure branch="loss" seed={seed + 97} tick={tick} />
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="week-fork__teams">
                {[0, 1].map((side) => (
                  <span className="week-fork__team" key={side}>
                    <span className="week-fork__team-top">
                      <span className="week-fork__ghost week-fork__ghost--crest" />
                    </span>
                    <span className="week-fork__team-name">
                      <span className="week-fork__ghost week-fork__ghost--name" />
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (unavailableMessage) {
    return (
      <section className="week-fork week-fork--empty">
        <p className="week-fork__kicker">What this week is worth</p>
        <p className="week-fork__unavailable">{unavailableMessage}</p>
      </section>
    );
  }

  if (pairs.length === 0) return null;

  /* Every bar hangs off a common now-line rather than being plotted on an
     absolute 0-100 axis.

     The absolute version was the first build and it wasted the widget. A
     league with a 93% team and an 11% team forces the axis to span 82 points,
     so the largest thing on screen becomes the gap between two teams that are
     not even playing each other, and the swings the graphic exists to show
     end up as stubs using a fifth of the height. In a strip this short that
     is the whole budget spent on the wrong quantity.

     Level is not lost, it is moved: each team's standing is printed under its
     own crest, which is where you look for it anyway. What the geometry now
     carries is the thing that is otherwise invisible: how far a team moves,
     and whether it moves further up than down. */
  const { leg } = forkScale(pairs);

  /* Biggest swing first. The engine's importance is the ranking to trust —
     it is the number the sim actually produced — and reading left to right
     then walks the week from the game that decides most to the one that
     decides least. */
  const ordered = [...pairs].sort((a, b) => b.importance - a.importance);
  const influential =
    mostInfluentialGame != null
      ? ordered.find((pair) => pair.matchupId === mostInfluentialGame)
      : undefined;

  return (
    <div className="week-fork__wrap">
      {/* One quiet line, not a header: names the game whose result reshapes the
          league's title + playoff picture the most this week. Sits above the strip
          so it never disturbs the now-line alignment the bars depend on. */}
      {influential ? (
        <p
          className="week-fork__caption"
          title="Its result swings the league's title and playoff odds more than any other game this week"
        >
          <span aria-hidden="true">🔑</span> Most influential game:{' '}
          <strong>{influential.sides[0].teamName}</strong> vs{' '}
          <strong>{influential.sides[1].teamName}</strong>
        </p>
      ) : null}
      <section
        aria-label={`Playoff odds if each team wins or loses${week != null ? `, week ${week}` : ''}`}
        className="week-fork"
      >
      {/* No numeric scale down the side.

          It was there as a ruler, on the reasoning that bars you cannot
          measure are decoration. That reasoning does not survive contact with
          this chart: every bar already prints its own two endpoints, so the
          axis was offering a slower way to read a number that was sitting
          right there. A ruler beside a labelled quantity is furniture. */}
      <ForkGutter week={week} />

      <div className="week-fork__games">
        {ordered.map((pair) => (
          <div
            className={[
              'week-fork__game',
              pair.sides.some((side) => side.isUser) ? 'week-fork__game--you' : '',
              pair.matchupId === mostInfluentialGame ? 'week-fork__game--key' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={pair.matchupId}
          >
            {/* One baseline per game, edge to edge, so adjacent games join
                into a line that runs the width of the strip. Drawn per game
                rather than as one overlay because the strip wraps to two rows
                on a phone, and an overlay can only be right about one of
                them. */}
            <div aria-hidden="true" className="week-fork__grid">
              <span className="week-fork__gridline" style={{ top: '0%' }} />
              <span className="week-fork__gridline week-fork__gridline--now" style={{ top: '50%' }} />
              <span className="week-fork__gridline" style={{ top: '100%' }} />
            </div>

            <div className="week-fork__plot">
              {pair.sides.map((side) => {
                /* The bar is split at where the team stands now, not drawn as
                   one block from loss to win. The pivot is the point of the
                   graphic: green is what a win ADDS, red is what a loss TAKES,
                   and those two are rarely the same size. A single gradient
                   bar hid that asymmetry behind a colour ramp — it showed how
                   much was at stake without showing which way it leaned. */
                /* A floor on each leg so a branch worth almost nothing is
                   still a mark you can see, not a hairline that reads as a
                   rendering fault. */
                const up = Math.max(2, leg(side.winProb - side.nowProb));
                const down = Math.max(2, leg(side.nowProb - side.lossProb));

                return (
                  <div className="week-fork__col" key={side.rosterId}>
                    <div
                      className="week-fork__track"
                      title={`${side.teamName}: ${side.nowProb.toFixed(0)}% now, ${side.winProb.toFixed(0)}% with a win, ${side.lossProb.toFixed(0)}% with a loss`}
                    >
                      <span
                        className="week-fork__leg week-fork__leg--up"
                        style={{ bottom: '50%', height: `${up}%` }}
                      />
                      <span
                        className="week-fork__leg week-fork__leg--down"
                        style={{ top: '50%', height: `${down}%` }}
                      />
                      {/* The destinations, not the deltas: the leg length is
                          already the delta, so labelling its end with the
                          same fact twice would leave "and then where am I?"
                          unanswered. */}
                      <span
                        className="week-fork__cap week-fork__cap--win"
                        style={{ bottom: `${50 + up}%` }}
                      >
                        {side.winProb.toFixed(0)}
                      </span>
                      <span
                        className="week-fork__cap week-fork__cap--loss"
                        style={{ top: `${50 + down}%` }}
                      >
                        {side.lossProb.toFixed(0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Same two-column grid as the plot above, so every chip sits
                under its own candle. */}
            <div className="week-fork__teams">
              <TeamChip side={pair.sides[0]} />
              <TeamChip side={pair.sides[1]} />
            </div>
          </div>
        ))}
      </div>
    </section>
    </div>
  );
}
