import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { TeamAvatar } from './TeamAvatar';
import {
  fetchConditionedBoard,
  pickSetHash,
  type Bracket,
  type BracketMatchup,
  type BracketPick,
  type BracketSideRef,
  type ConditionedRow,
  type Pick,
} from '../../services/predictor';
import './Predictor.css';

export interface PredictorSide {
  rosterId: string;
  teamName: string;
  avatarUrl?: string | null;
  winProb?: number;
  /** Projected points this week — shown on the matchup and used as the
   *  override-box default. */
  projPoints?: number;
}

export interface PredictorGame {
  week: number;
  matchupId: number;
  home: PredictorSide;
  away: PredictorSide;
}

export interface PredictorBaselineRow {
  rosterId: string;
  teamName: string;
  avatarUrl?: string | null;
  isUser: boolean;
  playoffProb: number;
  playoffOdds: number;
  titleProb: number;
  titleOdds: number;
  record: { wins: number; losses: number; ties: number };
  pointsFor: number | null;
}

function formatRecord(r: { wins: number; losses: number; ties: number } | null | undefined) {
  if (!r) return '—';
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

/** A navigation step: a regular-season week or a playoff round. */
type Step =
  | { kind: 'week'; key: string; label: string; week: number; games: PredictorGame[] }
  | { kind: 'playoff'; key: string; label: string; round: number; week: number; matchups: BracketMatchup[] };

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundLabel(round: number, totalRounds: number) {
  const fromEnd = totalRounds - 1 - round;
  if (fromEnd <= 0) return 'Playoffs · Final';
  if (fromEnd === 1) return 'Playoffs · Semifinals';
  if (fromEnd === 2) return 'Playoffs · Quarterfinals';
  return `Playoffs · Round ${round + 1}`;
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
  projByWeekRoster,
}: {
  leagueId: string;
  userId: string;
  games: PredictorGame[];
  baseline: PredictorBaselineRow[];
  storageKey: string;
  /** Projected points keyed `${week}:${rosterId}` — covers playoff weeks too, so
   *  playoff matchups can show each team's projection. */
  projByWeekRoster?: Map<string, number>;
}) {
  const [picks, setPicks] = useState<Pick[]>(() => readPicks(storageKey));
  const [bracketPicks, setBracketPicks] = useState<BracketPick[]>([]);
  const [board, setBoard] = useState<ConditionedRow[] | null>(null);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hash = useMemo(() => pickSetHash(picks, bracketPicks), [picks, bracketPicks]);

  useEffect(() => {
    writePicks(storageKey, picks);
  }, [picks, storageKey]);

  useEffect(() => {
    /* Nothing forced is the baseline, which we already have. Asking the server
       to simulate "no picks" would spend a run to be told what is on screen. */
    if (picks.length === 0) {
      setBoard(null);
      setBracket(null);
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
    fetchConditionedBoard(leagueId, userId, picks, controller.signal, { bracketPicks })
      .then((result) => {
        if (cancelled) return;
        if (!result.available) {
          setBoard(null);
          setBracket(null);
          setNotice(result.message);
          return;
        }
        /* The guard that makes concurrency safe: a run whose picks are no
           longer the picks on screen is thrown away, never painted. */
        if (result.pickSetHash !== hash) return;
        setBoard(result.rows);
        setBracket(result.bracket ?? null);
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
  }, [leagueId, userId, picks, bracketPicks, hash]);

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

  /* Override the projected score for a called game. Committed on blur, never
     per keystroke — each commit reprices the whole board (one sim), so typing
     "124" must not fire three runs. Blank clears the override back to projected. */
  const setPoints = (matchupId: number, side: 'winner' | 'loser', raw: string) => {
    const n = Number(raw);
    const val = raw.trim() === '' || Number.isNaN(n) ? undefined : n;
    setPicks((current) =>
      current.map((pick) => {
        if (pick.matchupId !== matchupId) return pick;
        const nextPick: Pick = { ...pick };
        if (side === 'winner') {
          if (val == null) delete nextPick.winnerPoints;
          else nextPick.winnerPoints = val;
        } else if (val == null) delete nextPick.loserPoints;
        else nextPick.loserPoints = val;
        return nextPick;
      }),
    );
  };

  /* Team display info (name/avatar) by rosterId — for the playoff matchups, whose
     bracket data carries only rosterId + seed. */
  const teamInfo = useMemo(() => new Map(baseline.map((r) => [r.rosterId, r])), [baseline]);

  /* One control per playoff matchup, same as the regular-season cards: click a
     team to advance it, click again to unpick, click the other to flip. Any change
     at a round drops every LATER round's picks — those matchups no longer exist. */
  const chooseBracket = (round: number, idx: number, rosterId: string) => {
    setBracketPicks((current) => {
      const existing = current.find((bp) => bp.round === round && bp.idx === idx);
      const kept = current.filter((bp) => bp.round <= round);
      if (!existing) return [...kept, { round, idx, winnerRosterId: rosterId }];
      if (existing.winnerRosterId === rosterId) {
        return kept.filter((bp) => !(bp.round === round && bp.idx === idx));
      }
      return kept.map((bp) =>
        bp.round === round && bp.idx === idx ? { ...bp, winnerRosterId: rosterId } : bp,
      );
    });
  };

  /* One step at a time, with navigation. Regular weeks first, then — once the whole
     regular season is called and the seeds are fixed — the playoff rounds, which the
     server hands back progressively as each round is picked. A week is a thing you
     can finish; so is a playoff round. */
  const steps = useMemo<Step[]>(() => {
    const weekList = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);
    const weekSteps: Step[] = weekList.map((w) => ({
      kind: 'week', key: `w${w}`, label: `Week ${w}`, week: w, games: games.filter((g) => g.week === w),
    }));
    const totalRounds = bracket ? Math.max(1, Math.round(Math.log2(nextPow2(bracket.playoffTeams)))) : 0;
    const playoffSteps: Step[] = (bracket?.rounds ?? []).map((rd) => ({
      kind: 'playoff', key: `p${rd.round}`, label: roundLabel(rd.round, totalRounds),
      round: rd.round, week: rd.week, matchups: rd.matchups,
    }));
    return [...weekSteps, ...playoffSteps];
  }, [games, bracket]);

  const [stepIndex, setStepIndex] = useState(0);
  const safeStepIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const activeStep = steps[safeStepIndex] ?? null;
  const stepPicked =
    activeStep?.kind === 'week'
      ? picks.filter((pick) => pick.week === activeStep.week).length
      : activeStep?.kind === 'playoff'
        ? bracketPicks.filter((bp) => bp.round === activeStep.round).length
        : 0;
  const stepTotal =
    activeStep?.kind === 'week' ? activeStep.games.length
      : activeStep?.kind === 'playoff' ? activeStep.matchups.length : 0;

  const conditioned = useMemo(() => {
    if (!board) return null;
    return new Map(board.map((row) => [row.rosterId, row]));
  }, [board]);

  /* Standings order: current record, then points-for, then — on an exact tie or
     before any games are called (everyone 0-0, PF 0) — championship odds. Uses
     the conditioned values when a scenario is live so calling games reorders the
     board the way real results would. */
  const sortedRows = useMemo(() => {
    const recScore = (r: { wins?: number; ties?: number } | null | undefined) =>
      (r?.wins ?? 0) + 0.5 * (r?.ties ?? 0);
    const implied = (american: number | null | undefined) => {
      if (american == null) return 0;
      return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
    };
    return [...baseline].sort((a, b) => {
      const na = conditioned?.get(a.rosterId);
      const nb = conditioned?.get(b.rosterId);
      const wa = recScore(na?.record ?? a.record);
      const wb = recScore(nb?.record ?? b.record);
      if (wb !== wa) return wb - wa;
      const pa = na?.pointsFor ?? a.pointsFor ?? 0;
      const pb = nb?.pointsFor ?? b.pointsFor ?? 0;
      if (pb !== pa) return pb - pa;
      return implied(nb?.titleOdds ?? b.titleOdds) - implied(na?.titleOdds ?? a.titleOdds);
    });
  }, [baseline, conditioned]);

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
        {/* No clear button here: the week bar carries both resets, and two
            controls doing the same thing one row apart is how people learn not
            to trust either. */}
      </header>

      {notice ? <p className="predictor__notice">{notice}</p> : null}

      {/* Week navigation. One week at a time is the whole point: nine weeks
          stacked is a wall you work through, a week is a thing you finish. */}
      <div className="predictor__weekbar">
        <button
          className="predictor__weeknav"
          disabled={safeStepIndex <= 0}
          onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          type="button"
        >
          ‹ Prev
        </button>

        <div className="predictor__weekpicker">
          <label className="visually-hidden" htmlFor="predictor-week">Week or round</label>
          <select
            className="predictor__weekselect"
            id="predictor-week"
            onChange={(event) => setStepIndex(steps.findIndex((s) => s.key === event.target.value))}
            value={activeStep?.key ?? ''}
          >
            {steps.map((step) => (
              <option key={step.key} value={step.key}>{step.label}</option>
            ))}
          </select>
          <span className="predictor__weekcount">
            {stepPicked} of {stepTotal} called
          </span>
        </div>

        <button
          className="predictor__weeknav"
          disabled={safeStepIndex >= steps.length - 1}
          onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
          type="button"
        >
          Next ›
        </button>

        <span className="predictor__weekbar-spacer" />

        <button
          className="predictor__weekaction"
          disabled={stepPicked === 0}
          onClick={() => {
            if (activeStep?.kind === 'week') {
              const w = activeStep.week;
              setPicks((current) => current.filter((pick) => pick.week !== w));
            } else if (activeStep?.kind === 'playoff') {
              const r = activeStep.round;
              setBracketPicks((current) => current.filter((bp) => bp.round < r));
            }
          }}
          type="button"
        >
          Reset
        </button>
        <button
          className="predictor__weekaction"
          disabled={picks.length === 0 && bracketPicks.length === 0}
          onClick={() => { setPicks([]); setBracketPicks([]); }}
          type="button"
        >
          Clear all
        </button>
      </div>

      <div className="predictor__body">
        <div className="predictor__picks">
          {activeStep?.kind === 'week' ? activeStep.games.map((game) => {
            const pick = pickedFor(game.matchupId);
            return (
              <div className="predictor__game" key={game.matchupId}>
                {/* The two sides are wrapped so the "vs" divider can anchor to
                    them. Centred on the whole game instead, it slid halfway
                    down the score-entry row the moment a game was called. */}
                <div className="predictor__game-sides">
                {[game.away, game.home].map((side, index) => {
                  const chosen = pick?.winnerRosterId === side.rosterId;
                  const beaten = pick != null && !chosen;
                  return (
                    <button
                      aria-pressed={chosen}
                      className={[
                        'predictor__side',
                        index === 1 ? 'predictor__side--home' : '',
                        chosen ? 'predictor__side--picked' : '',
                        beaten ? 'predictor__side--beaten' : '',
                      ].filter(Boolean).join(' ')}
                      key={side.rosterId}
                      onClick={() => choose(game, side.rosterId)}
                      type="button"
                    >
                      {/* The logo is the pick target, the way every scenario
                          tool people already use works. A team is a crest
                          before it is a string. */}
                      <TeamAvatar avatarUrl={side.avatarUrl} name={side.teamName} />
                      <span className="predictor__side-copy">
                        <span className="predictor__side-name">{side.teamName}</span>
                        {typeof side.projPoints === 'number' ? (
                          <span className="predictor__side-prob">{side.projPoints.toFixed(1)}</span>
                        ) : typeof side.winProb === 'number' ? (
                          <span className="predictor__side-prob">{side.winProb.toFixed(0)}%</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
                </div>

                {pick ? (
                  /* Inputs sit in the SAME away/home order as the buttons above, so
                     each score box lines up under its own team. The winner/loser
                     role (which field it writes) is derived from the pick, not the
                     column, so picking the home team no longer mislabels the box. */
                  <div className="predictor__scores">
                    {[game.away, game.home].map((side) => {
                      const isWinner = side.rosterId === pick.winnerRosterId;
                      const role = isWinner ? ('winner' as const) : ('loser' as const);
                      const value = isWinner ? pick.winnerPoints : pick.loserPoints;
                      return (
                        <label className="predictor__score" key={side.rosterId}
                        >
                          <span className="predictor__score-team">{side.teamName}</span>
                          <input
                            className="predictor__score-input"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step="0.1"
                            /* The projection itself, not the word "proj". A
                               placeholder that names the concept tells you
                               less than one that shows the number the box
                               will use if you leave it alone. */
                            placeholder={side.projPoints != null ? side.projPoints.toFixed(1) : ''}
                            defaultValue={value ?? ''}
                            key={`${game.matchupId}:${side.rosterId}:${value ?? ''}`}
                            onBlur={(event) => setPoints(game.matchupId, role, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }) : activeStep?.kind === 'playoff' ? (
            <>
              {bracket?.champion ? (
                <p className="predictor__champ">
                  🏆 {teamInfo.get(bracket.champion)?.teamName ?? 'Champion'} wins it all
                </p>
              ) : null}
              {activeStep.matchups.map((matchup) => {
                const pick = bracketPicks.find(
                  (bp) => bp.round === matchup.round && bp.idx === matchup.idx,
                );
                const sides = [matchup.a, matchup.b].map((ref: BracketSideRef) => {
                  const info = teamInfo.get(ref.rosterId);
                  return {
                    rosterId: ref.rosterId,
                    seed: ref.seed,
                    teamName: info?.teamName ?? `#${ref.seed}`,
                    avatarUrl: info?.avatarUrl ?? null,
                    projPoints: projByWeekRoster?.get(`${matchup.week}:${ref.rosterId}`),
                  };
                });
                return (
                  <div className="predictor__game" key={`${matchup.round}:${matchup.idx}`}>
                    {sides.map((side, index) => {
                      const chosen = pick?.winnerRosterId === side.rosterId;
                      const beaten = pick != null && !chosen;
                      return (
                        <button
                          aria-pressed={chosen}
                          className={[
                            'predictor__side',
                            index === 1 ? 'predictor__side--home' : '',
                            chosen ? 'predictor__side--picked' : '',
                            beaten ? 'predictor__side--beaten' : '',
                          ].filter(Boolean).join(' ')}
                          key={side.rosterId}
                          onClick={() => chooseBracket(matchup.round, matchup.idx, side.rosterId)}
                          type="button"
                        >
                          <TeamAvatar avatarUrl={side.avatarUrl} name={side.teamName} />
                          <span className="predictor__side-copy">
                            <span className="predictor__side-name">
                              <span className="predictor__seed">#{side.seed}</span> {side.teamName}
                            </span>
                            {typeof side.projPoints === 'number' ? (
                              <span className="predictor__side-prob">{side.projPoints.toFixed(1)}</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {activeStep.matchups.length === 0 ? (
                <p className="predictor__empty">This round isn’t set yet — call the earlier round first.</p>
              ) : null}
            </>
          ) : (
            <p className="predictor__empty">No games left to call.</p>
          )}
        </div>

        <div className="predictor__consequences">
          <div className="predictor__consequences-head">
            <span>Team</span>
            <span className="predictor__num">Record</span>
            <span className="predictor__num">PF</span>
            <span className="predictor__num">Playoffs</span>
            <span className="predictor__num">Title</span>
          </div>
          {sortedRows.map((row) => {
            const next = conditioned?.get(row.rosterId) ?? null;
            /* Suspended, not stale. While a run is in flight the numbers it
               will replace are held rather than shown, because an old price
               beside a fresh pick reads as the answer to the question just
               asked. */
            const suspended = pending && picks.length > 0;
            const playoffDelta = next ? next.playoffProb - row.playoffProb : null;
            /* Record + PF are deterministic (base + forced picks), so they show
               through a reprice rather than blanking like the simulated columns. */
            const rec = next?.record ?? row.record;
            const pf = next?.pointsFor ?? row.pointsFor;

            return (
              <div
                className={['predictor__row', row.isUser ? 'predictor__row--you' : '']
                  .filter(Boolean).join(' ')}
                key={row.rosterId}
              >
                <span className="predictor__row-team">
                  <TeamAvatar avatarUrl={row.avatarUrl} name={row.teamName} />
                  <span className="predictor__row-name">{row.teamName}</span>
                </span>
                <span className="predictor__num predictor__row-rec">{formatRecord(rec)}</span>
                <span className="predictor__num predictor__row-pf">
                  {pf != null ? pf.toFixed(1) : '—'}
                </span>
                <span className="predictor__num predictor__row-playoff">
                  {suspended ? (
                    <span className="predictor__suspended" aria-label="repricing" />
                  ) : (
                    <>
                      {/* Through the same formatter as the title column, so
                          the two follow the header toggle together. A raw "%"
                          beside a formatted price put two scales in one row
                          and made the toggle look broken. */}
                      {formatAmericanOdds(next?.playoffOdds ?? row.playoffOdds)}
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
