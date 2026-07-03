import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { LineChangeFlash } from '../components/matchup/LineChangeFlash';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useModelOverlay } from '../contexts/ModelOverlayContext';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { fetchLines } from '../services/leagueApi';
import { getPlayerManifestEntry } from '../data/playerManifest';
import { useMatchupEngine } from '../hooks/useMatchupEngine';
import {
  MOCK_MATCHUP,
  MOCK_PLAYER_POOL,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WAIVER_SUGGESTION,
} from '../mocks';
import { toMatchupData } from '../adapters/connectedLeague';
import { setStoredCascadeScenarioLabel } from '../utils/seasonSelection';
import { formatAmericanOdds } from '../utils/formatOdds';
import {
  formatDisplayedWinProbabilityDelta,
  getDisplayedWinProbabilityDelta,
} from '../utils/matchupDelta';
import { PROVIDER_LABEL } from '../utils/provider';
import { shareText, type ShareResult } from '../utils/share';
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

const RECAP_DISMISSED_KEY = 'og.lineuplab.matchup-recap.dismissed';

function officialPlatformUrl({
  provider,
  leagueId,
  season,
  espnTeamId,
}: {
  provider: 'sleeper' | 'espn';
  leagueId: string;
  season?: string;
  espnTeamId?: number | null;
}) {
  if (provider === 'sleeper') {
    return `https://sleeper.com/leagues/${leagueId}`;
  }

  const seasonId = season ?? String(new Date().getFullYear());
  const base = 'https://fantasy.espn.com/football';
  if (espnTeamId != null) {
    return `${base}/team?leagueId=${encodeURIComponent(leagueId)}&teamId=${espnTeamId}&seasonId=${encodeURIComponent(seasonId)}`;
  }
  return `${base}/league?leagueId=${encodeURIComponent(leagueId)}&seasonId=${encodeURIComponent(seasonId)}`;
}

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

/**
 * Explains WHY a start helps or hurts when projection and win probability
 * disagree. The honest fantasy logic: while you're favored, a steadier
 * floor can lift your odds even at fewer projected points; while you're
 * behind, a boom-or-bust ceiling can lift your odds even though it lowers
 * the floor. A bare percentage hides that, which is what made the
 * "lower projection, better odds" swap read as nonsense.
 */
function swapVerdict(
  playerName: string,
  projectionDelta: number,
  deltaWinProbability: number,
  userWinProbability: number,
) {
  const projUp = projectionDelta > 0.3;
  const projDown = projectionDelta < -0.3;
  const oddsUp = deltaWinProbability > 0.2;
  const oddsDown = deltaWinProbability < -0.2;
  const favored = userWinProbability >= 50;

  if (projDown && oddsUp) {
    return `${playerName} projects ${Math.abs(projectionDelta).toFixed(1)} fewer points but a steadier floor. ${
      favored ? "You're favored, so protecting that floor" : 'In a tight spot, the safer week'
    } actually lifts your odds ${formatSignedPercent(deltaWinProbability)}. The boring start is the right one here.`;
  }

  if (projUp && oddsDown) {
    return `${playerName} projects ${projectionDelta.toFixed(1)} more points, but it's a boom-or-bust week. ${
      favored
        ? "While you're favored that added swing costs you"
        : 'Even chasing points it nets out negative'
    } (${formatSignedPercent(deltaWinProbability)}). Only start the ceiling if you expect to be chasing.`;
  }

  return formatVerdict(playerName, deltaWinProbability);
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
  avatarUrl,
}: {
  teamName: string;
  isUser?: boolean;
  avatarUrl?: string | null;
}) {
  // Real Sleeper team avatar wins over initials/glyph when the league set one.
  if (avatarUrl) {
    return (
      <span
        aria-hidden="true"
        className={['olympus-crest', isUser ? 'olympus-crest--user' : ''].filter(Boolean).join(' ')}
      >
        <img alt="" className="olympus-crest__avatar" src={avatarUrl} />
      </span>
    );
  }
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
  gain,
  avatar,
  crestTeam,
}: {
  label: string;
  sublabel: string;
  from: number;
  to: number;
  /** Projected points the move adds to your starting lineup, if known. */
  gain?: number;
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
      {/* Title odds barely move on a single roster change, so lead with the
          real number: projected points added to your starting lineup. */}
      {gain != null ? (
        <p className="matchup-page__mover-gain">+{gain.toFixed(1)}<span> pts/wk</span></p>
      ) : (
        <p className="matchup-page__price-shift">
          <span className="matchup-page__price-old">{formatAmericanOdds(from)}</span>{' '}
          <span className={to < from ? 'matchup-page__price-new matchup-page__price-new--up' : 'matchup-page__price-new matchup-page__price-new--down'}>
            {formatAmericanOdds(to)}
          </span>
        </p>
      )}
    </div>
  );
}

function CompareSheet({
  comparison,
  leftPlayer,
  rightPlayer,
  tapeNote = '',
  userWinProbability = 50,
  onApply,
  onClose,
}: {
  comparison: {
    slotIndex: number;
    leftSelectionIndex?: number | null;
    rightSelectionIndex?: number | null;
    leftLine: MatchupLine;
    rightLine: MatchupLine;
    leftProjection: number;
    rightProjection: number;
    deltaWinProbability: number;
  };
  leftPlayer: Player;
  rightPlayer: Player;
  tapeNote?: string;
  userWinProbability?: number;
  onApply?: (() => void) | null;
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
    ? formatDisplayedWinProbabilityDelta(comparison.leftLine, comparison.rightLine)
    : `${projectionDelta > 0 ? '+' : ''}${projectionDelta.toFixed(1)} pts`;
  const headlineWinner = rightWins ? rightPlayer : leftWins ? leftPlayer : null;

  const verdict = isSwap
    ? swapVerdict(
        rightPlayer.shortName,
        projectionDelta,
        comparison.deltaWinProbability,
        userWinProbability,
      )
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
        {isSwap && onApply ? (
          <div className="matchup-page__edge-actions">
            <button className="matchup-page__row-action" onClick={onApply} type="button">
              Preview the swap
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface PricedMover {
  kind: string;
  headline: string;
  detail: string;
  playerId?: string;
  gain?: number;
  before: number;
  after: number;
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
}: MatchupLiveProps) {
  const engine = useMatchupEngine(matchup);
  const { stored, bootstrap } = useLeagueConnection();
  const { overrideCount } = useModelOverlay();
  const { format: oddsFormat } = useOddsFormat();
  const providerLabel = stored ? PROVIDER_LABEL[stored.provider] : 'your fantasy app';
  const userRosterId = bootstrap?.teams.find((team) => team.isUser)?.rosterId ?? null;
  const officialUrl = stored
    ? officialPlatformUrl({
        provider: stored.provider,
        leagueId: stored.leagueId,
        season: stored.season,
        espnTeamId: stored.provider === 'espn' ? userRosterId : null,
      })
    : null;
  const formatDisplayedOdds = (moneyline: number, winProbability?: number) =>
    oddsFormat === 'percent' && winProbability != null
      ? `${winProbability.toFixed(1)}%`
      : formatAmericanOdds(moneyline);

  // When the user's model is live, fetch the pure-Franco (house) line for the
  // same matchup so we can show it as the quiet baseline ("Franco +154").
  const [houseYours, setHouseYours] = useState<{ moneyline: number; winProbability: number } | null>(
    null,
  );
  useEffect(() => {
    if (!stored || !bootstrap || overrideCount === 0) return;
    const rid = bootstrap.teams.find((t) => t.isUser)?.rosterId;
    if (rid == null) return;
    let cancelled = false;
    fetchLines(stored.leagueId, stored.userId, { house: true })
      .then((p) => {
        if (cancelled) return;
        const side = p.lines?.find((l) => l.sides[String(rid)])?.sides[String(rid)];
        setHouseYours(side ? { moneyline: side.moneyline, winProbability: side.winProbability } : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stored, bootstrap, overrideCount]);

  // A "preview" lineup: you've swapped someone in here, so every number below
  // is hypothetical until you reset it or make it official in your platform.
  const isPreview = Object.values(engine.selectedAlternatives).some((value) => value !== null);
  const resetPreview = () =>
    Object.keys(engine.selectedAlternatives).forEach((key) =>
      engine.selectPlayer(Number(key), null),
    );
  const starterEvaluations = useMemo(
    () => evaluateStarterRoster(engine.baselineRoster, engine.baselineLine.yours),
    [engine.baselineLine.yours, engine.baselineRoster],
  );
  const topSwapEvaluation = useMemo(
    () => getTopSwapEvaluation(starterEvaluations),
    [starterEvaluations],
  );
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<Player[]>([]);
  const [compareModalPlayers, setCompareModalPlayers] = useState<[Player, Player] | null>(null);
  const [compareBoardPlayers, setCompareBoardPlayers] = useState<Player[] | null>(null);
  const [compareSource, setCompareSource] = useState<'slip' | 'edge' | null>(null);
  const [isRecapDismissed, setIsRecapDismissed] = useState(
    () => window.localStorage.getItem(RECAP_DISMISSED_KEY) === 'true',
  );
  const [recapShareState, setRecapShareState] = useState<'idle' | 'working' | ShareResult>('idle');

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
        delta: getDisplayedWinProbabilityDelta(
          engine.getOptionLine(topSwapEvaluation.slotIndex, null),
          engine.getOptionLine(
            topSwapEvaluation.slotIndex,
            topSwapEvaluation.alternativeIndex,
          ),
        ),
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
  useEffect(() => {
    if (recapShareState === 'idle' || recapShareState === 'working') {
      return undefined;
    }

    const timer = window.setTimeout(() => setRecapShareState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [recapShareState]);

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
    if (recapShareState === 'working') {
      return;
    }

    const text = 'You closed at -180 and won by 12. Best call: London over Smith, +17.5 pts.';
    setRecapShareState('working');

    try {
      const result = await shareText({
        title: 'Olympus recap',
        text,
      });
      setRecapShareState(result);
    } catch {
      setRecapShareState('idle');
    }
  };

  const dismissRecap = () => {
    window.localStorage.setItem(RECAP_DISMISSED_KEY, 'true');
    setIsRecapDismissed(true);
  };

  const MAX_COMPARE = 4;

  const handleComparePick = (player: Player) => {
    setIsCompareMode(true);
    const current = compareSelection;
    const next = current.some((candidate) => candidate.id === player.id)
      ? current.filter((candidate) => candidate.id !== player.id)
      : current.length >= MAX_COMPARE
        ? current
        : [...current, player];

    setCompareSelection(next);

    if (next.length === 2) {
      setCompareSource('slip');
      setCompareBoardPlayers(null);
      setCompareModalPlayers([next[0], next[1]]);
      return;
    }

    if (next.length >= 3) {
      setCompareSource('slip');
      setCompareModalPlayers(null);
      setCompareBoardPlayers(next);
      return;
    }

    setCompareModalPlayers(null);
    setCompareBoardPlayers(null);
    if (next.length === 0) {
      setCompareSource(null);
    }
  };

  // Open the verdict: a pair gets the rich, slot-aware swap card; three or
  // four players get a ranked board (projection is the honest currency
  // once you're past a single swap decision).
  const openVerdict = () => {
    setCompareSource('slip');
    if (compareSelection.length === 2) {
      setCompareModalPlayers([compareSelection[0], compareSelection[1]]);
    } else if (compareSelection.length >= 3) {
      setCompareBoardPlayers(compareSelection);
    }
  };

  // Closing the verdict keeps your first pick on the slip, so trying a
  // different second player is one tap, not a restart.
  const closeVerdict = () => {
    setCompareModalPlayers(null);
    setCompareBoardPlayers(null);
    setCompareSource(null);
    setCompareSelection((current) => current.slice(0, 1));
  };

  const exitCompare = () => {
    setCompareModalPlayers(null);
    setCompareBoardPlayers(null);
    setCompareSource(null);
    setCompareSelection([]);
    setIsCompareMode(false);
  };

  const closeEdgeInspect = () => {
    setCompareModalPlayers(null);
    setCompareSource(null);
  };

  const inspectBiggestEdge = () => {
    if (!biggestSwing) return;
    setIsCompareMode(false);
    setCompareSelection([]);
    setCompareBoardPlayers(null);
    setCompareSource('edge');
    setCompareModalPlayers([biggestSwing.starter, biggestSwing.alternative]);
  };

  const removePick = (playerId: string) => {
    setCompareSelection((current) => current.filter((candidate) => candidate.id !== playerId));
  };

  // Projected points for any rostered player (starter slot or bench row).
  const projectionForPlayer = (playerId: string) => {
    const slot = engine.roster.find((s) => s.starter.id === playerId);
    if (slot) return slot.projection;
    const benchRow = benchRows.find((b) => b.player.id === playerId);
    return benchRow?.projection ?? 0;
  };

  const firstPick = compareSelection[0];
  const compareHint =
    !isCompareMode || compareSelection.length === 0
      ? 'Tap any player: who do I start?'
      : `Now tap another player to weigh against ${firstPick.shortName}.`;

  const eligibleCount =
    compareSelection.length >= 1
      ? [...engine.roster.map((slot) => slot.starter), ...engine.bench.map((b) => b.player)].filter(
          (p) => !compareSelection.some((c) => c.id === p.id),
        ).length
      : null;

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

    return (
      <div
        className={[
          'matchup-page__lineup-row',
          tone === 'bench' ? 'matchup-page__lineup-row--bench' : '',
          isCompareMode ? 'matchup-page__lineup-row--pickable' : '',
          selected ? 'matchup-page__lineup-row--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        key={`${slotLabel}-${player.id}`}
      >
        <button
          aria-pressed={isCompareMode ? selected : undefined}
          className="matchup-page__lineup-hitbox"
          // Tapping any player IS the start/sit flow: it picks them and
          // shows who you can weigh them against.
          onClick={() => handleComparePick(player)}
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
        {isPreview ? (
          <div className="matchup-page__preview-banner" role="status">
            <span className="matchup-page__preview-dot" aria-hidden="true" />
            <span>
              {isConnected
                ? `Previewing a lineup change. You will need to update your lineup in ${providerLabel} to reflect these changes.`
                : 'Previewing a lineup change. This is a hypothetical demo lineup until you reset it.'}
            </span>
            <button
              className="matchup-page__preview-reset"
              onClick={resetPreview}
              type="button"
            >
              Reset
            </button>
          </div>
        ) : null}

        <section
          className={[
            'matchup-page__module',
            'matchup-page__module--hero',
            isPreview ? 'matchup-page__module--preview' : '',
          ].join(' ')}
        >
          <div className="matchup-page__module-row">
            <span className="matchup-page__eyebrow">
              Week {matchup.week} · head-to-head
            </span>
            {isPreview ? (
              <span className="matchup-page__preview-chip">Preview lineup</span>
            ) : overrideCount > 0 ? (
              <span className="matchup-page__model-chip">
                <span className="matchup-page__live-dot" aria-hidden="true" />
                Your model
              </span>
            ) : (
              <span className="matchup-page__live-chip">
                <span className="matchup-page__live-dot" aria-hidden="true" />
                Live line
              </span>
            )}
          </div>

          <div className="matchup-page__faceoff">
            <div className="matchup-page__faceoff-side">
              <div className="matchup-page__faceoff-identity">
                <TeamCrest
                  avatarUrl={matchup.yourTeam.avatarUrl}
                  isUser
                  teamName={matchup.yourTeam.teamName}
                />
                <div>
                  <p className="matchup-page__team-name">{matchup.yourTeam.teamName}</p>
                  <p className="matchup-page__meta-copy">
                    {matchup.yourTeam.managerName} · {matchup.yourTeam.record}
                  </p>
                </div>
              </div>
              <span className="matchup-page__hero-number">
                {formatDisplayedOdds(
                  engine.activeLine.yours.moneyline,
                  engine.activeLine.yours.winProbability,
                )}
              </span>
              {overrideCount > 0 &&
              houseYours &&
              houseYours.moneyline !== engine.activeLine.yours.moneyline ? (
                <p className="matchup-page__house-line">
                  Franco{' '}
                  {formatDisplayedOdds(houseYours.moneyline, houseYours.winProbability)}
                </p>
              ) : null}
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
                <TeamCrest
                  avatarUrl={matchup.opponentTeam.avatarUrl}
                  teamName={matchup.opponentTeam.teamName}
                />
                <div>
                  <p className="matchup-page__team-name">{matchup.opponentTeam.teamName}</p>
                  <p className="matchup-page__meta-copy">
                    {matchup.opponentTeam.managerName} · {matchup.opponentTeam.record}
                  </p>
                </div>
              </div>
              <span className="matchup-page__hero-number matchup-page__hero-number--opp">
                {formatDisplayedOdds(
                  engine.activeLine.opponent.moneyline,
                  engine.activeLine.opponent.winProbability,
                )}
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
              <button className="matchup-page__row-action" onClick={inspectBiggestEdge} type="button">
                Inspect why
              </button>
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
                officialUrl ? (
                  <a
                    className="matchup-page__text-link"
                    href={officialUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {`Make it official in ${PROVIDER_LABEL[stored.provider]} ↗`}
                  </a>
                ) : (
                  <span className="matchup-page__text-link">{`Make it official in ${PROVIDER_LABEL[stored.provider]}`}</span>
                )
              ) : null}
            </div>
          </section>
        ) : null}

        {isConnected ? (
          movers.length > 0 ? (
            <section className="matchup-page__module">
              <div className="matchup-page__module-row">
                <h2 className="matchup-page__module-title">Market movers</h2>
                <p className="matchup-page__meta-copy">added to your lineup</p>
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
                  gain={mover.gain}
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
                {recapShareState === 'working'
                  ? 'Sharing…'
                  : recapShareState === 'copied'
                    ? 'Copied'
                    : recapShareState === 'shared'
                      ? 'Shared'
                      : 'Share'}
              </button>
              <button className="matchup-page__text-link" onClick={dismissRecap} type="button">
                Dismiss
              </button>
            </div>
          </section>
        ) : null}
      </section>

      <section className="matchup-page__module matchup-page__module--lineup matchup-page__module--lineup-rail">
        <div className="matchup-page__module-row matchup-page__module-row--lineup">
          <div>
            <h2 className="matchup-page__module-title">Your lineup</h2>
            <p className="matchup-page__lineup-hint">{compareHint}</p>
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
                  ? () =>
                      engine.selectPlayer(
                        slotIndex,
                        slot.alternatives.findIndex(
                          (alternative) => alternative.player.id === actionAlternative.player.id,
                        ),
                      )
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

      {isCompareMode && !compareModalPlayers && !compareBoardPlayers ? (
        <div aria-label="Start or sit slip" className="matchup-page__slip" role="region">
          <div className="matchup-page__slip-header">
            <span className="matchup-page__slip-title">Who do I start?</span>
            <button className="matchup-page__slip-exit" onClick={exitCompare} type="button">
              Exit
            </button>
          </div>

          {compareSelection.length === 0 ? (
            <p className="matchup-page__slip-empty">
              Tap up to four players you&apos;re deciding between.
            </p>
          ) : (
            <div className="matchup-page__slip-chips">
              {compareSelection.map((pick) => (
                <span className="matchup-page__slip-chip" key={pick.id}>
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
                </span>
              ))}
              {compareSelection.length < MAX_COMPARE && eligibleCount !== 0 ? (
                <span className="matchup-page__slip-ghost">
                  + add {compareSelection.length === 1 ? 'who to compare' : 'another'}
                </span>
              ) : null}
            </div>
          )}

          {compareSelection.length >= 1 && eligibleCount === 0 ? (
            <p className="matchup-page__slip-note">
              You&apos;ve picked everyone in this lineup view. Remove a pick to
              weigh a different combo.
            </p>
          ) : null}

          <button
            className="matchup-page__slip-cta"
            disabled={compareSelection.length < 2}
            onClick={openVerdict}
            type="button"
          >
            {compareSelection.length < 2
              ? 'Pick at least two'
              : compareSelection.length === 2
                ? 'See the verdict'
                : `Rank these ${compareSelection.length}`}
          </button>
        </div>
      ) : null}

      {compareResult && compareModalPlayers ? (
        <CompareSheet
          comparison={compareResult}
          leftPlayer={compareModalPlayers[0]}
          onApply={
            compareResult.slotIndex >= 0 &&
            (compareResult.rightSelectionIndex ?? compareResult.leftSelectionIndex) != null
              ? () => {
                  engine.selectPlayer(
                    compareResult.slotIndex,
                    compareResult.rightSelectionIndex ?? compareResult.leftSelectionIndex ?? null,
                  );
                  exitCompare();
                }
              : null
          }
          onClose={compareSource === 'slip' ? closeVerdict : closeEdgeInspect}
          rightPlayer={compareModalPlayers[1]}
          userWinProbability={engine.activeLine.yours.winProbability}
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

      {compareBoardPlayers ? (
        <CompareBoard
          onClose={closeVerdict}
          players={compareBoardPlayers}
          projectionFor={projectionForPlayer}
          starterIds={new Set(engine.roster.map((slot) => slot.starter.id))}
        />
      ) : null}
    </div>
  );
}

/**
 * Three or four players, ranked. Past a single swap decision, projected
 * points are the honest currency: we don't fabricate a moneyline for a
 * three-way slot battle that only has one opening.
 */
function CompareBoard({
  players,
  projectionFor,
  starterIds,
  onClose,
}: {
  players: Player[];
  projectionFor: (playerId: string) => number;
  starterIds: Set<string>;
  onClose: () => void;
}) {
  const ranked = [...players]
    .map((player) => ({ player, projection: projectionFor(player.id) }))
    .sort((a, b) => b.projection - a.projection);
  const top = ranked[0];
  const maxProjection = Math.max(top.projection, 1);
  const gap = roundTo(top.projection - ranked[1].projection);

  return (
    <div className="matchup-page__compare-scrim" onClick={onClose} role="presentation">
      <section
        aria-labelledby="compare-board-title"
        className="matchup-page__compare-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="matchup-page__compare-header">
          <div>
            <p className="matchup-page__eyebrow">Who do I start?</p>
            <h2 className="matchup-page__module-title" id="compare-board-title">
              The pecking order
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

        <div className="matchup-page__board-rows">
          {ranked.map((entry, index) => (
            <div
              className={[
                'matchup-page__board-row',
                index === 0 ? 'matchup-page__board-row--top' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={entry.player.id}
            >
              <span className="matchup-page__board-rank">{index + 1}</span>
              <PlayerHeadshot
                className="matchup-page__headshot matchup-page__headshot--slip"
                fallbackClassName="matchup-page__headshot-fallback"
                imageClassName="matchup-page__headshot-image"
                player={entry.player}
              />
              <div className="matchup-page__board-copy">
                <span className="matchup-page__row-name">
                  {entry.player.shortName}
                  {index === 0 ? (
                    <span className="matchup-page__board-tag">Start</span>
                  ) : null}
                  {starterIds.has(entry.player.id) ? (
                    <span className="matchup-page__board-instarter">in lineup</span>
                  ) : null}
                </span>
                <span className="matchup-page__board-bar">
                  <span
                    className={[
                      'matchup-page__compare-bar-fill',
                      index === 0 ? 'matchup-page__compare-bar-fill--winner' : '',
                    ].join(' ')}
                    style={{ width: `${Math.max(6, (entry.projection / maxProjection) * 100)}%` }}
                  />
                </span>
              </div>
              <span className="matchup-page__projection">
                {formatProjection(entry.projection)}
              </span>
            </div>
          ))}
        </div>

        <p className="matchup-page__compare-verdict">
          {gap >= 0.3
            ? `${top.player.shortName} projects ${gap.toFixed(1)} points clear.`
            : `Dead heat: ${top.player.shortName} edges it by ${gap.toFixed(1)}.`}
        </p>
      </section>
    </div>
  );
}

export function MatchupPage() {
  const { stored, bootstrap, pricing, lineHistory, isLoading, error } = useLeagueConnection();

  if (stored && !bootstrap) {
    return (
      <div className="matchup-page">
        <h1 className="visually-hidden">The Olympus matchup screen</h1>
        <SeasonalNotice>
          {isLoading
            ? `Syncing your ${PROVIDER_LABEL[stored.provider]} league…`
            : error ?? `We couldn't load your ${PROVIDER_LABEL[stored.provider]} league right now.`}
        </SeasonalNotice>
      </div>
    );
  }

  const lineMovement = (() => {
    if (!bootstrap || !lineHistory || lineHistory.length < 2) return null;
    const userTeam = bootstrap.teams.find((team) => team.isUser);
    if (!userTeam) return null;
    const latest = lineHistory.at(-1);
    const previous = lineHistory.at(-2);
    if (!latest || !previous || latest.week !== previous.week) return null;
    // A real market move is the same model repricing the same week (lineup or
    // score change). Two different projection imports aren't a "market move" —
    // that's us swapping the book, and it shouldn't read as one.
    if (latest.projectionVersion !== previous.projectionVersion) return null;
    // No "this week" movement before any games are on the board.
    if ((bootstrap.league.lastScoredWeek ?? 0) < 1) return null;

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
          gain: mover.valueGain,
          before: mover.titleOddsBefore,
          after: mover.titleOddsAfter,
        }))
      : [];

  return (
    <MatchupLive
      movers={movers}
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
