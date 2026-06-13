import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { LineChangeFlash } from '../components/matchup/LineChangeFlash';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { usePlayerDetail } from '../contexts/PlayerDetailContext';
import { getPlayerManifestEntry } from '../data/playerManifest';
import { useMatchupEngine } from '../hooks/useMatchupEngine';
import {
  MOCK_MATCHUP,
  MOCK_PLAYER_POOL,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WAIVER_SUGGESTION,
  MOCK_WEEKLY_TRAJECTORY,
} from '../mocks';
import { toMatchupData } from '../adapters/connectedLeague';
import { setStoredCascadeScenarioLabel } from '../utils/seasonSelection';
import { formatAmericanOdds } from '../utils/formatOdds';
import {
  roundTo,
  winProbabilityToMoneyline,
} from '../utils/lineupComparison';
import { evaluateStarterRoster, getTopSwapEvaluation } from '../utils/starterEvaluation';
import type {
  BenchPlayer,
  MatchupData,
  MatchupLine,
  Player,
  RosterSlot,
} from '../types';
import './MatchupPage.css';

function getBestAlternative(slot: RosterSlot) {
  return slot.alternatives.reduce<(typeof slot.alternatives)[number] | null>(
    (bestAlternative, alternative) => {
      if (!bestAlternative) {
        return alternative;
      }

      if (alternative.deltaWinProbability > 0 && bestAlternative.deltaWinProbability <= 0) {
        return alternative;
      }

      if (alternative.deltaWinProbability <= 0 && bestAlternative.deltaWinProbability > 0) {
        return bestAlternative;
      }

      return alternative.deltaWinProbability > bestAlternative.deltaWinProbability
        ? alternative
        : bestAlternative;
    },
    null,
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatProjection(value: number) {
  return value.toFixed(1);
}

function formatSignedPercent(value: number) {
  const rounded = roundTo(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

function formatMatchupForMeta(gameLine: string) {
  const match = gameLine.match(/^([A-Z]{2,3})\s[+-].*?\s(@|vs)\s([A-Z]{2,3})$/);

  if (!match) {
    return gameLine.split(' · ')[0] ?? gameLine;
  }

  return `${match[1]} ${match[2]} ${match[3]}`;
}

/**
 * Betting-convention spread label with a real minus glyph: the favorite
 * lays points ("You −7.4"), the dog gets them ("You +7.4").
 */
function formatTeamSpread(spread: number) {
  const rounded = Math.round(spread * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "Pick 'em";
  return rounded > 0 ? `You −${rounded.toFixed(1)}` : `You +${Math.abs(rounded).toFixed(1)}`;
}

/** One line of voice that actually matches the number. */
function heroVerdict(winProbability: number) {
  if (winProbability >= 75) return 'Heavy favorite. Don’t get cute.';
  if (winProbability >= 60) return 'Clear edge. Protect it with the right starts.';
  if (winProbability >= 52) return 'Slight edge. One bad break away from sweating.';
  if (winProbability >= 48) return 'Coin flip. Every lineup call is the ballgame.';
  if (winProbability >= 35) return 'Underdog, but live. The right swap moves this line.';
  return 'Long shot this week. Swing for ceiling, not floor.';
}

function formatVerdict(playerName: string, deltaWinProbability: number) {
  const rounded = roundTo(deltaWinProbability);

  if (rounded > 0) {
    return `Starting ${playerName} adds ${formatSignedPercent(rounded)} win probability.`;
  }

  if (rounded < 0) {
    return `Starting ${playerName} costs ${rounded.toFixed(1)}% win probability.`;
  }

  return `Starting ${playerName} leaves your win probability unchanged.`;
}

function getPlayerContext(player: Player) {
  const entry = getPlayerManifestEntry(player.slug ?? player.id);
  const kickoff = entry?.week8_2024.kickoff ?? 'Sun 1pm';
  const gameLine = entry?.week8_2024.gameLine ?? 'Line pending';

  return {
    kickoff,
    gameLine,
    matchup: formatMatchupForMeta(gameLine),
  };
}

function buildExposureWindows(roster: RosterSlot[]) {
  const grouped = new Map<
    string,
    {
      key: string;
      dayLabel: string;
      detail: string;
      lockLabel: string;
      projection: number;
      players: Player[];
      order: number;
    }
  >();

  const dayOrder: Record<string, number> = {
    THU: 0,
    FRI: 1,
    SAT: 2,
    SUN: 3,
    MON: 4,
  };

  roster.forEach((slot) => {
    const context = getPlayerContext(slot.starter);
    const [dayPart, ...timeParts] = context.kickoff.split(' ');
    const dayLabel = dayPart.slice(0, 3).toUpperCase();
    const timeLabel = timeParts.join(' ').replace('pm', '').replace('am', '').trim();
    const key = `${dayLabel}-${timeLabel}`;
    const existing = grouped.get(key);
    const lockLabel = dayLabel === 'THU' ? `${timeLabel} tonight` : timeLabel;

    if (existing) {
      existing.projection += slot.projection;
      existing.players.push(slot.starter);
      return;
    }

    grouped.set(key, {
      key,
      dayLabel,
      detail: context.matchup,
      lockLabel,
      projection: slot.projection,
      players: [slot.starter],
      order: dayOrder[dayLabel] ?? 10,
    });
  });

  const totalProjection = roster.reduce((sum, slot) => sum + slot.projection, 0);

  return Array.from(grouped.values())
    .sort((left, right) => left.order - right.order)
    .map((window) => {
      const matchupCount = new Set(
        window.players.map((player) => getPlayerContext(player).matchup),
      ).size;

      return {
        ...window,
        share: Math.round((window.projection / totalProjection) * 100),
        detail:
          window.players.length === 1
            ? `${window.detail} · locks ${window.lockLabel}`
            : `${matchupCount} ${matchupCount === 1 ? 'game' : 'games'} · locks ${window.lockLabel}`,
      };
    });
}

function buildBenchImpactRows(
  bench: BenchPlayer[],
  baselineRoster: RosterSlot[],
  getOptionLine: (slotIndex: number, alternativeIndex: number | null) => MatchupLine,
) {
  return bench.map((benchPlayer) => {
    const bestFit = baselineRoster.reduce<{
      slotIndex: number;
      slot: RosterSlot;
      alternativeIndex: number;
      line: MatchupLine;
      delta: number;
    } | null>((best, slot, slotIndex) => {
      const alternativeIndex = slot.alternatives.findIndex(
        (alternative) => alternative.player.id === benchPlayer.player.id,
      );

      if (alternativeIndex === -1) {
        return best;
      }

      const line = getOptionLine(slotIndex, alternativeIndex);
      const currentLine = getOptionLine(slotIndex, null);
      const delta = roundTo(line.winProbability - currentLine.winProbability);

      if (!best || delta > best.delta) {
        return {
          slotIndex,
          slot,
          alternativeIndex,
          line,
          delta,
        };
      }

      return best;
    }, null);

    return {
      ...benchPlayer,
      bestFit,
    };
  });
}

function TeamCrest({
  teamName,
  isUser = false,
}: {
  teamName: string;
  isUser?: boolean;
}) {
  const stroke = isUser ? 'var(--gold)' : 'var(--ink-3)';

  const glyphs: Record<string, ReactNode> = {
    "Zeus's Bolts": (
      <path d="M13 2 6 13h4l-1 9 9-12h-5l0-8Z" />
    ),
    'Hermes Express': (
      <>
        <circle cx="12" cy="7" r="2.5" />
        <path d="M12 9.5v8M7 12c3 2 7 2 10 0M8.5 19l3.5-4 3.5 4" />
      </>
    ),
    'Apollo Archers': (
      <>
        <path d="M7 17c6-1 10-5 10-10" />
        <path d="M7 17c1-6 5-10 10-10" />
        <path d="M6 18 18 6" />
      </>
    ),
    'Poseidon Waves': (
      <>
        <path d="M12 3v15" />
        <path d="M7 8 12 3l5 5" />
        <path d="M6 15c1.5 1.7 3 1.7 4.5 0 1.5-1.7 3-1.7 4.5 0" />
      </>
    ),
    'Hades Hounds': (
      <>
        <path d="M7 16v-5l3-3 4 1 3 4v3" />
        <path d="M9 8 8 5M14 9l2-3" />
      </>
    ),
    'Athena Owls': (
      <>
        <circle cx="9" cy="10" r="1.5" />
        <circle cx="15" cy="10" r="1.5" />
        <path d="M7 17c1.5-4 8.5-4 10 0M10 13h4" />
      </>
    ),
    'Ares Warriors': (
      <>
        <path d="M12 4 7 8v5c0 3 2 5 5 7 3-2 5-4 5-7V8l-5-4Z" />
        <path d="M12 8v8" />
      </>
    ),
    'Dionysus Vines': (
      <>
        <path d="M12 4c-3 0-5 2-5 5 0 3 2 5 5 5s5-2 5-5c0-3-2-5-5-5Z" />
        <path d="M12 14v6M9 7l3 2 3-2" />
      </>
    ),
    'Artemis Arrows': (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M5 19 19 5M15 5h4v4" />
      </>
    ),
    'Hephaestus Forge': (
      <>
        <path d="M6 16h9l3-4h-6l-1-4-3 8H6Z" />
        <path d="M7 10h3" />
      </>
    ),
    'Demeter Fields': (
      <>
        <path d="M12 4v16M9 7l3 2 3-2M9 11l3 2 3-2M9 15l3 2 3-2" />
      </>
    ),
    'Kronos Titans': (
      <>
        <path d="M8 4h8M8 20h8M9 4c0 5 6 5 6 8s-6 3-6 8M15 4c0 5-6 5-6 8s6 3 6 8" />
      </>
    ),
  };

  // Real teams get their initials, not a generic glyph.
  const initials = teamName
    .split(/\s+/)
    .map((word) => word[0])
    .filter((c) => /[A-Za-z0-9]/.test(c ?? ''))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={[
        'olympus-crest',
        isUser ? 'olympus-crest--user' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {glyphs[teamName] ? (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
          {glyphs[teamName]}
        </svg>
      ) : (
        <span className="olympus-crest__initials">{initials || '—'}</span>
      )}
    </span>
  );
}

function MarketMoverRow({
  label,
  sublabel,
  from,
  to,
  avatar,
  crestTeam,
}: {
  label: string;
  sublabel: string;
  from: number;
  to: number;
  avatar?: Player | null;
  crestTeam?: string;
}) {
  return (
    <div className="matchup-page__mover-row">
      <div className="matchup-page__mover-identity">
        {avatar ? (
          <PlayerHeadshot
            className="matchup-page__headshot matchup-page__headshot--mover"
            fallbackClassName="matchup-page__headshot-fallback"
            imageClassName="matchup-page__headshot-image"
            player={avatar}
          />
        ) : crestTeam ? (
          <TeamCrest teamName={crestTeam} />
        ) : null}
        <div>
          <p className="matchup-page__mover-label">{label}</p>
          <p className="matchup-page__mover-meta">{sublabel}</p>
        </div>
      </div>
      <p className="matchup-page__price-shift">
        <span className="matchup-page__price-old">{formatAmericanOdds(from)}</span>{' '}
        <span className={to < from ? 'matchup-page__price-new matchup-page__price-new--up' : 'matchup-page__price-new matchup-page__price-new--down'}>
          {formatAmericanOdds(to)}
        </span>
      </p>
    </div>
  );
}

function CompareSheet({
  comparison,
  leftPlayer,
  rightPlayer,
  tapeNote = '',
  onClose,
}: {
  comparison: {
    slotIndex: number;
    leftLine: MatchupLine;
    rightLine: MatchupLine;
    leftProjection: number;
    rightProjection: number;
    deltaWinProbability: number;
  };
  leftPlayer: Player;
  rightPlayer: Player;
  tapeNote?: string;
  onClose: () => void;
}) {
  // slotIndex >= 0: a real swap inside one lineup slot, priced by the
  // engine. slotIndex === -1: the two players can't trade places this
  // week, so show an honest projection face-off, never a fake line.
  const isSwap = comparison.slotIndex >= 0;
  const projectionDelta = roundTo(comparison.rightProjection - comparison.leftProjection);
  const rightWins = isSwap ? comparison.deltaWinProbability > 0 : projectionDelta > 0;
  const leftWins = isSwap ? comparison.deltaWinProbability < 0 : projectionDelta < 0;

  const headlineNumber = isSwap
    ? formatSignedPercent(comparison.deltaWinProbability)
    : `${projectionDelta > 0 ? '+' : ''}${projectionDelta.toFixed(1)} pts`;
  const headlineWinner = rightWins ? rightPlayer : leftWins ? leftPlayer : null;

  const verdict = isSwap
    ? formatVerdict(rightPlayer.shortName, comparison.deltaWinProbability)
    : headlineWinner
      ? `${headlineWinner.shortName} projects ${Math.abs(projectionDelta).toFixed(1)} more points this week. ${tapeNote}`.trim()
      : `Dead even on projection. ${tapeNote}`.trim();

  const maxProjection = Math.max(comparison.leftProjection, comparison.rightProjection, 1);

  const sides = [
    {
      player: leftPlayer,
      projection: comparison.leftProjection,
      line: comparison.leftLine,
      winner: leftWins,
    },
    {
      player: rightPlayer,
      projection: comparison.rightProjection,
      line: comparison.rightLine,
      winner: rightWins,
    },
  ];

  return (
    <div className="matchup-page__compare-scrim" onClick={onClose} role="presentation">
      <section
        aria-labelledby="compare-sheet-title"
        className="matchup-page__compare-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="matchup-page__compare-header">
          <div>
            <p className="matchup-page__eyebrow">Who do I start?</p>
            <h2 className="matchup-page__module-title" id="compare-sheet-title">
              {isSwap ? 'The verdict' : 'Side by side'}
            </h2>
          </div>
          <button
            aria-label="Close compare"
            className="matchup-page__sheet-close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="matchup-page__compare-headline">
          <span
            className={[
              'matchup-page__compare-delta',
              headlineWinner ? 'matchup-page__compare-delta--live' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {headlineNumber}
          </span>
          <span className="matchup-page__meta-copy">
            {isSwap ? 'win probability if you swap' : 'projection gap'}
          </span>
        </div>

        <div className="matchup-page__compare-cards matchup-page__compare-cards--faceoff">
          {sides.map(({ player, projection, line, winner }) => (
            <article
              className={[
                'matchup-page__compare-card',
                winner ? 'matchup-page__compare-card--winner' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={player.id}
            >
              {winner ? <span className="matchup-page__compare-edge-tag">Edge</span> : null}
              <div className="matchup-page__compare-player">
                <PlayerHeadshot
                  className="matchup-page__headshot matchup-page__headshot--compare"
                  fallbackClassName="matchup-page__headshot-fallback"
                  imageClassName="matchup-page__headshot-image"
                  player={player}
                />
                <div>
                  <h3 className="matchup-page__row-name">{player.shortName}</h3>
                  <p className="matchup-page__row-secondary">
                    {player.position} · {player.team}
                  </p>
                </div>
              </div>
              <div className="matchup-page__compare-stats">
                <p className="matchup-page__compare-stat">
                  <span className="matchup-page__meta-copy">Projection</span>
                  <span className="matchup-page__inline-number">
                    {formatProjection(projection)} pts
                  </span>
                </p>
                <span
                  aria-hidden="true"
                  className="matchup-page__compare-bar"
                >
                  <span
                    className={[
                      'matchup-page__compare-bar-fill',
                      winner ? 'matchup-page__compare-bar-fill--winner' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ width: `${Math.max(6, (projection / maxProjection) * 100)}%` }}
                  />
                </span>
                {isSwap ? (
                  <p className="matchup-page__compare-stat">
                    <span className="matchup-page__meta-copy">Line if started</span>
                    <span className="matchup-page__inline-number">
                      {formatAmericanOdds(line.moneyline)} · {line.winProbability.toFixed(1)}%
                    </span>
                  </p>
                ) : null}
              </div>
            </article>
          ))}
          <span aria-hidden="true" className="matchup-page__compare-vs">
            VS
          </span>
        </div>

        <p className="matchup-page__compare-verdict">{verdict}</p>
      </section>
    </div>
  );
}

interface PricedMover {
  kind: string;
  headline: string;
  detail: string;
  playerId?: string;
  before: number;
  after: number;
}

interface TitlePoint {
  week: number;
  odds: number;
}

/**
 * Title price, week by week. Real points only — never invents weeks that
 * haven't happened. Y axis is inverted so a SHORTER price (better odds)
 * plots higher.
 */
function TitlePriceChart({
  series,
  variant,
}: {
  series: TitlePoint[];
  variant: 'mobile' | 'desktop';
}) {
  if (series.length === 0) return null;

  const current = series[series.length - 1];
  const opened = series[0];

  const headline = (
    <>
      <div className="matchup-page__module-row">
        <h2 className="matchup-page__module-title">Title price, week by week</h2>
        <p className="matchup-page__meta-copy">Week {current.week}</p>
      </div>

      <div className="matchup-page__trajectory-headline">
        <span className="matchup-page__trajectory-price">
          {formatAmericanOdds(current.odds)}
        </span>
        <span className="matchup-page__meta-copy">
          opened{' '}
          <span className="matchup-page__inline-number">
            {formatAmericanOdds(opened.odds)}
          </span>
        </span>
      </div>
    </>
  );

  if (series.length < 2) {
    return (
      <section
        className={`matchup-page__module matchup-page__module--trajectory matchup-page__module--${variant}`}
      >
        {headline}
        <p className="matchup-page__meta-copy">
          Your title price charts here week by week once games start.
        </p>
      </section>
    );
  }

  // inverted axis: best (lowest) price on top
  const best = Math.min(...series.map((p) => p.odds));
  const worst = Math.max(...series.map((p) => p.odds));
  const span = Math.max(1, worst - best);
  const mid = Math.round((best + worst) / 2);
  const top = 14;
  const bottom = 90;
  const left = 44;
  const right = 324;

  const xFor = (index: number) =>
    series.length === 1
      ? left
      : left + (index / (series.length - 1)) * (right - left);
  const yFor = (odds: number) => top + ((odds - best) / span) * (bottom - top);

  const midIndex = Math.floor((series.length - 1) / 2);
  const last = series[series.length - 1];

  return (
    <section
      className={`matchup-page__module matchup-page__module--trajectory matchup-page__module--${variant}`}
    >
      {headline}

      <svg className="matchup-page__trajectory-chart" viewBox="0 0 340 110">
        <line className="matchup-page__chart-grid" x1="36" x2="336" y1={top} y2={top} />
        <line className="matchup-page__chart-grid" x1="36" x2="336" y1="52" y2="52" />
        <line className="matchup-page__chart-grid" x1="36" x2="336" y1={bottom} y2={bottom} />
        <text className="matchup-page__chart-axis" textAnchor="end" x="30" y={top + 3}>
          {formatAmericanOdds(best)}
        </text>
        <text className="matchup-page__chart-axis" textAnchor="end" x="30" y="55">
          {formatAmericanOdds(mid)}
        </text>
        <text className="matchup-page__chart-axis" textAnchor="end" x="30" y={bottom + 3}>
          {formatAmericanOdds(worst)}
        </text>
        <polyline
          className="matchup-page__chart-line"
          fill="none"
          points={series
            .map((point, index) => `${xFor(index)},${yFor(point.odds)}`)
            .join(' ')}
        />
        <circle
          className="matchup-page__chart-point"
          cx={xFor(series.length - 1)}
          cy={yFor(last.odds)}
          r="4"
        />
        <text className="matchup-page__chart-axis" textAnchor="middle" x={left} y="106">
          W{series[0].week}
        </text>
        {series.length > 2 ? (
          <text
            className="matchup-page__chart-axis"
            textAnchor="middle"
            x={xFor(midIndex)}
            y="106"
          >
            W{series[midIndex].week}
          </text>
        ) : null}
        <text className="matchup-page__chart-axis" textAnchor="middle" x={right} y="106">
          W{last.week}
        </text>
      </svg>
    </section>
  );
}

interface MatchupLiveProps {
  matchup: MatchupData;
  isConnected: boolean;
  isPriced?: boolean;
  lineMovement?: { from: number; to: number; at: number } | null;
  scoringNote?: string | null;
  unpricedStarterCount?: number;
  seasonLabel?: string;
  movers?: PricedMover[];
  titleSeries?: TitlePoint[];
}

function MatchupLive({
  matchup,
  isConnected,
  isPriced = false,
  lineMovement = null,
  scoringNote = null,
  unpricedStarterCount = 0,
  seasonLabel,
  movers = [],
  titleSeries = [],
}: MatchupLiveProps) {
  const engine = useMatchupEngine(matchup);
  const { openPlayerDetail } = usePlayerDetail();
  const { stored } = useLeagueConnection();
  const starterEvaluations = useMemo(
    () => evaluateStarterRoster(engine.baselineRoster),
    [engine.baselineRoster],
  );
  const topSwapEvaluation = useMemo(
    () => getTopSwapEvaluation(starterEvaluations),
    [starterEvaluations],
  );
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<Player[]>([]);
  const [compareModalPlayers, setCompareModalPlayers] = useState<[Player, Player] | null>(null);
  const [isRecapDismissed, setIsRecapDismissed] = useState(false);

  const playerMap = useMemo(
    () => new Map(MOCK_PLAYER_POOL.map((player) => [player.id, player])),
    [],
  );
  const topTradeTarget = useMemo(
    () =>
      MOCK_TRADE_TARGET_GROUPS.flatMap((group) => group.targets).sort(
        (targetA, targetB) => targetB.fitScore - targetA.fitScore,
      )[0] ?? null,
    [],
  );
  const biggestSwing = topSwapEvaluation?.bestBenchAlternative
    ? {
        slotIndex: topSwapEvaluation.slotIndex,
        starter: topSwapEvaluation.currentStarter,
        alternativeIndex: topSwapEvaluation.alternativeIndex,
        alternative: topSwapEvaluation.bestBenchAlternative.player,
        beforeLine: engine.getOptionLine(topSwapEvaluation.slotIndex, null),
        afterLine: engine.getOptionLine(
          topSwapEvaluation.slotIndex,
          topSwapEvaluation.alternativeIndex,
        ),
        delta: topSwapEvaluation.delta,
      }
    : null;

  useEffect(() => {
    if (!topSwapEvaluation?.bestBenchAlternative) {
      return;
    }

    setStoredCascadeScenarioLabel(
      `Start ${topSwapEvaluation.bestBenchAlternative.player.shortName}`,
    );
  }, [topSwapEvaluation]);

  const exposureWindows = useMemo(() => buildExposureWindows(engine.roster), [engine.roster]);
  const downsideLine = useMemo(() => {
    const nextWindow = exposureWindows[0];

    if (!nextWindow) {
      return null;
    }

    const droppedWinProbability = clamp(
      roundTo(engine.activeLine.yours.winProbability - nextWindow.share * 0.35),
      5,
      95,
    );

    return {
      from: engine.activeLine.yours.moneyline,
      to: winProbabilityToMoneyline(droppedWinProbability),
    };
  }, [engine.activeLine.yours.moneyline, engine.activeLine.yours.winProbability, exposureWindows]);

  const benchRows = useMemo(
    () => buildBenchImpactRows(engine.bench, engine.baselineRoster, engine.getOptionLine),
    [engine.baselineRoster, engine.bench, engine.getOptionLine],
  );

  const compareResult = useMemo(() => {
    if (!compareModalPlayers) {
      return null;
    }

    return engine.compareAnyTwoPlayers(compareModalPlayers[0], compareModalPlayers[1]);
  }, [compareModalPlayers, engine]);

  const handleShareRecap = async () => {
    const text = 'You closed at -180 and won by 12. Best call: London over Smith, +17.5 pts.';

    if (navigator.share) {
      await navigator.share({
        title: 'Olympus recap',
        text,
      });
      return;
    }

    await navigator.clipboard.writeText(text);
  };

  // Eligibility: only pairs a manager could actually weigh against each
  // other. Same position always; RB/WR/TE against each other only when
  // the league runs a flex slot.
  const FLEX_GROUP = ['RB', 'WR', 'TE'];
  const hasFlexSlot = matchup.yourTeam.roster.some((slot) => slot.slotLabel === 'FLEX');
  const isComparable = (a: Player, b: Player) =>
    a.position === b.position ||
    (hasFlexSlot && FLEX_GROUP.includes(a.position) && FLEX_GROUP.includes(b.position));

  const handleComparePick = (player: Player) => {
    setIsCompareMode(true);
    setCompareSelection((current) => {
      if (current.some((candidate) => candidate.id === player.id)) {
        return current.filter((candidate) => candidate.id !== player.id);
      }

      if (current.length === 1 && !isComparable(current[0], player)) {
        return current; // ineligible rows are disabled; belt and braces
      }

      const nextSelection = [...current, player].slice(-2);

      if (nextSelection.length === 2) {
        setCompareModalPlayers([nextSelection[0], nextSelection[1]]);
      }

      return nextSelection;
    });
  };

  // Closing the verdict keeps your first pick on the slip, so trying a
  // different second player is one tap, not a restart.
  const closeVerdict = () => {
    setCompareModalPlayers(null);
    setCompareSelection((current) => current.slice(0, 1));
  };

  const exitCompare = () => {
    setCompareModalPlayers(null);
    setCompareSelection([]);
    setIsCompareMode(false);
  };

  const removePick = (playerId: string) => {
    setCompareSelection((current) => current.filter((candidate) => candidate.id !== playerId));
  };

  const renderLineupRow = ({
    player,
    slotLabel,
    meta,
    projection,
    tone = 'starter',
    selected = false,
    actionLabel,
    onAction,
  }: {
    player: Player;
    slotLabel: string;
    meta: string;
    projection: number;
    tone?: 'starter' | 'bench';
    selected?: boolean;
    actionLabel?: string;
    onAction?: () => void;
  }) => {
    const pickOrder = compareSelection.findIndex(
      (candidate) => candidate.id === player.id,
    );
    const ineligible =
      isCompareMode &&
      compareSelection.length >= 1 &&
      pickOrder === -1 &&
      !isComparable(compareSelection[0], player);

    return (
      <div
        className={[
          'matchup-page__lineup-row',
          tone === 'bench' ? 'matchup-page__lineup-row--bench' : '',
          isCompareMode && !ineligible ? 'matchup-page__lineup-row--pickable' : '',
          ineligible ? 'matchup-page__lineup-row--ineligible' : '',
          selected ? 'matchup-page__lineup-row--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        key={`${slotLabel}-${player.id}`}
        title={ineligible ? `Different position than ${compareSelection[0]?.shortName}` : undefined}
      >
        <button
          aria-pressed={isCompareMode ? selected : undefined}
          className="matchup-page__lineup-hitbox"
          disabled={ineligible}
          onClick={() => {
            if (isCompareMode) {
              handleComparePick(player);
              return;
            }

            const context = getPlayerContext(player);
            openPlayerDetail({
              player,
              slug: player.slug ?? player.id,
              projection,
              gameLine: context.gameLine,
            });
          }}
          type="button"
        >
          <span className="matchup-page__slot-tag">{slotLabel}</span>
          <span className="matchup-page__lineup-player">
            <PlayerHeadshot
              className="matchup-page__headshot"
              fallbackClassName="matchup-page__headshot-fallback"
              imageClassName="matchup-page__headshot-image"
              player={player}
            />
            <span className="matchup-page__lineup-copy">
              <span className="matchup-page__row-name">{player.shortName}</span>
              <span className="matchup-page__row-secondary">{meta}</span>
            </span>
          </span>
          {pickOrder >= 0 ? (
            <span className="matchup-page__pick-badge">{pickOrder + 1}</span>
          ) : (
            <span className="matchup-page__projection">{formatProjection(projection)}</span>
          )}
        </button>
        {actionLabel && onAction ? (
          <button className="matchup-page__row-action" onClick={onAction} type="button">
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="matchup-page">
      <h1 className="visually-hidden">The Olympus matchup screen</h1>
      <LineChangeFlash
        delta={engine.lastChangeDelta}
        visible={engine.lastChangeDelta !== 0}
      />

      <section className="matchup-page__story">
        <section className="matchup-page__module matchup-page__module--hero">
          <div className="matchup-page__module-row">
            <span className="matchup-page__eyebrow">
              Week {matchup.week} · head-to-head
            </span>
            <span className="matchup-page__live-chip">
              <span className="matchup-page__live-dot" aria-hidden="true" />
              Live line
            </span>
          </div>

          <div className="matchup-page__faceoff">
            <div className="matchup-page__faceoff-side">
              <div className="matchup-page__faceoff-identity">
                <TeamCrest isUser teamName={matchup.yourTeam.teamName} />
                <div>
                  <p className="matchup-page__team-name">{matchup.yourTeam.teamName}</p>
                  <p className="matchup-page__meta-copy">
                    {matchup.yourTeam.managerName} · {matchup.yourTeam.record}
                  </p>
                </div>
              </div>
              <span className="matchup-page__hero-number">
                {formatAmericanOdds(engine.activeLine.yours.moneyline)}
              </span>
              <p className="matchup-page__meta-copy">
                Proj{' '}
                <span className="matchup-page__inline-number">
                  {formatProjection(engine.activeLine.yours.projection)}
                </span>{' '}
                pts
              </p>
            </div>

            <div className="matchup-page__faceoff-vs" aria-hidden="true">
              VS
            </div>

            <div className="matchup-page__faceoff-side matchup-page__faceoff-side--opp">
              <div className="matchup-page__faceoff-identity matchup-page__faceoff-identity--opp">
                <TeamCrest teamName={matchup.opponentTeam.teamName} />
                <div>
                  <p className="matchup-page__team-name">{matchup.opponentTeam.teamName}</p>
                  <p className="matchup-page__meta-copy">
                    {matchup.opponentTeam.managerName} · {matchup.opponentTeam.record}
                  </p>
                </div>
              </div>
              <span className="matchup-page__hero-number matchup-page__hero-number--opp">
                {formatAmericanOdds(engine.activeLine.opponent.moneyline)}
              </span>
              <p className="matchup-page__meta-copy">
                Proj{' '}
                <span className="matchup-page__inline-number">
                  {formatProjection(engine.activeLine.opponent.projection)}
                </span>{' '}
                pts
              </p>
            </div>
          </div>

          <div
            aria-label={`Win probability ${engine.activeLine.yours.winProbability.toFixed(1)}%`}
            className="matchup-page__winbar"
          >
            <span
              className="matchup-page__winbar-fill"
              style={{ width: `${engine.activeLine.yours.winProbability}%` }}
            />
          </div>
          <div className="matchup-page__winbar-labels">
            <span className="matchup-page__winbar-label matchup-page__winbar-label--user">
              {engine.activeLine.yours.winProbability.toFixed(1)}% you
            </span>
            <span className="matchup-page__winbar-label">
              {engine.activeLine.opponent.winProbability.toFixed(1)}% them
            </span>
          </div>

          <div className="matchup-page__hero-meta-row">
            <span className="matchup-page__meta-copy">
              Spread{' '}
              <span className="matchup-page__inline-number">
                {formatTeamSpread(engine.activeLine.yours.spread)}
              </span>
            </span>
            <span className="matchup-page__meta-copy">
              Total{' '}
              <span className="matchup-page__inline-number">
                {engine.activeLine.yours.total.toFixed(1)}
              </span>
            </span>
          </div>

          <p className="matchup-page__body-copy">
            {heroVerdict(engine.activeLine.yours.winProbability)}
          </p>
        </section>

        {scoringNote ? <SeasonalNotice>{scoringNote}</SeasonalNotice> : null}
        {unpricedStarterCount > 0 ? (
          <SeasonalNotice>
            {unpricedStarterCount} of your starters{' '}
            {unpricedStarterCount === 1 ? 'is' : 'are'} outside the projection
            sheet, so this board is reduced-confidence.
          </SeasonalNotice>
        ) : null}
        {lineMovement ? (
          <SeasonalNotice>
            The market moved from {formatAmericanOdds(lineMovement.from)} to{' '}
            {formatAmericanOdds(lineMovement.to)} this week.
          </SeasonalNotice>
        ) : null}
        {isConnected && !isPriced ? (
          <SeasonalNotice>
            Live league connected. Pricing is provisional until projections finish syncing.
          </SeasonalNotice>
        ) : null}
        {seasonLabel ? <SeasonalNotice>{seasonLabel}</SeasonalNotice> : null}

        {biggestSwing ? (
          <section className="matchup-page__module">
            <div className="matchup-page__module-row">
              <h2 className="matchup-page__module-title">Biggest edge</h2>
              <span className="matchup-page__signal matchup-page__signal--up">Swap</span>
            </div>
            <div className="matchup-page__edge-row">
              <div className="matchup-page__edge-copy">
                <div className="matchup-page__headshot-stack" aria-hidden="true">
                  <PlayerHeadshot
                    className="matchup-page__headshot matchup-page__headshot--stack"
                    fallbackClassName="matchup-page__headshot-fallback"
                    imageClassName="matchup-page__headshot-image"
                    player={biggestSwing.starter}
                  />
                  <PlayerHeadshot
                    className="matchup-page__headshot matchup-page__headshot--stack matchup-page__headshot--selected"
                    fallbackClassName="matchup-page__headshot-fallback"
                    imageClassName="matchup-page__headshot-image"
                    player={biggestSwing.alternative}
                  />
                </div>
                <div>
                  <p className="matchup-page__edge-label">
                    {biggestSwing.starter.shortName} to {biggestSwing.alternative.shortName}
                  </p>
                  <p className="matchup-page__meta-copy">
                    Win prob{' '}
                    <span className="matchup-page__inline-number">
                      <span className="matchup-page__price-old">
                        {biggestSwing.beforeLine.winProbability.toFixed(1)}%
                      </span>{' '}
                      <span className="matchup-page__price-new matchup-page__price-new--up">
                        {biggestSwing.afterLine.winProbability.toFixed(1)}%
                      </span>
                    </span>{' '}
                    · line{' '}
                    <span className="matchup-page__inline-number">
                      <span className="matchup-page__price-old">
                        {formatAmericanOdds(biggestSwing.beforeLine.moneyline)}
                      </span>{' '}
                      <span className="matchup-page__price-new matchup-page__price-new--up">
                        {formatAmericanOdds(biggestSwing.afterLine.moneyline)}
                      </span>
                    </span>
                  </p>
                </div>
              </div>
              <span className="matchup-page__edge-delta matchup-page__edge-delta--up">
                {formatSignedPercent(biggestSwing.delta)}
              </span>
            </div>
            <div className="matchup-page__edge-actions">
              <button
                className="matchup-page__row-action"
                onClick={() =>
                  engine.selectPlayer(biggestSwing.slotIndex, biggestSwing.alternativeIndex)
                }
                type="button"
              >
                Preview the swap
              </button>
              {stored ? (
                <a
                  className="matchup-page__text-link"
                  href={`https://sleeper.com/leagues/${stored.leagueId}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Make it official in Sleeper ↗
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {isConnected ? (
          movers.length > 0 ? (
            <section className="matchup-page__module">
              <div className="matchup-page__module-row">
                <h2 className="matchup-page__module-title">Market movers</h2>
                <p className="matchup-page__meta-copy">
                  title odds{' '}
                  <span className="matchup-page__inline-number">
                    {formatAmericanOdds(movers[0].before)}
                  </span>
                </p>
              </div>
              {movers.map((mover) => (
                <MarketMoverRow
                  avatar={
                    mover.playerId
                      ? ({
                          id: mover.playerId,
                          name: mover.headline,
                          shortName: mover.headline,
                          position: 'WR',
                          team: '',
                          headshotUrl: `/api/img/headshot/${mover.playerId}`,
                          teamLogoUrl: '',
                          bye: 0,
                          isActive: true,
                        } as Player)
                      : null
                  }
                  from={mover.before}
                  key={mover.headline}
                  label={mover.headline}
                  sublabel={mover.detail}
                  to={mover.after}
                />
              ))}
            </section>
          ) : null
        ) : !isConnected ? (
        <section className="matchup-page__module">
          <div className="matchup-page__module-row">
            <h2 className="matchup-page__module-title">Market movers</h2>
            <p className="matchup-page__meta-copy">
              title odds <span className="matchup-page__inline-number">+450</span>
            </p>
          </div>

          <MarketMoverRow
            avatar={playerMap.get('a-st-brown') ?? playerMap.get('a-stbrown') ?? null}
            from={450}
            label={`Claim ${MOCK_WAIVER_SUGGESTION.player.name} off waivers`}
            sublabel="Slots WR3, frees your flex"
            to={425}
          />
          {topTradeTarget ? (
            <MarketMoverRow
              crestTeam={topTradeTarget.teamName}
              from={topTradeTarget.suggestedPackage.championshipOddsBefore}
              label={`Trade lane: ${topTradeTarget.teamName} want ${topTradeTarget.theirNeed}`}
              sublabel={`${topTradeTarget.suggestedPackage.youSend.map((player) => player.name).join(' + ')} for ${topTradeTarget.player.name} prices at`}
              to={topTradeTarget.suggestedPackage.championshipOddsAfter}
            />
          ) : null}
        </section>
        ) : null}

        {!isConnected ? (
        <section className="matchup-page__module">
          <div className="matchup-page__module-row">
            <h2 className="matchup-page__module-title">When your week locks</h2>
            <p className="matchup-page__meta-copy">% of projection</p>
          </div>

          <div className="matchup-page__lock-bar" aria-hidden="true">
            {exposureWindows.map((window, index) => (
              <span
                className={index === 0 ? 'matchup-page__lock-segment matchup-page__lock-segment--next' : 'matchup-page__lock-segment'}
                key={window.key}
                style={{ flexGrow: window.share }}
              />
            ))}
          </div>

          <div className="matchup-page__lock-grid">
            {exposureWindows.map((window, index) => (
              <div className="matchup-page__lock-row" key={window.key}>
                <span className={index === 0 ? 'matchup-page__lock-day matchup-page__lock-day--next' : 'matchup-page__lock-day'}>
                  {window.dayLabel}
                </span>
                <span className="matchup-page__lock-detail">{window.detail}</span>
                <span className="matchup-page__lock-headshots" aria-hidden="true">
                  {window.players.slice(0, 4).map((player, playerIndex) => (
                    <span
                      className={playerIndex > 0 ? 'matchup-page__mini-wrap matchup-page__mini-wrap--overlap' : 'matchup-page__mini-wrap'}
                      key={`${window.key}-${player.id}`}
                    >
                      <PlayerHeadshot
                        className="matchup-page__headshot matchup-page__headshot--mini"
                        fallbackClassName="matchup-page__headshot-fallback"
                        imageClassName="matchup-page__headshot-image"
                        player={player}
                      />
                    </span>
                  ))}
                  {window.players.length > 4 ? (
                    <span className="matchup-page__mini-more">+{window.players.length - 4}</span>
                  ) : null}
                </span>
                <span className={index === 0 ? 'matchup-page__lock-share matchup-page__lock-share--next' : 'matchup-page__lock-share'}>
                  {window.share}%
                </span>
              </div>
            ))}
          </div>

          {downsideLine ? (
            <p className="matchup-page__meta-copy matchup-page__meta-copy--downside">
              A bad {exposureWindows[0]?.dayLabel === 'THU' ? 'Thursday' : 'early window'} drops your line to{' '}
              <span className="matchup-page__inline-number">
                <span className="matchup-page__price-old">{formatAmericanOdds(downsideLine.from)}</span>{' '}
                <span className="matchup-page__price-new matchup-page__price-new--down">
                  {formatAmericanOdds(downsideLine.to)}
                </span>
              </span>
              . Sunday decides it.
            </p>
          ) : null}
        </section>
        ) : null}

        <TitlePriceChart series={titleSeries} variant="mobile" />

        <section className="matchup-page__module matchup-page__module--lineup">
          <div className="matchup-page__module-row matchup-page__module-row--lineup">
            <div>
              <h2 className="matchup-page__module-title">Your lineup</h2>

            </div>
            <button
              className={[
                'matchup-page__compare-chip',
                isCompareMode ? 'matchup-page__compare-chip--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (isCompareMode) exitCompare();
                else setIsCompareMode(true);
              }}
              type="button"
            >
              {isCompareMode ? 'Exit' : 'Who do I start?'}
            </button>
          </div>

          <div className="matchup-page__lineup-list">
            {engine.roster.map((slot, slotIndex) => {
              const selectedAlternativeIndex = engine.selectedAlternatives[slotIndex] ?? null;
              const activeAlternative =
                selectedAlternativeIndex === null
                  ? null
                  : engine.baselineRoster[slotIndex]?.alternatives[selectedAlternativeIndex] ?? null;
              const bestAlternative =
                selectedAlternativeIndex === null
                  ? getBestAlternative(engine.baselineRoster[slotIndex])
                  : null;
              const actionAlternative =
                selectedAlternativeIndex === null
                  ? bestAlternative && bestAlternative.deltaWinProbability > 0
                    ? bestAlternative
                    : null
                  : null;
              const currentLine = engine.getOptionLine(slotIndex, selectedAlternativeIndex);
              const targetLine = actionAlternative
                ? actionAlternative.resultingLine
                : selectedAlternativeIndex !== null
                  ? engine.getOptionLine(slotIndex, null)
                  : null;
              const edgeMeta =
                actionAlternative && targetLine
                  ? `Best swap: ${actionAlternative.player.shortName} · ${formatAmericanOdds(currentLine.moneyline)} to ${formatAmericanOdds(targetLine.moneyline)}`
                  : activeAlternative && targetLine
                    ? `Restore ${engine.baselineRoster[slotIndex].starter.shortName} · ${formatAmericanOdds(currentLine.moneyline)} to ${formatAmericanOdds(targetLine.moneyline)}`
                    : null;
              const meta = edgeMeta
                ? `${slot.starter.position} · ${slot.starter.team} · ${edgeMeta}`
                : `${slot.starter.position} · ${slot.starter.team}`;

              return renderLineupRow({
                actionLabel:
                  actionAlternative
                    ? `Start ${actionAlternative.player.shortName}`
                    : activeAlternative
                      ? `Restore ${engine.baselineRoster[slotIndex].starter.shortName}`
                      : undefined,
                meta,
                onAction:
                  actionAlternative
                    ? () => engine.selectPlayer(slotIndex, slot.alternatives.findIndex((alternative) => alternative.player.id === actionAlternative.player.id))
                    : activeAlternative
                      ? () => engine.selectPlayer(slotIndex, null)
                      : undefined,
                player: slot.starter,
                projection: slot.projection,
                selected: compareSelection.some((candidate) => candidate.id === slot.starter.id),
                slotLabel: slot.slotLabel === 'FLEX' ? 'FLX' : slot.slotLabel,
              });
            })}
          </div>

          <div className="matchup-page__bench-header">
            <h3 className="matchup-page__bench-title">Bench</h3>
            <p className="matchup-page__meta-copy">{benchRows.length} players</p>
          </div>

          <div className="matchup-page__lineup-list matchup-page__lineup-list--bench">
            {benchRows.map((benchRow) => {
              const bestFitMeta = benchRow.bestFit
                ? `Best fit ${benchRow.bestFit.slot.slotLabel === 'FLEX' ? 'FLX' : benchRow.bestFit.slot.slotLabel} · ${formatAmericanOdds(engine.activeLine.yours.moneyline)} to ${formatAmericanOdds(benchRow.bestFit.line.moneyline)}`
                : null;

              return renderLineupRow({
                meta: bestFitMeta
                  ? `${benchRow.player.position} · ${benchRow.player.team} · ${bestFitMeta}`
                  : `${benchRow.player.position} · ${benchRow.player.team}`,
                player: benchRow.player,
                projection: benchRow.projection,
                selected: compareSelection.some((candidate) => candidate.id === benchRow.player.id),
                slotLabel: 'BEN',
                tone: 'bench',
              });
            })}
          </div>
        </section>

        {!isConnected && !isRecapDismissed ? (
          <section className="matchup-page__module matchup-page__module--recap">
            <div className="matchup-page__module-row">
              <span className="matchup-page__eyebrow">Week 7 recap</span>
            </div>
            <p className="matchup-page__recap-sentence">
              You closed at -180 and won by 12. Best call: London over Smith, +17.5 pts.
            </p>
            <div className="matchup-page__recap-actions">
              <button className="matchup-page__text-link" onClick={() => void handleShareRecap()} type="button">
                Share
              </button>
              <button className="matchup-page__text-link" onClick={() => setIsRecapDismissed(true)} type="button">
                Dismiss
              </button>
            </div>
          </section>
        ) : null}
      </section>

      <aside className="matchup-page__rail">
        <section className="matchup-page__module matchup-page__module--lineup matchup-page__module--desktop-copy">
          <div className="matchup-page__module-row matchup-page__module-row--lineup">
            <div>
              <h2 className="matchup-page__module-title">Your lineup</h2>

            </div>
            <button
              className={[
                'matchup-page__compare-chip',
                isCompareMode ? 'matchup-page__compare-chip--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (isCompareMode) exitCompare();
                else setIsCompareMode(true);
              }}
              type="button"
            >
              {isCompareMode ? 'Exit' : 'Who do I start?'}
            </button>
          </div>

          <div className="matchup-page__lineup-list">
            {engine.roster.map((slot) => {
              return renderLineupRow({
                meta: `${slot.starter.position} · ${slot.starter.team}`,
                player: slot.starter,
                projection: slot.projection,
                selected: compareSelection.some((candidate) => candidate.id === slot.starter.id),
                slotLabel: slot.slotLabel === 'FLEX' ? 'FLX' : slot.slotLabel,
              });
            })}
          </div>

          <div className="matchup-page__bench-header">
            <h3 className="matchup-page__bench-title">Bench</h3>
            <p className="matchup-page__meta-copy">{benchRows.length} players</p>
          </div>

          <div className="matchup-page__lineup-list matchup-page__lineup-list--bench">
            {benchRows.map((benchRow) => {
              return renderLineupRow({
                meta: `${benchRow.player.position} · ${benchRow.player.team}`,
                player: benchRow.player,
                projection: benchRow.projection,
                selected: compareSelection.some((candidate) => candidate.id === benchRow.player.id),
                slotLabel: 'BEN',
                tone: 'bench',
              });
            })}
          </div>
        </section>

        <TitlePriceChart series={titleSeries} variant="desktop" />
      </aside>

      {isCompareMode && !compareModalPlayers ? (
        <div aria-label="Start or sit slip" className="matchup-page__slip" role="region">
          <div className="matchup-page__slip-header">
            <span className="matchup-page__slip-title">Who do I start?</span>
            <button className="matchup-page__slip-exit" onClick={exitCompare} type="button">
              Exit
            </button>
          </div>
          <div className="matchup-page__slip-slots">
            {[0, 1].map((slotIndex) => {
              const pick = compareSelection[slotIndex];
              return pick ? (
                <div
                  className="matchup-page__slip-slot matchup-page__slip-slot--filled"
                  key={slotIndex}
                >
                  <PlayerHeadshot
                    className="matchup-page__headshot matchup-page__headshot--slip"
                    fallbackClassName="matchup-page__headshot-fallback"
                    imageClassName="matchup-page__headshot-image"
                    player={pick}
                  />
                  <span className="matchup-page__slip-name">{pick.shortName}</span>
                  <button
                    aria-label={`Remove ${pick.shortName}`}
                    className="matchup-page__slip-remove"
                    onClick={() => removePick(pick.id)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="matchup-page__slip-slot" key={slotIndex}>
                  <span className="matchup-page__slip-number">{slotIndex + 1}</span>
                  <span className="matchup-page__slip-empty">
                    {compareSelection.length === 0
                      ? slotIndex === 0
                        ? 'Tap any player'
                        : 'Then a second'
                      : `Who are you weighing against ${compareSelection[0].shortName}?`}
                  </span>
                </div>
              );
            })}
            <span aria-hidden="true" className="matchup-page__slip-vs">
              VS
            </span>
          </div>
        </div>
      ) : null}

      {compareResult && compareModalPlayers ? (
        <CompareSheet
          comparison={compareResult}
          leftPlayer={compareModalPlayers[0]}
          onClose={closeVerdict}
          rightPlayer={compareModalPlayers[1]}
          tapeNote={(() => {
            const starterIds = new Set(engine.roster.map((slot) => slot.starter.id));
            const bothIn = compareModalPlayers.every((p) => starterIds.has(p.id));
            const neitherIn = compareModalPlayers.every((p) => !starterIds.has(p.id));
            return bothIn
              ? 'Both already start this week.'
              : neitherIn
                ? 'Neither starts this week.'
                : '';
          })()}
        />
      ) : null}
    </div>
  );
}

export function MatchupPage() {
  const { bootstrap, pricing, lineHistory } = useLeagueConnection();

  const lineMovement = (() => {
    if (!bootstrap || !lineHistory || lineHistory.length < 2) return null;
    const userTeam = bootstrap.teams.find((team) => team.isUser);
    if (!userTeam) return null;
    const latest = lineHistory.at(-1);
    const previous = lineHistory.at(-2);
    if (!latest || !previous || latest.week !== previous.week) return null;

    const find = (entry: typeof latest) =>
      entry.lines
        .map((line) => line.sides[String(userTeam.rosterId)])
        .find((side) => side !== undefined);

    const from = find(previous)?.moneyline;
    const to = find(latest)?.moneyline;
    if (from === undefined || to === undefined || from === to) return null;
    return { from, to, at: latest.computedAt };
  })();

  const connectedMatchup = bootstrap ? toMatchupData(bootstrap, pricing) : null;

  // Real priced movers (waiver claim + trade lane) for connected leagues.
  const movers =
    connectedMatchup && pricing?.available
      ? (pricing.movers ?? []).map((mover) => ({
          kind: mover.kind,
          headline: mover.headline,
          detail: mover.detail,
          playerId: mover.playerId,
          before: mover.titleOddsBefore,
          after: mover.titleOddsAfter,
        }))
      : [];

  // Title price by week: real recorded history for connected leagues,
  // the demo trajectory otherwise.
  const titleSeries: { week: number; odds: number }[] = (() => {
    if (!connectedMatchup) {
      return MOCK_WEEKLY_TRAJECTORY.map((point) => ({
        week: point.week,
        odds: point.championshipOdds,
      }));
    }
    if (!pricing?.available || !bootstrap) return [];
    const userRosterId = String(
      bootstrap.teams.find((team) => team.isUser)?.rosterId ?? '',
    );
    return (pricing.titleHistory ?? [])
      .map((entry) => ({ week: entry.week, odds: entry.odds[userRosterId] }))
      .filter((point): point is { week: number; odds: number } => point.odds != null);
  })();

  return (
    <MatchupLive
      movers={movers}
      titleSeries={titleSeries}
      isConnected={connectedMatchup !== null}
      isPriced={Boolean(pricing?.available)}
      lineMovement={connectedMatchup ? lineMovement : null}
      matchup={connectedMatchup ?? MOCK_MATCHUP}
      scoringNote={pricing?.available ? pricing.scoringNote ?? null : null}
      unpricedStarterCount={
        pricing?.available && bootstrap
          ? (pricing.lines
              ?.flatMap((line) => Object.entries(line.sides))
              .find(([rosterId]) =>
                String(bootstrap.teams.find((team) => team.isUser)?.rosterId) === rosterId,
              )?.[1]?.unpricedStarters.length ?? 0)
          : 0
      }
    />
  );
}
