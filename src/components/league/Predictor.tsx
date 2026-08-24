import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import {
  fetchConditionedBoard,
  pickSetHash,
  type ConditionedRow,
  type Pick,
} from '../../services/predictor';
import './Predictor.css';

export interface PredictorGame {
  week: number;
  matchupId: number;
  home: { rosterId: string; teamName: string; winProb?: number };
  away: { rosterId: string; teamName: string; winProb?: number };
}

export interface PredictorBaselineRow {
  rosterId: string;
  teamName: string;
  isUser: boolean;
  playoffProb: number;
  titleProb: number;
  titleOdds: number;
}

/**
 * The Predictor: pick the rest of the season and watch the book move.
 *
 * The interaction rules that matter, and why:
 *
 * One action per side. Clicking a team picks it; clicking it again unpicks;
 * clicking its opponent flips. There is no confirm and no separate clear,
 * because a scenario tool people will not play with is a scenario tool that
 * does not work, and every extra keystroke is a reason not to try one more
 * thing.
 *
 * Unpicked games stay probabilistic and the interface says so out loud. The
 * distinction between "I forced this" and "the sim decided this" is the whole
 * epistemic basis of the numbers, and a board that blurs it is lying about
 * what it knows.
 *
 * A run in flight suspends the prices it will replace rather than leaving the
 * old ones on screen. Stale numbers next to fresh picks read as the answer to
 * the question just asked, which is the most dangerous state this screen can
 * be in — worse than a blank, because a blank cannot be misread.
 *
 * Every response carries the hash of the pick-set that produced it and is
 * discarded on mismatch. Without that, a slow run started three clicks ago
 * lands after a fast one and repaints the board with a scenario the user has
 * already moved past: real numbers describing the wrong world.
 *
 * The conditioned simulation itself is not implemented yet. This component
 * calls the contract in services/predictor.ts and renders whatever comes back;
 * until the endpoint answers it says so plainly and shows the unconditioned
 * board, which is a true thing rather than a placeholder.
 */
export function Predictor({
  leagueId,
  userId,
  games,
  baseline,
  storageKey,
}: {
  leagueId: string;
  userId: string;
  games: PredictorGame[];
  baseline: PredictorBaselineRow[];
  storageKey: string;
}) {
  const [picks, setPicks] = useState<Pick[]>(() => readPicks(storageKey));
  const [board, setBoard] = useState<ConditionedRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hash = useMemo(() => pickSetHash(picks), [picks]);

  useEffect(() => {
    writePicks(storageKey, picks);
  }, [picks, storageKey]);

  useEffect(() => {
    /* Nothing forced is the baseline, which we already have. Asking the server
       to simulate "no picks" would spend a run to be told what is on screen. */
    if (picks.length === 0) {
      setBoard(null);
      setPending(false);
      setNotice(null);
      abortRef.current?.abort();
      return undefined;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);

    let cancelled = false;
    fetchConditionedBoard(leagueId, userId, picks, controller.signal)
      .then((result) => {
        if (cancelled) return;
        if (!result.available) {
          setBoard(null);
          setNotice(result.message);
          return;
        }
        /* The guard that makes concurrency safe: a run whose picks are no
           longer the picks on screen is thrown away, never painted. */
        if (result.pickSetHash !== hash) return;
        setBoard(result.rows);
        setNotice(null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPending(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [leagueId, userId, picks, hash]);

  const pickedFor = useCallback(
    (matchupId: number) => picks.find((pick) => pick.matchupId === matchupId) ?? null,
    [picks],
  );

  const choose = (game: PredictorGame, rosterId: string) => {
    setPicks((current) => {
      const existing = current.find((pick) => pick.matchupId === game.matchupId);
      if (!existing) {
        return [...current, { week: game.week, matchupId: game.matchupId, winnerRosterId: rosterId }];
      }
      /* Same side twice unpicks; the other side flips. One control, three
         outcomes, no separate clear button to hunt for. */
      if (existing.winnerRosterId === rosterId) {
        return current.filter((pick) => pick.matchupId !== game.matchupId);
      }
      return current.map((pick) =>
        pick.matchupId === game.matchupId ? { ...pick, winnerRosterId: rosterId } : pick,
      );
    });
  };

  const byWeek = useMemo(() => {
    const map = new Map<number, PredictorGame[]>();
    for (const game of games) map.set(game.week, [...(map.get(game.week) ?? []), game]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [games]);

  const conditioned = useMemo(() => {
    if (!board) return null;
    return new Map(board.map((row) => [row.rosterId, row]));
  }, [board]);

  const totalRemaining = games.length;

  return (
    <section aria-labelledby="predictor-title" className="predictor">
      <header className="predictor__head">
        <div>
          <p className="predictor__kicker">The Predictor</p>
          <h2 className="predictor__title" id="predictor-title">
            Call the rest of the season
          </h2>
          <p className="predictor__sub">
            {picks.length === 0
              ? `Every game below is still simulated. Pick one and the whole book reprices.`
              : `${picks.length} of ${totalRemaining} games called. The other ${totalRemaining - picks.length} are still simulated.`}
          </p>
        </div>
        {picks.length > 0 ? (
          <button className="predictor__reset" onClick={() => setPicks([])} type="button">
            Clear picks
          </button>
        ) : null}
      </header>

      {notice ? <p className="predictor__notice">{notice}</p> : null}

      <div className="predictor__body">
        <div className="predictor__picks">
          {byWeek.map(([week, weekGames]) => (
            <div className="predictor__week" key={week}>
              <p className="predictor__week-label">Week {week}</p>
              {weekGames.map((game) => {
                const pick = pickedFor(game.matchupId);
                return (
                  <div className="predictor__game" key={game.matchupId}>
                    {[game.away, game.home].map((side) => {
                      const chosen = pick?.winnerRosterId === side.rosterId;
                      const beaten = pick != null && !chosen;
                      return (
                        <button
                          aria-pressed={chosen}
                          className={[
                            'predictor__side',
                            chosen ? 'predictor__side--picked' : '',
                            beaten ? 'predictor__side--beaten' : '',
                          ].filter(Boolean).join(' ')}
                          key={side.rosterId}
                          onClick={() => choose(game, side.rosterId)}
                          type="button"
                        >
                          <span className="predictor__side-name">{side.teamName}</span>
                          {typeof side.winProb === 'number' ? (
                            <span className="predictor__side-prob">{side.winProb.toFixed(0)}%</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="predictor__consequences">
          <div className="predictor__consequences-head">
            <span>Team</span>
            <span className="predictor__num">Playoffs</span>
            <span className="predictor__num">Title</span>
          </div>
          {baseline.map((row) => {
            const next = conditioned?.get(row.rosterId) ?? null;
            /* Suspended, not stale. While a run is in flight the numbers it
               will replace are held rather than shown, because an old price
               beside a fresh pick reads as the answer to the question just
               asked. */
            const suspended = pending && picks.length > 0;
            const playoffDelta = next ? next.playoffProb - row.playoffProb : null;

            return (
              <div
                className={['predictor__row', row.isUser ? 'predictor__row--you' : '']
                  .filter(Boolean).join(' ')}
                key={row.rosterId}
              >
                <span className="predictor__row-team">{row.teamName}</span>
                <span className="predictor__num predictor__row-playoff">
                  {suspended ? (
                    <span className="predictor__suspended" aria-label="repricing" />
                  ) : (
                    <>
                      {(next?.playoffProb ?? row.playoffProb).toFixed(0)}%
                      {playoffDelta != null && Math.abs(playoffDelta) >= 0.5 ? (
                        <span
                          className={`predictor__delta predictor__delta--${playoffDelta > 0 ? 'up' : 'down'}`}
                        >
                          {playoffDelta > 0 ? '+' : '−'}{Math.abs(playoffDelta).toFixed(0)}
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
                <span className="predictor__num predictor__row-title">
                  {suspended ? (
                    <span className="predictor__suspended" aria-label="repricing" />
                  ) : (
                    formatAmericanOdds(next?.titleOdds ?? row.titleOdds)
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function readPicks(key: string): Pick[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as Pick[]) : [];
  } catch {
    return [];
  }
}

function writePicks(key: string, picks: Pick[]) {
  try {
    if (picks.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(picks));
  } catch {
    /* Private browsing: the scenario lasts the session. */
  }
}
