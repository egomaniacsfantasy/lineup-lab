import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { LineChangeFlash } from '../components/matchup/LineChangeFlash';
import { SeasonBand } from '../components/matchup/SeasonBand';
import { drawShareCard, type ShareCardLine } from '../utils/shareCard';
import { ShareCardPreview } from '../components/matchup/ShareCardPreview';
import { HubDeals } from '../components/matchup/HubDeals';
import { PlayerChip } from '../components/player/PlayerChip';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeRow } from '../components/trade-display/TradeDisplay';
import { OddsChart, type OddsChartPoint } from '../components/charts/OddsChart';
import { SimulationLoader } from '../components/ui/SimulationLoader';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import type { LeaguePricing, PricedFuture } from '../services/leagueApi';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { useScoutingCard } from '../contexts/ScoutingCardContext';
import { useDismissedTradeSuggestions } from '../hooks/useDismissedTradeSuggestions';
import { apiUrl, type ApiCatalogPlayer, type LineHistoryEntry } from '../services/leagueApi';
import { fetchSleeperHeadToHeadSummary, type SleeperHeadToHeadSummary } from '../services/headToHead';
import { useMatchupEngine, type SitCost } from '../hooks/useMatchupEngine';
import { useNflSchedule } from '../hooks/useNflSchedule';
import {
  MOCK_MATCHUP,
} from '../mocks';
import { toMatchupData, toPlayer } from '../adapters/connectedLeague';
import { setStoredCascadeScenarioLabel } from '../utils/seasonSelection';
import { formatAmericanOdds, impliedProbability } from '../utils/formatOdds';
import { hubShareMessage, shareFilename } from '../utils/shareMessage';
import { oddsPairDelta } from '../utils/noTradeMath';
import { formatSignedDisplayedDeltaValue } from '../utils/displayDelta';
import {
  formatDisplayedWinProbabilityDelta,
  getDisplayedWinProbabilityDelta,
} from '../utils/matchupDelta';
import { formatAcceptancePercent, formatAcceptanceRead } from '../utils/acceptanceLingo';
import { resolveWaiverClaimPlayer } from '../utils/marketMoverClaim';
import { PROVIDER_LABEL } from '../utils/provider';
import { resolveApiUrl } from '../services/apiBase.ts';
import { shareText, type ShareResult } from '../utils/share';
import { marketMoverSignature } from '../utils/tradeMarket';
import {
  roundTo,
} from '../utils/lineupComparison';
import { evaluateStarterRoster } from '../utils/starterEvaluation';
import {
  acceptanceGaugeLabel,
  applyTradeDisplayPolicy,
  lowAcceptanceTag,
} from '../utils/tradeSuggestionDisplay';
import { tradeSideFromPlayers } from '../utils/tradeDisplay';
import {
  createVolatilityResolver,
  type VolatilityProfile,
  type VolatilityProjectionSet,
} from '../utils/volatilityProfile';
import {
  getGameContextSource,
  getPlayerContext,
} from '../utils/playerGameContext';
import { showLineupPlayerPosition } from '../utils/lineupRow';
import type {
  BenchPlayer,
  MatchupData,
  MatchupLine,
  Player,
  RosterSlot,
} from '../types';
import '../components/trade-display/TradeDisplay.css';
import './MatchupPage.css';
import { managerLine } from '../utils/managerLine';
import { PreDraftHub } from '../components/matchup/PreDraftHub';
import { isLeaguePreDraft } from '../utils/preDraft';
import { officialLeagueUrl } from '../utils/officialLeagueUrl';
import { shortInjuryStatus } from '../utils/playerNames.ts';
import { TitleOdds, type TitleRow } from '../components/matchup/TitleOdds';

const RECAP_DISMISSED_KEY = 'og.lineuplab.matchup-recap.dismissed';


function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatProjection(value: number) {
  return value.toFixed(1);
}

const SUGGESTION_LOADING_MESSAGES = [
  'Scanning the market...',
  'Pricing every swap...',
  'Looking for your edge...',
  'Running the league 10,000 times...',
];


function formatAsOfTime(value: number | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function counterpartyLabel(name: string | null | undefined, rosterId: number | null | undefined) {
  if (name?.trim()) return name.trim();
  if (rosterId != null) return `Roster ${rosterId}`;
  return 'Your trade partner';
}

function formatSignedPercent(value: number) {
  return formatSignedDisplayedDeltaValue(roundTo(value));
}

function formatPercent(value: number) {
  if (value < 1) return '<1%';
  if (value > 99) return '>99%';
  return `${Math.round(value)}%`;
}

function probabilityDeltaRead(delta: number, rangeLabel: string) {
  return {
    text: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% this ${rangeLabel.toLowerCase()}`,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
  } as const;
}

function probabilitySummary(openValue: number, currentValue: number) {
  return `Open ${formatPercent(openValue)} → Now ${formatPercent(currentValue)}`;
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

function swapVerdict(
  playerName: string,
  projectionDelta: number,
  deltaWinProbability: number,
) {
  const projUp = projectionDelta > 0.3;
  const projDown = projectionDelta < -0.3;
  const oddsUp = deltaWinProbability > 0.2;
  const oddsDown = deltaWinProbability < -0.2;

  if (projDown && oddsUp) {
    return `${playerName} projects ${Math.abs(projectionDelta).toFixed(1)} fewer points, but the priced lineup still gains ${formatSignedPercent(deltaWinProbability)} win probability.`;
  }

  if (projUp && oddsDown) {
    return `${playerName} projects ${projectionDelta.toFixed(1)} more points, but the priced lineup drops ${formatSignedPercent(deltaWinProbability)} win probability.`;
  }

  return formatVerdict(playerName, deltaWinProbability);
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
      const delta = getDisplayedWinProbabilityDelta(currentLine, line);

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

function formatRangeValue(value: number | null) {
  return value == null ? 'N/A' : value.toFixed(1);
}

function formatProfileLabel(profile: VolatilityProfile['profile']) {
  return profile ? profile.toUpperCase() : null;
}

function getRangeStyle(
  volatility: VolatilityProfile,
  scale: { min: number; max: number } | null,
) {
  if (!volatility.available || volatility.floor == null || volatility.median == null || volatility.ceiling == null || !scale) {
    return null;
  }

  const span = scale.max - scale.min;
  if (span <= 0) return null;

  const start = clamp(((volatility.floor - scale.min) / span) * 100, 0, 100);
  const end = clamp(((volatility.ceiling - scale.min) / span) * 100, 0, 100);
  const median = clamp(((volatility.median - scale.min) / span) * 100, 0, 100);

  return {
    '--range-start': `${start}%`,
    '--range-width': `${Math.max(3, end - start)}%`,
    '--range-median': `${median}%`,
  } as CSSProperties;
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
        <img alt="" className="olympus-crest__avatar" src={resolveApiUrl(avatarUrl) ?? undefined} />
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
        <span className="olympus-crest__initials">{initials || '?'}</span>
      )}
    </span>
  );
}

function marketMoverWhy({
  gain,
  acceptanceProbability,
  partnerLabel,
  from,
  to,
}: {
  gain?: number;
  acceptanceProbability?: number | null;
  partnerLabel?: string;
  from: number;
  to: number;
}) {
  const parts = [];
  if (gain != null) {
    parts.push(`Moves your starters by ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} pts/wk.`);
  }
  if (acceptanceProbability != null) {
    const acceptanceRead = formatAcceptanceRead(acceptanceProbability);
    if (acceptanceRead) {
      parts.push(`${partnerLabel ?? 'Your trade partner'} acceptance read: ${acceptanceRead}.`);
    }
  }
  if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
    parts.push(`Title price ${formatAmericanOdds(from)} to ${formatAmericanOdds(to)}.`);
  }
  return parts.join(' ');
}

function slotToneClass(slotLabel: string) {
  const key = slotLabel.toLowerCase();
  return ['qb', 'rb', 'wr', 'te', 'flx', 'k', 'def'].includes(key)
    ? `matchup-page__slot-tag--${key}`
    : '';
}


function MarketPlayerUnit({
  label,
  players,
  tone = 'default',
}: {
  label: string;
  players: Player[];
  tone?: 'default' | 'accent';
}) {
  if (!players.length) return null;
  const names = players.map((player) => player.shortName).join(' + ');
  return (
    <span className="matchup-page__market-unit">
      <span className="matchup-page__market-unit-chips" aria-hidden="true">
        {players.slice(0, 2).map((player) => (
          <PlayerChip key={player.id} player={player} size="sm" tone={tone} />
        ))}
        {players.length > 2 ? <span className="matchup-page__market-unit-more">+{players.length - 2}</span> : null}
      </span>
      <span className="matchup-page__market-unit-copy">
        <span className="matchup-page__market-unit-label">{label}</span>
        <span className="matchup-page__market-unit-name">{names}</span>
      </span>
    </span>
  );
}

function normalizeSlotLabel(slotLabel: string) {
  return slotLabel === 'FLEX' ? 'FLX' : slotLabel;
}

type MirroredSlotRow = {
  key: string;
  slotLabel: string;
  yourSlot: RosterSlot | null;
  opponentSlot: RosterSlot | null;
  yourProjection: number;
  opponentProjection: number;
  edgeDelta: number;
};

/* Which positions a lineup slot will actually accept. Comparing a quarterback
   against a kicker answers a question nobody asked: you compare two players
   because you are choosing between them for one slot, so the only useful
   partners are the ones that could take the same slot. */
const SLOT_ELIGIBILITY: Record<string, readonly string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLX: ['RB', 'WR', 'TE'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};

function slotAccepts(slotLabel: string, position: string | undefined) {
  if (!position) return false;
  const accepted = SLOT_ELIGIBILITY[slotLabel.toUpperCase()];
  // An unmapped slot (a bench row, a league with a custom slot) should not
  // silently block everything, so it accepts anything.
  if (!accepted) return true;
  return accepted.includes(position.toUpperCase());
}

/* Both directions: each player has to be able to take the other's slot, so a
   flex running back can be weighed against a running back, and a quarterback
   in a superflex is not offered against a tight end. */
function slotsAreComparable(
  slotA: string,
  positionA: string | undefined,
  slotB: string,
  positionB: string | undefined,
) {
  return slotAccepts(slotA, positionB) && slotAccepts(slotB, positionA);
}

function buildMirroredSlotRows(
  yourRoster: RosterSlot[],
  opponentRoster: RosterSlot[],
) {
  const max = Math.max(yourRoster.length, opponentRoster.length);
  const rows: MirroredSlotRow[] = [];
  for (let index = 0; index < max; index += 1) {
    const yourSlot = yourRoster[index] ?? null;
    const opponentSlot = opponentRoster[index] ?? null;
    const slotLabel = normalizeSlotLabel(yourSlot?.slotLabel ?? opponentSlot?.slotLabel ?? 'BN');
    const yourProjection = yourSlot?.projection ?? 0;
    const opponentProjection = opponentSlot?.projection ?? 0;
    rows.push({
      key: `${slotLabel}-${yourSlot?.starter.id ?? 'open'}-${opponentSlot?.starter.id ?? 'open'}-${index}`,
      slotLabel,
      yourSlot,
      opponentSlot,
      yourProjection,
      opponentProjection,
      edgeDelta: roundTo(yourProjection - opponentProjection),
    });
  }
  return rows;
}

function HeadToHeadStrip({ summary }: { summary: SleeperHeadToHeadSummary }) {
  return (
    <section className="matchup-page__h2h-strip" aria-label="Head-to-head history">
      <div className="matchup-page__h2h-copy">
        <span className="matchup-page__eyebrow">Head to head</span>
        <strong>
          All-time vs this manager: {summary.record} · {summary.streak} streak · avg {summary.averageScore}
        </strong>
      </div>
      <div className="matchup-page__h2h-timeline" aria-hidden="true">
        {summary.timeline.map((entry) => (
          <span
            className={[
              'matchup-page__h2h-dot',
              entry.result === 'W'
                ? 'matchup-page__h2h-dot--win'
                : entry.result === 'L'
                  ? 'matchup-page__h2h-dot--loss'
                  : 'matchup-page__h2h-dot--tie',
            ].join(' ')}
            key={entry.key}
            title={entry.label}
          />
        ))}
      </div>
    </section>
  );
}


function displayCatalogPlayer(id: string, catalog: Record<string, ApiCatalogPlayer>) {
  if (!catalog[id]) {
    return {
      ...toPlayer(id, catalog),
      headshotUrl: '',
      name: 'Unknown player',
      shortName: 'Unknown player',
      team: 'FA',
      teamLogoUrl: '',
    };
  }
  return toPlayer(id, catalog);
}

function MarketMoverRow({
  label,
  sublabel,
  why,
  from,
  to,
  gain,
  acceptanceProbability,
  getPlayers,
  givePlayers,
  claimPlayer,
  crestTeam,
  href,
  lowAcceptanceTagLabel,
  onDismiss,
}: {
  label: string;
  sublabel?: string;
  why?: string;
  from: number;
  to: number;
  /** Projected points the move adds to your starting lineup, if known. */
  gain?: number;
  acceptanceProbability?: number | null;
  getPlayers?: Player[];
  givePlayers?: Player[];
  claimPlayer?: Player;
  crestTeam?: string;
  href?: string | null;
  lowAcceptanceTagLabel?: string | null;
  onDismiss?: (() => void) | null;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const isTrade = Boolean(getPlayers?.length || givePlayers?.length);
  const valueLabel = gain != null ? `${gain >= 0 ? '+' : ''}${gain.toFixed(1)}` : null;
  // Championship-% swing of a waiver claim, derived only from the engine's
  // before/after title odds (per-player 10k season sim).
  const titleDelta = Number.isFinite(from) && Number.isFinite(to) ? oddsPairDelta(from, to) : null;
  const titleDeltaLabel = titleDelta != null ? `${titleDelta > 0 ? '+' : ''}${titleDelta.toFixed(1)}%` : null;
  const acceptanceRead =
    acceptanceProbability != null ? acceptanceGaugeLabel(acceptanceProbability) : null;
  const acceptancePercent = formatAcceptancePercent(acceptanceProbability);

  if (isTrade && getPlayers?.length && givePlayers?.length) {
    return (
      <div className="matchup-page__mover-card matchup-page__mover-card--trade">
        <TradeRow
          acceptanceLabel={acceptanceRead ?? acceptancePercent ?? null}
          acceptanceProbability={acceptanceProbability}
          dismissLabel="Dismiss this suggested trade"
          footer={whyOpen ? (
            <div className="matchup-page__mover-rationale">
              <p>{why}</p>
              {href ? (
                <a className="matchup-page__mover-open-link" href={href}>
                  Open in Market →
                </a>
              ) : null}
            </div>
          ) : null}
          getSide={tradeSideFromPlayers('You get', getPlayers)}
          onClick={href ? () => { window.location.href = href; } : null}
          onDismiss={onDismiss
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onDismiss();
              }
            : null}
          sendSide={tradeSideFromPlayers('You send', givePlayers)}
          valueLabel={valueLabel ? `${valueLabel} pts/wk` : null}
          whyOpen={whyOpen}
          whyTrigger={why ? (
            <button
              aria-expanded={whyOpen}
              className="matchup-page__mover-why"
              onClick={(event) => {
                event.stopPropagation();
                setWhyOpen((current) => !current);
              }}
              type="button"
            >
              Why this trade?
            </button>
          ) : null}
        />
      </div>
    );
  }

  const content = (
    <>
      <div className="matchup-page__mover-identity">
        {claimPlayer ? (
          <MarketPlayerUnit label="Claim" players={[claimPlayer]} tone="accent" />
        ) : crestTeam ? (
          <TeamCrest teamName={crestTeam} />
        ) : null}
        <div className="matchup-page__mover-copy">
          {!claimPlayer ? (
            <>
              <p className="matchup-page__mover-label">{label}</p>
              {sublabel ? <p className="matchup-page__mover-meta">{sublabel}</p> : null}
            </>
          ) : null}
          {lowAcceptanceTagLabel ? (
            <span className="matchup-page__mover-tag">{lowAcceptanceTagLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="matchup-page__mover-market">
        {titleDeltaLabel && Number.isFinite(from) && Number.isFinite(to) ? (
          // Your actual win probability THIS week, before and after the claim
          // (per-player asymmetric matchup sim) — shown as the transition so it
          // reads unmistakably as a probability, with the delta beside it.
          <p className="matchup-page__price-shift">
            <span className="matchup-page__price-old">{impliedProbability(from).toFixed(1)}%</span>{' '}
            <span className="matchup-page__price-new matchup-page__price-new--up">
              {impliedProbability(to).toFixed(1)}% to win
            </span>
            <span> this week ({titleDeltaLabel})</span>
          </p>
        ) : (
          <p className="matchup-page__price-shift">
            <span className="matchup-page__price-old">{formatAmericanOdds(from)}</span>{' '}
            <span className={to < from ? 'matchup-page__price-new matchup-page__price-new--up' : 'matchup-page__price-new matchup-page__price-new--down'}>
              {formatAmericanOdds(to)}
            </span>
          </p>
        )}
        {acceptanceProbability != null ? (
          <span
            aria-label={acceptanceRead ?? `${acceptanceProbability}%`}
            className="matchup-page__mover-accept-group"
            title={acceptanceRead ?? `${acceptanceProbability}%`}
          >
            <span className="matchup-page__mover-accept">
              <span className="matchup-page__mover-accept-fill" style={{ width: `${clamp(acceptanceProbability, 0, 100)}%` }} />
            </span>
            {acceptanceRead ?? acceptancePercent ? (
              <span className="matchup-page__mover-accept-band">{acceptanceRead ?? acceptancePercent}</span>
            ) : null}
          </span>
        ) : null}
        {href ? <span className="matchup-page__mover-chevron" aria-hidden="true">{'>'}</span> : null}
      </div>
    </>
  );

  return (
    <div className="matchup-page__mover-card">
      {onDismiss ? (
        <button
          aria-label="Dismiss this suggested trade"
          className="matchup-page__mover-dismiss"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      ) : null}
      {href ? (
        <a className="matchup-page__mover-row matchup-page__mover-row--link" href={href}>
          {content}
        </a>
      ) : (
        <div className="matchup-page__mover-row">
          {content}
        </div>
      )}
      {why ? (
        <>
          <button
            aria-expanded={whyOpen}
            className="matchup-page__mover-why"
            onClick={() => setWhyOpen((current) => !current)}
            type="button"
          >
            Why this trade?
          </button>
          {whyOpen ? (
            <div className="matchup-page__mover-rationale">
              <p>{why}</p>
              {href ? (
                <a className="matchup-page__mover-open-link" href={href}>
                  Open in Market →
                </a>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DismissToast({
  visible,
  onUndo,
}: {
  visible: boolean;
  onUndo: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="matchup-page__dismiss-toast" role="status">
      <span>Dismissed.</span>
      <button className="matchup-page__dismiss-toast-action" onClick={onUndo} type="button">
        Undo
      </button>
    </div>
  );
}

function CompareSheet({
  comparison,
  leftPlayer,
  rightPlayer,
  tapeNote = '',
  week,
  getVolatilityProfile,
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
    leftSitCost?: SitCost | null;
    rightSitCost?: SitCost | null;
  };
  leftPlayer: Player;
  rightPlayer: Player;
  tapeNote?: string;
  week: number;
  getVolatilityProfile: (player: Player, week: number) => VolatilityProfile;
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
  const headlineWinner = rightWins ? rightPlayer : leftWins ? leftPlayer : null;

  const headlineNumber = isSwap
    ? formatDisplayedWinProbabilityDelta(comparison.leftLine, comparison.rightLine)
    : headlineWinner
      ? `+${Math.abs(projectionDelta).toFixed(1)} pts`
      : '0.0 pts';

  const verdict = isSwap
    ? swapVerdict(
        rightPlayer.shortName,
        projectionDelta,
        comparison.deltaWinProbability,
      )
    // The headline already reads the gap and its label, and the winning card
    // already wears the EDGE badge, so restating the gap in a sentence said
    // nothing new. Keep the tape note, which is the only added information.
    : (tapeNote ?? '').trim()
      || (headlineWinner
        ? `${headlineWinner.shortName} has the edge on projection.`
        : 'Dead even on projection.');

  const maxProjection = Math.max(comparison.leftProjection, comparison.rightProjection, 1);
  const leftVolatility = getVolatilityProfile(leftPlayer, week);
  const rightVolatility = getVolatilityProfile(rightPlayer, week);
  const availableRanges = [leftVolatility, rightVolatility].filter(
    (volatility) =>
      volatility.available &&
      volatility.floor != null &&
      volatility.median != null &&
      volatility.ceiling != null,
  );
  const rangeScale =
    availableRanges.length > 0
      ? {
          min: Math.min(...availableRanges.map((volatility) => volatility.floor ?? 0)),
          max: Math.max(...availableRanges.map((volatility) => volatility.ceiling ?? 0)),
        }
      : null;

  const sides = [
    {
      player: leftPlayer,
      projection: comparison.leftProjection,
      line: comparison.leftLine,
      winner: leftWins,
      volatility: leftVolatility,
    },
    {
      player: rightPlayer,
      projection: comparison.rightProjection,
      line: comparison.rightLine,
      winner: rightWins,
      volatility: rightVolatility,
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

        {/* No shared slot, so there is no swap to price. The engine can still
            answer which of the two you can most afford to sit: each number is
            the served resulting line of that slot's best bench option. */}
        {!isSwap && comparison.leftSitCost && comparison.rightSitCost
          ? (() => {
              const leftSit = Number(comparison.leftSitCost.line.winProbability.toFixed(1));
              const rightSit = Number(comparison.rightSitCost.line.winProbability.toFixed(1));
              const easier = leftSit === rightSit ? null : leftSit > rightSit ? leftPlayer : rightPlayer;
              const sitSides = [
                { player: leftPlayer, sit: comparison.leftSitCost, value: leftSit },
                { player: rightPlayer, sit: comparison.rightSitCost, value: rightSit },
              ];
              return (
                <div className="matchup-page__compare-sit">
                  <p className="matchup-page__eyebrow">If you have to sit one</p>
                  {sitSides.map(({ player, sit, value }) => (
                    <div className="matchup-page__compare-sit-row" key={player.id}>
                      <span className="matchup-page__compare-sit-name">Sit {player.shortName}</span>
                      <span className="matchup-page__compare-sit-sub">{sit.benchName} starts</span>
                      <span className="matchup-page__compare-sit-value">{value.toFixed(1)}%</span>
                    </div>
                  ))}
                  <p className="matchup-page__compare-sit-verdict">
                    {easier
                      ? `${easier.shortName} is the easier one to sit.`
                      : 'Either one leaves you in the same spot.'}
                  </p>
                </div>
              );
            })()
          : null}

        <div className="matchup-page__compare-cards matchup-page__compare-cards--faceoff">
          {sides.map(({ player, projection, line, winner, volatility }) => (
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
                <PlayerChip player={player} showPosition={false} size="lg" />
                <div>
                  <h3 className="matchup-page__row-name">{player.shortName}</h3>
                  <p className="matchup-page__row-secondary">
                    {player.position} · {player.team}
                  </p>
                </div>
              </div>
              <div className="matchup-page__compare-stats">
                <p className="matchup-page__compare-stat">
                  <span className="matchup-page__meta-copy">Priced projection</span>
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
                {volatility.available ? (
                  <div className="matchup-page__range">
                    <div className="matchup-page__range-head">
                      <span className="matchup-page__meta-copy">Week {week} range</span>
                      {formatProfileLabel(volatility.profile) ? (
                        <span className="matchup-page__profile-tag">
                          {formatProfileLabel(volatility.profile)}
                        </span>
                      ) : null}
                    </div>
                    <span
                      aria-hidden="true"
                      className="matchup-page__range-track"
                      style={getRangeStyle(volatility, rangeScale) ?? undefined}
                    >
                      <span className="matchup-page__range-band" />
                      <span className="matchup-page__range-median" />
                    </span>
                    <p className="matchup-page__range-values">
                      <span>{formatRangeValue(volatility.floor)} floor</span>
                      <span>{formatRangeValue(volatility.median)} mean</span>
                      <span>{formatRangeValue(volatility.ceiling)} ceiling</span>
                    </p>
                  </div>
                ) : null}
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
              Preview
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface PricedMover {
  kind: string;
  leagueId?: string;
  headline: string;
  detail: string;
  playerId?: string;
  givePlayerIds?: string[];
  getPlayerIds?: string[];
  partnerRosterId?: number;
  partnerLabel?: string;
  gain?: number;
  acceptanceProbability?: number | null;
  before: number;
  after: number;
  claimPlayer?: Player;
  givePlayers?: Player[];
  getPlayers?: Player[];
  lowAcceptanceTag?: string | null;
  signature?: string | null;
}

interface MatchupLiveProps {
  matchup: MatchupData;
  isConnected: boolean;
  /** The user's own futures row, for the season band under the hero. */
  userFuture?: PricedFuture | null;
  titles?: TitleRow[] | null;
  /** Recorded title price per week, for the band's trend line. */
  titleHistory?: LeaguePricing['titleHistory'] | null;
  isPriced?: boolean;
  lineMovement?: { from: number; to: number; at: number } | null;
  lineHistory?: LineHistoryEntry[] | null;
  scoringNote?: string | null;
  unpricedStarterCount?: number;
  unpricedStarterNames?: string[];
  seasonLabel?: string;
  movers?: PricedMover[];
  suggestionsFetching?: boolean;
  suggestionsStale?: boolean;
  suggestionsResolved?: boolean;
  suggestionsAsOf?: string | null;
  marketScan?: {
    isScanning: boolean;
    buttonLabel: string;
    coolingDown: boolean;
    note: string | null;
  };
  onScanMarket?: (() => void) | null;
  onDismissMover?: ((signature: string) => void) | null;
}

function MatchupColdLoading({ label }: { label: string }) {
  return (
    <div className="matchup-page matchup-page--cold">
      <h1 className="visually-hidden">Matchup</h1>
      <section className="matchup-page__story">
        <section className="matchup-page__module matchup-page__module--hero matchup-page__module--skeleton">
          <div className="matchup-page__module-row">
            <span className="matchup-page__eyebrow">{label}</span>
            <span className="matchup-page__live-chip">Pricing your league…</span>
          </div>
          <div className="matchup-page__skeleton-hero" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="matchup-page__meta-copy">Pricing your league…</p>
        </section>
      </section>
      <section className="matchup-page__module matchup-page__module--lineup matchup-page__module--lineup-rail">
        <div className="matchup-page__module-row matchup-page__module-row--lineup">
          <div>
            <h2 className="matchup-page__module-title">Your lineup</h2>
            <p className="matchup-page__lineup-hint">Tap two players to compare</p>
          </div>
        </div>
        <div className="matchup-page__lineup-list" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="matchup-page__lineup-row" key={`skeleton-${index}`}>
              <div className="matchup-page__lineup-hitbox matchup-page__lineup-hitbox--skeleton">
                <span className="matchup-page__skeleton-chip" />
                <span className="matchup-page__skeleton-copy">
                  <span />
                  <span />
                </span>
                <span className="matchup-page__projection">—</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MatchupSuggestionStatus({
  isFetching,
  isStale,
  asOf,
}: {
  isFetching: boolean;
  isStale: boolean;
  asOf?: string | null;
}) {
  if (isFetching) {
    return (
      <span className="matchup-page__repricing">
        <span className="matchup-page__repricing-dot" aria-hidden="true" />
        updating...
      </span>
    );
  }
  if (isStale && asOf) {
    return <span className="matchup-page__meta-copy">as of {asOf}</span>;
  }
  return null;
}

function MatchupSuggestionSkeleton({
  title,
  subtitle,
  mode,
}: {
  title: string;
  subtitle?: string;
  mode: 'edge' | 'market';
}) {
  return (
    <section className={`matchup-page__module matchup-page__suggestion-shell matchup-page__suggestion-shell--${mode}`}>
      <div className="matchup-page__module-row">
        <h2 className="matchup-page__module-title">{title}</h2>
        {subtitle ? <p className="matchup-page__meta-copy">{subtitle}</p> : null}
      </div>
      <div className="matchup-page__suggestion-loader">
        <SimulationLoader
          label={title}
          messages={SUGGESTION_LOADING_MESSAGES}
        />
      </div>
    </section>
  );
}

function MatchupLive({
  matchup,
  isConnected,
  userFuture = null,
  titles = null,
  titleHistory = null,
  isPriced = false,
  lineMovement = null,
  lineHistory = null,
  scoringNote = null,
  unpricedStarterCount = 0,
  unpricedStarterNames = [],
  seasonLabel,
  movers = [],
  suggestionsFetching = false,
  suggestionsStale = false,
  suggestionsResolved = false,
  suggestionsAsOf = null,
  marketScan = {
    isScanning: false,
    buttonLabel: 'Scan the market',
    coolingDown: false,
    note: null,
  },
  onScanMarket = null,
  onDismissMover = null,
}: MatchupLiveProps) {
  const engine = useMatchupEngine(matchup);
  const { stored, bootstrap } = useLeagueConnection();
  const { format: oddsFormat } = useOddsFormat();
  const { openScoutingCard } = useScoutingCard();
  const providerLabel = stored ? PROVIDER_LABEL[stored.provider] : 'your fantasy app';
  const userRosterId = bootstrap?.teams.find((team) => team.isUser)?.rosterId ?? null;
  const scheduleSeason = bootstrap?.league.season ? Number(bootstrap.league.season) : null;
  const nflSchedule = useNflSchedule(isConnected ? scheduleSeason : null, isConnected ? matchup.week : null);
  const gameContextSource = useMemo(
    () => getGameContextSource(isConnected ? 'live' : 'demo', nflSchedule),
    [isConnected, nflSchedule],
  );
  const officialUrl = stored
    ? officialLeagueUrl({
        provider: stored.provider,
        leagueId: stored.leagueId,
        season: stored.season,
        espnTeamId: stored.provider === 'espn' ? userRosterId : null,
      })
    : null;
  const marketHrefForMover = (mover: PricedMover) => {
    if (mover.kind !== 'trade') return '/market?view=deals';
    const params = new URLSearchParams({ view: 'deals' });
    if (stored?.leagueId) params.set('leagueId', stored.leagueId);
    if (mover.partnerRosterId != null) params.set('managerRosterId', String(mover.partnerRosterId));
    if (mover.givePlayerIds?.length) params.set('give', mover.givePlayerIds.join(','));
    if (mover.getPlayerIds?.length) params.set('get', mover.getPlayerIds.join(','));
    return `/market?${params.toString()}`;
  };
  const formatDisplayedOdds = (moneyline: number, winProbability?: number) =>
    oddsFormat === 'percent' && winProbability != null
      ? `${winProbability.toFixed(1)}%`
      : formatAmericanOdds(moneyline);

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
  const topPositiveEvaluation = useMemo(
    () =>
      starterEvaluations
        .filter((evaluation) => evaluation.bestBenchAlternative && evaluation.delta > 0)
        .sort((left, right) => right.delta - left.delta)[0] ?? null,
    [starterEvaluations],
  );
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [isBenchOpen, setIsBenchOpen] = useState(false);
  const benchRef = useRef<HTMLDetailsElement | null>(null);
  const [compareSelection, setCompareSelection] = useState<Player[]>([]);
  /* The slot the first pick came out of. Eligibility is a property of the slot,
     not of the player: the same running back is a different question in an RB
     slot and in a flex. */
  const [compareSlot, setCompareSlot] = useState<string | null>(null);
  const [compareModalPlayers, setCompareModalPlayers] = useState<[Player, Player] | null>(null);
  const [compareBoardPlayers, setCompareBoardPlayers] = useState<Player[] | null>(null);
  const [compareSource, setCompareSource] = useState<'slip' | 'edge' | null>(null);
  const [volatilityProjectionSet, setVolatilityProjectionSet] =
    useState<VolatilityProjectionSet | null>(null);
  const [headToHead, setHeadToHead] = useState<SleeperHeadToHeadSummary | null>(null);
  const [isRecapDismissed, setIsRecapDismissed] = useState(
    () => window.localStorage.getItem(RECAP_DISMISSED_KEY) === 'true',
  );
  const [recapShareState, setRecapShareState] = useState<'idle' | 'working' | ShareResult>('idle');
  useEffect(() => {
    const controller = new AbortController();

    fetch(apiUrl('/api/projections'), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: VolatilityProjectionSet | null) => {
        if (payload?.players?.length) {
          setVolatilityProjectionSet(payload);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setVolatilityProjectionSet(null);
      });

    return () => controller.abort();
  }, []);

  const volatilityResolver = useMemo(
    () => createVolatilityResolver(volatilityProjectionSet, matchup.scoringFormat),
    [matchup.scoringFormat, volatilityProjectionSet],
  );

  useEffect(() => {
    if (
      !isConnected
      || stored?.provider !== 'sleeper'
      || !stored.leagueId
      || !stored.userId
      || !matchup.opponentTeam.managerKey
    ) {
      setHeadToHead(null);
      return;
    }
    let cancelled = false;
    fetchSleeperHeadToHeadSummary({
      leagueId: stored.leagueId,
      viewerOwnerId: stored.userId,
      opponentOwnerId: matchup.opponentTeam.managerKey,
      currentWeek: matchup.week,
    })
      .then((summary) => {
        if (!cancelled) setHeadToHead(summary);
      })
      .catch(() => {
        if (!cancelled) setHeadToHead(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    matchup.opponentTeam.managerKey,
    matchup.week,
    stored?.leagueId,
    stored?.provider,
    stored?.userId,
  ]);

  // The hero card must agree with the bench rows: any positive bench-driven
  // line move means the lineup is not fully optimal, even if the move stays
  // below the tighter "swap" threshold used for row-level urgency.
  const biggestSwing = topPositiveEvaluation?.bestBenchAlternative
    ? {
        slotIndex: topPositiveEvaluation.slotIndex,
        starter: topPositiveEvaluation.currentStarter,
        alternativeIndex: topPositiveEvaluation.alternativeIndex,
        alternative: topPositiveEvaluation.bestBenchAlternative.player,
        beforeLine: engine.getOptionLine(topPositiveEvaluation.slotIndex, null),
        afterLine: engine.getOptionLine(
          topPositiveEvaluation.slotIndex,
          topPositiveEvaluation.alternativeIndex,
        ),
        delta: getDisplayedWinProbabilityDelta(
          engine.getOptionLine(topPositiveEvaluation.slotIndex, null),
          engine.getOptionLine(
            topPositiveEvaluation.slotIndex,
            topPositiveEvaluation.alternativeIndex,
          ),
        ),
      }
    : null;
  const tradeMovers = useMemo(
    () => movers.filter((mover) => mover.kind === 'trade'),
    [movers],
  );
  const marketRows = useMemo(() => {
    const nonTradeMovers = movers.filter((mover) => mover.kind !== 'trade');
    const { visible, longShotFallback } = applyTradeDisplayPolicy(tradeMovers);
    const taggedTrades = visible.map((mover) => ({
      ...mover,
      lowAcceptanceTag: lowAcceptanceTag(
        mover.acceptanceProbability,
        longShotFallback === mover,
      ),
    }));
    return [...nonTradeMovers, ...taggedTrades].slice(0, 3);
  }, [movers, tradeMovers]);
  const showSuggestionSkeletons = isConnected && suggestionsFetching && !suggestionsResolved;

  useEffect(() => {
    if (!topPositiveEvaluation?.bestBenchAlternative) {
      return;
    }

    setStoredCascadeScenarioLabel(
      `Start ${topPositiveEvaluation.bestBenchAlternative.player.shortName}`,
    );
  }, [topPositiveEvaluation]);

  useEffect(() => {
    if (recapShareState === 'idle' || recapShareState === 'working') {
      return undefined;
    }

    const timer = window.setTimeout(() => setRecapShareState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [recapShareState]);

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
        title: 'Odds Gods recap',
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


  const MAX_COMPARE = 2;

  /* Which pairs the book can actually price. The engine hands each of your
     slots the bench players eligible to fill it (`alternatives`); opponent
     slots get none. So a pair is comparable only when one player starts a
     slot and the other is listed as an option for that same slot. This is
     the engine's own eligibility data, not a position rule invented here,
     and it is what keeps a QB from being weighed against an RB in a league
     with no slot that accepts both. */
  const comparableWith = (player: Player) => {
    const ids = new Set<string>();
    engine.roster.forEach((slot) => {
      if (slot.starter.id === player.id) {
        slot.alternatives.forEach((alternative) => ids.add(alternative.player.id));
        return;
      }
      if (slot.alternatives.some((alternative) => alternative.player.id === player.id)) {
        ids.add(slot.starter.id);
      }
    });
    return ids;
  };

  const activePick = compareSelection[0] ?? null;
  const eligiblePartnerIds = useMemo(
    () => (activePick ? comparableWith(activePick) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePick, engine.roster],
  );

  /* You compare two players because you are choosing between them for one
     slot, so the slot decides who is eligible. A quarterback slot offers
     quarterbacks; a flex offers the backs, receivers and tight ends it would
     actually accept. This had been opened up to "any two players", which put
     a kicker next to a quarterback and answered a question nobody asked.

     Eligibility is by position across the whole roster, starters included, so
     RB1 against RB2 is a legal call — that is a real decision — not just
     starter against bench. */
  const eligibleForSlot = useMemo(() => {
    if (!compareSlot) return null;
    const ids = new Set<string>();
    engine.roster.forEach((slot) => {
      if (slotAccepts(compareSlot, slot.starter.position)) ids.add(slot.starter.id);
    });
    benchRows.forEach((row) => {
      if (slotAccepts(compareSlot, row.player.position)) ids.add(row.player.id);
    });
    return ids;
  }, [compareSlot, engine.roster, benchRows]);

  const canPick = (player?: Player) => {
    /* The first pick sets the slot, so nothing is excluded yet. */
    if (compareSelection.length === 0 || !eligibleForSlot || !player) return true;
    if (compareSelection.some((candidate) => candidate.id === player.id)) return true;
    return eligibleForSlot.has(player.id);
  };

  const handleComparePick = (player: Player, slotLabel?: string) => {
    if (!canPick(player)) return;
    if (compareSelection.length === 0 && slotLabel) setCompareSlot(slotLabel);
    if (compareSelection.some((candidate) => candidate.id === player.id)
      && compareSelection.length === 1) {
      setCompareSlot(null);
    }
    // The next thing you need is the bench option, so take them to it rather
    // than leaving them to find a collapsed drawer further down the page.
    if (!compareSelection.some((candidate) => candidate.id === player.id)) {
      window.setTimeout(() => {
        benchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
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

  // Open the verdict: this flow is capped to the two-player compare sheet.
  const openVerdict = () => {
    setCompareSource('slip');
    if (compareSelection.length === 2) {
      setCompareModalPlayers([compareSelection[0], compareSelection[1]]);
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

  const openSwapVerdict = (starter: Player, alternative: Player) => {
    setIsCompareMode(false);
    setCompareSelection([]);
    setCompareBoardPlayers(null);
    setCompareSource('edge');
    setCompareModalPlayers([starter, alternative]);
  };

  const inspectBiggestEdge = () => {
    if (!biggestSwing) return;
    openSwapVerdict(biggestSwing.starter, biggestSwing.alternative);
  };

  const biggestEdgeDisplay = biggestSwing
    ? {
        beforePrimary: formatDisplayedOdds(
          biggestSwing.beforeLine.moneyline,
          biggestSwing.beforeLine.winProbability,
        ),
        afterPrimary: formatDisplayedOdds(
          biggestSwing.afterLine.moneyline,
          biggestSwing.afterLine.winProbability,
        ),
        beforeSecondary:
          oddsFormat === 'percent'
            ? formatAmericanOdds(biggestSwing.beforeLine.moneyline)
            : `${biggestSwing.beforeLine.winProbability.toFixed(1)}%`,
        afterSecondary:
          oddsFormat === 'percent'
            ? formatAmericanOdds(biggestSwing.afterLine.moneyline)
            : `${biggestSwing.afterLine.winProbability.toFixed(1)}%`,
        meterStyle: {
          '--edge-before': `${biggestSwing.beforeLine.winProbability}%`,
          '--edge-after': `${biggestSwing.afterLine.winProbability}%`,
          '--edge-range-left': `${Math.min(
            biggestSwing.beforeLine.winProbability,
            biggestSwing.afterLine.winProbability,
          )}%`,
          '--edge-range-width': `${Math.abs(
            biggestSwing.afterLine.winProbability - biggestSwing.beforeLine.winProbability,
          )}%`,
        } as CSSProperties,
      }
    : null;

  const slotComparisonRows = useMemo(
    () => buildMirroredSlotRows(engine.roster, matchup.opponentTeam.roster),
    [engine.roster, matchup.opponentTeam.roster],
  );

  /* Your win probability over time.
     This used to match history entries on `matchupId`, which changes every
     week, so the panel only ever saw the handful of reprices inside the
     current week and told people there was no movement while the League chart
     showed plenty. `teamSnapshots` carries the same number keyed by ROSTER id,
     which is stable, and the store writes one for every recorded entry.
     Points are merged by timestamp, snapshot first, with the old per-matchup
     lookup kept as a fallback for history written before snapshots existed. */
  const matchupHistorySeries = useMemo(() => {
    if (!lineHistory?.length || !bootstrap || userRosterId == null) return [];
    const activeMatchup = bootstrap.matchups.find((item) => item.rosterId === userRosterId);
    const byTime = new Map<number, OddsChartPoint>();

    for (const entry of lineHistory) {
      const line = activeMatchup
        ? entry.lines.find((candidate: LineHistoryEntry['lines'][number]) => candidate.matchupId === activeMatchup.matchupId)
        : undefined;
      const side = line?.sides[String(userRosterId)];
      if (side) {
        byTime.set(entry.computedAt, {
          x: entry.computedAt,
          y: side.winProbability,
          title: entry.trigger ?? 'reprice',
        });
      }
    }

    for (const entry of lineHistory) {
      const snapshot = entry.teamSnapshots?.find((row) => row.rosterId === userRosterId);
      if (snapshot?.winProbThisWeek == null) continue;
      const at = snapshot.computedAt ?? entry.computedAt;
      byTime.set(at, {
        x: at,
        y: snapshot.winProbThisWeek,
        title: snapshot.trigger ?? entry.trigger ?? 'reprice',
      });
    }

    return [...byTime.values()].sort((left, right) => left.x - right.x);
  }, [bootstrap, lineHistory, userRosterId]);

  /* Your starters carrying an injury tag, straight from the payload's
     injuryStatus. Display only: nothing here re-weights a projection. */

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
  const decisionSlotCount = engine.roster.filter((slot) => slot.alternatives.length > 0).length;
  /* How many starters could actually take the same slot as the first pick.
     Zero is a real answer and worth saying out loud: with one quarterback on
     the roster there is no second quarterback to weigh, and leaving every card
     dimmed with no explanation reads as the app being broken. */
  const comparableStarterCount = (() => {
    if (!firstPick || !compareSlot) return null;
    return slotComparisonRows.filter((row) => {
      const starter = row.yourSlot?.starter;
      if (!starter || starter.id === firstPick.id) return false;
      return slotsAreComparable(compareSlot, firstPick.position, row.slotLabel, starter.position);
    }).length;
  })();

  const compareHint = (() => {
    if (firstPick) {
      if (comparableStarterCount === 0) {
        return `Nobody else can take ${firstPick.shortName}'s slot, so there is nothing to weigh them against. Tap them again to clear it.`;
      }
      const options = eligiblePartnerIds?.size ?? 0;
      return options > 0
        ? `Now pick anyone who could take the same slot as ${firstPick.shortName}. ${options} bench ${options === 1 ? 'option' : 'options'} can swap straight in.`
        : `Now pick anyone who could take the same slot as ${firstPick.shortName}.`;
    }
    if (decisionSlotCount === 0) {
      return 'No bench options this week. Every slot is the only play you have.';
    }
    return 'Tap any two of your players to compare them.';
  })();

  const eligibleCount =
    compareSelection.length >= 1 ? eligiblePartnerIds?.size ?? 0 : null;

  /* `compact` is the phone version of this line. At 71px the full string
     ("DET · vs MIN · Sun 1:00 PM") needed 145px and ellipsised on every row.
     The team abbreviation is redundant now that the headshot carries the team
     badge, and a kickoff time is the least scannable part of a lineup you are
     comparing side by side, so both go. Opponent and injury status stay,
     because those are the two things that change a start-or-sit. */
  const lineupMetaFor = (player: Player, extra?: string | null, compact = false) => {
    const context = getPlayerContext(player, gameContextSource);
    const gameMeta = context.contextAvailable
      ? context.bye
        ? 'BYE'
        : compact
          ? context.matchup
          : `${context.matchup} · ${context.kickoff}`
      : null;
    const status =
      player.injuryStatus && !['active', 'healthy'].includes(player.injuryStatus.toLowerCase())
        ? (compact ? shortInjuryStatus(player.injuryStatus) : player.injuryStatus)
        : null;

    return [compact ? null : player.team, gameMeta, status, extra]
      .filter(Boolean)
      .join(' · ');
  };

  /* Where the user sits in the league, ranked on the same title market the
     rail widget shows, so the card and the widget can never quote different
     standings. Sorting, nothing more. */
  const sharePower = useMemo(() => {
    if (!titles || titles.length < 3) return null;
    const ranked = [...titles].sort((a, b) => b.titleProb - a.titleProb);
    const index = ranked.findIndex((row) => row.isUser);
    return index === -1 ? null : { rank: index + 1, of: ranked.length };
  }, [titles]);

  /* Sleeper falls back to the handle when a manager never set a team name, so
     printing both would print the same string twice. */
  const shareOwner = useMemo(() => {
    const owner = bootstrap?.teams.find((team) => team.isUser)?.ownerName ?? null;
    return owner && owner !== matchup.yourTeam.teamName ? owner : null;
  }, [bootstrap, matchup.yourTeam.teamName]);

  /* The roster, for the card. Six starters is what fits across 1080px at a
     size where the face is still a face; the lineup is already in slot order
     so the first six are the ones anyone would name. */
  const shareStarters = useMemo(() => {
    const rows = engine.roster
      .map((slot) => slot.starter)
      .filter((player) => player && player.position !== 'DEF')
      .slice(0, 6);
    return rows.length
      ? rows.map((player) => ({
          name: player.name,
          position: player.position,
          headshotUrl: apiUrl(`/api/img/headshot/${player.id}`),
        }))
      : null;
  }, [engine.roster]);

  /* Held rather than fired: the button opens a preview so you can see the card
     before it goes anywhere. */
  const [sharePayload, setSharePayload] = useState<ShareCardLine | null>(null);

  const renderLineupRow = ({
    player,
    slotLabel,
    meta,
    projection,
    tone = 'starter',
    selected = false,
    actionLabel,
    onAction,
    swapChip,
  }: {
    player: Player;
    slotLabel: string;
    meta: string;
    projection: number;
    tone?: 'starter' | 'bench';
    selected?: boolean;
    actionLabel?: string;
    onAction?: () => void;
    swapChip?: {
      ariaLabel: string;
      deltaLabel: string;
      label: string;
      onClick: () => void;
      title: string;
    };
  }) => {
    const pickOrder = compareSelection.findIndex(
      (candidate) => candidate.id === player.id,
    );
    const isLineupSlot = tone === 'starter';
    const showSlotLabel = isLineupSlot;
    const pickable = canPick(player);
    /* An ineligible player during a comparison is dimmed rather than silently
       inert, so the rule is visible instead of just felt. */
    const muted = compareSelection.length > 0 && !pickable;

    return (
      <div
        className={[
          'matchup-page__lineup-row',
          tone === 'bench' ? 'matchup-page__lineup-row--bench' : '',
          isCompareMode && pickable ? 'matchup-page__lineup-row--pickable' : '',
          selected ? 'matchup-page__lineup-row--selected' : '',
          muted ? 'matchup-page__lineup-row--muted' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        key={`${slotLabel}-${player.id}`}
      >
        <button
          aria-pressed={isCompareMode ? selected : undefined}
          className={[
            'matchup-page__lineup-hitbox',
            !showSlotLabel ? 'matchup-page__lineup-hitbox--no-slot' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={!pickable}
          // Tapping a player IS the start/sit flow: it picks them and shows
          // the bench options the book can actually price against them.
          onClick={() => handleComparePick(player)}
          type="button"
        >
          {showSlotLabel ? (
            <span className={['matchup-page__slot-tag', slotToneClass(slotLabel)].filter(Boolean).join(' ')}>
              {slotLabel}
            </span>
          ) : null}
          <span className="matchup-page__lineup-player">
            <PlayerChip player={player} showPosition={showLineupPlayerPosition(slotLabel, tone)} />
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
        {swapChip ? (
          <button
            aria-label={swapChip.ariaLabel}
            className="matchup-page__swap-chip"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              swapChip.onClick();
            }}
            title={swapChip.title}
            type="button"
          >
            <span className="matchup-page__swap-chip-name">{swapChip.label}</span>
            <span className="matchup-page__swap-chip-delta">{swapChip.deltaLabel}</span>
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="matchup-page">
      <h1 className="visually-hidden">Matchup</h1>
      <LineChangeFlash
        delta={engine.lastChangeDelta}
        visible={engine.lastChangeDelta !== 0}
      />

      <div className="matchup-page__frame">
        {userFuture ? (
          <div className="matchup-page__season--band">
            <SeasonBand currentWeek={matchup.week} future={userFuture} history={titleHistory} />
          </div>
        ) : null}

        <section className="matchup-page__main">
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
            ) : null}
            <div className="matchup-page__hero-chips">
            </div>
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
                    {managerLine(matchup.yourTeam.managerName, matchup.yourTeam.record)}
                  </p>
                </div>
              </div>
              <span className="matchup-page__hero-number">
                {formatDisplayedOdds(
                  engine.activeLine.yours.moneyline,
                  engine.activeLine.yours.winProbability,
                )}
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
                {matchup.opponentTeam.managerKey ? (
                  <button
                    aria-label={`Open scouting card for ${matchup.opponentTeam.teamName}`}
                    className="matchup-page__crest-button"
                    onClick={() => openScoutingCard(matchup.opponentTeam.managerKey!)}
                    type="button"
                  >
                    <TeamCrest
                      avatarUrl={matchup.opponentTeam.avatarUrl}
                      teamName={matchup.opponentTeam.teamName}
                    />
                  </button>
                ) : (
                  <span
                    className="matchup-page__crest-button matchup-page__crest-button--static"
                    title="Scouting opens after this manager is synced."
                  >
                    <TeamCrest
                      avatarUrl={matchup.opponentTeam.avatarUrl}
                      teamName={matchup.opponentTeam.teamName}
                    />
                  </span>
                )}
                <div>
                  <button
                    className="matchup-page__team-name matchup-page__team-name--button"
                    disabled={!matchup.opponentTeam.managerKey}
                    title={
                      matchup.opponentTeam.managerKey
                        ? `Open scouting card for ${matchup.opponentTeam.teamName}`
                        : 'Scouting opens after this manager is synced.'
                    }
                    onClick={() => {
                      if (matchup.opponentTeam.managerKey) {
                        openScoutingCard(matchup.opponentTeam.managerKey);
                      }
                    }}
                    type="button"
                  >
                    {matchup.opponentTeam.teamName}
                  </button>
                  <p className="matchup-page__meta-copy">
                    {managerLine(matchup.opponentTeam.managerName, matchup.opponentTeam.record)}
                  </p>
                  {!matchup.opponentTeam.managerKey ? (
                    <p className="matchup-page__meta-copy">Unmanaged team, no read.</p>
                  ) : null}
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

            {/* The book's job is to settle the group chat, so the line has to
                leave the app in one tap. Every value below is the same one
                rendered above it. */}
            <button
              className="matchup-page__share"
              onClick={() => setSharePayload({
                  eyebrow: `Week ${matchup.week}`,
                  you: matchup.yourTeam.teamName,
                  /* The league is the context for every number on the card,
                     and the manager is who to blame for them. Both were
                     missing; the card named a team and nothing else. */
                  leagueName: bootstrap?.league.name ?? stored?.leagueName ?? null,
                  owner: shareOwner,
                  record: matchup.yourTeam.record ?? null,
                  yourAvatar: resolveApiUrl(matchup.yourTeam.avatarUrl) ?? null,
                  /* The season leads. These are the same four numbers the
                     season band prints above the matchup, formatted there and
                     passed through here. */
                  titleOdds: userFuture ? formatAmericanOdds(userFuture.championOdds) : null,
                  playoffs:
                    userFuture?.playoffProb != null
                      ? `${Math.round(userFuture.playoffProb)}%`
                      : null,
                  finish:
                    userFuture?.projRecord
                    ?? (userFuture?.projWins != null && userFuture?.projLosses != null
                      ? `${userFuture.projWins.toFixed(1)}-${userFuture.projLosses.toFixed(1)}`
                      : null),
                  seed:
                    userFuture?.avgSeed != null ? userFuture.avgSeed.toFixed(1) : null,
                  starters: shareStarters,
                  standing: sharePower,
                  /* The same list the rail widget ranks, so the card and the
                     widget cannot draw different fields. */
                  ladder: titles
                    ? [...titles]
                        .sort((a, b) => b.titleProb - a.titleProb)
                        .map((row) => ({ prob: row.titleProb, isUser: row.isUser }))
                    : null,
                  /* One week, as a strip. It is this week's card, but it is
                     not this week's story. */
                  week: `${formatAmericanOdds(engine.activeLine.yours.moneyline)} to win`,
                  opponent: matchup.opponentTeam.teamName,
                  opponentAvatar: resolveApiUrl(matchup.opponentTeam.avatarUrl) ?? null,
              })}
              type="button"
            >
              Share your card
            </button>
          </div>
        </section>

        {scoringNote ? <SeasonalNotice>{scoringNote}</SeasonalNotice> : null}
        {unpricedStarterCount > 0 ? (
          <SeasonalNotice>
            {unpricedStarterCount === 1 && unpricedStarterNames[0]
              ? `${unpricedStarterNames[0]} isn't on the projection sheet yet, so recommendations are limited.`
              : `${unpricedStarterCount} of your starters are outside the projection sheet, so recommendations are limited.`}
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
            <section className="matchup-page__module matchup-page__module--slot-board">
              <div className="matchup-page__module-row matchup-page__module-row--lineup">
                <div>
                  <h2 className="matchup-page__module-title">Lineup vs lineup</h2>
                  <p className="matchup-page__lineup-hint">{compareHint}</p>
                </div>
              </div>

              <div className="matchup-page__slot-board-grid">
                <div className="matchup-page__slot-board-head matchup-page__slot-board-head--left">
                  <span className="matchup-page__side-pill matchup-page__side-pill--you">You</span>
                  {matchup.yourTeam.teamName}
                </div>
                <div className="matchup-page__slot-board-head matchup-page__slot-board-head--center" />
                <div className="matchup-page__slot-board-head matchup-page__slot-board-head--right">
                  {matchup.opponentTeam.teamName}
                  <span className="matchup-page__side-pill">Them</span>
                </div>

                {slotComparisonRows.map((row) => {
                  const starter = row.yourSlot?.starter ?? null;
                  const optionCount = row.yourSlot?.alternatives.length ?? 0;
                  const isSelected = starter
                    ? compareSelection.some((candidate) => candidate.id === starter.id)
                    : false;
                  /* With nothing picked yet every starter is fair game. Once
                     one is picked, only players who could take that same slot
                     stay live; the rest dim rather than disappear, so the
                     lineup does not reshuffle under your thumb. */
                  const firstPick = compareSelection[0] ?? null;
                  const isEligible =
                    !firstPick ||
                    isSelected ||
                    (starter != null &&
                      compareSlot != null &&
                      slotsAreComparable(compareSlot, firstPick.position, row.slotLabel, starter.position));
                  const isPickable = starter ? canPick(starter) && isEligible : false;
                  const isMuted = Boolean(firstPick) && !isEligible;
                  const youLead = row.edgeDelta > 0;

                  return (
                    <Fragment key={row.key}>
                      <button
                        aria-pressed={isSelected}
                        className={[
                          'matchup-page__slot-card',
                          optionCount > 0 ? 'matchup-page__slot-card--decision' : '',
                          isSelected ? 'matchup-page__slot-card--picked' : '',
                          isMuted ? 'matchup-page__slot-card--muted' : '',
                        ].filter(Boolean).join(' ')}
                        disabled={!isPickable}
                        onClick={() => starter && handleComparePick(starter, row.slotLabel)}
                        type="button"
                      >
                        {row.yourSlot ? (
                          <>
                            <PlayerHeadshot
                              className="matchup-page__slot-headshot matchup-page__slot-headshot--user"
                              fallbackClassName="matchup-page__headshot-fallback"
                              imageClassName="matchup-page__headshot-image"
                              player={row.yourSlot.starter}
                            />
                            <span className="matchup-page__slot-copy">
                              <span className="matchup-page__row-name">{row.yourSlot.starter.shortName}</span>
                              <span className="matchup-page__row-secondary">
                                <span className="matchup-page__meta-full">
                                  {lineupMetaFor(row.yourSlot.starter)}
                                </span>
                                <span className="matchup-page__meta-compact">
                                  {lineupMetaFor(row.yourSlot.starter, null, true)}
                                </span>
                                {/* The arrow already says "swap"; spelling out
                                    "on the bench" beside every starter turned a
                                    hint into a paragraph. */}
                                {optionCount > 0 ? (
                                  <span
                                    className="matchup-page__slot-bench-cue"
                                    title={`${optionCount} bench ${optionCount === 1 ? 'option' : 'options'} for this slot`}
                                  >
                                    ⇄ {optionCount}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <span className="matchup-page__slot-numbers">
                              <span className="matchup-page__slot-projection">{formatProjection(row.yourProjection)}</span>
                            </span>
                          </>
                        ) : (
                          <span className="matchup-page__slot-empty">No starter</span>
                        )}
                      </button>

                      <div className="matchup-page__slot-center">
                        <span className="matchup-page__slot-slot-label">{row.slotLabel}</span>
                        {row.edgeDelta !== 0 ? (
                          <span
                            className={[
                              'matchup-page__slot-margin',
                              youLead
                                ? 'matchup-page__slot-margin--you'
                                : 'matchup-page__slot-margin--them',
                            ].join(' ')}
                            title={`${youLead ? matchup.yourTeam.teamName : matchup.opponentTeam.teamName} by ${Math.abs(row.edgeDelta).toFixed(1)}`}
                          >
                            <span aria-hidden="true" className="matchup-page__slot-margin-caret">
                              {youLead ? '◀' : '▶'}
                            </span>
                            {Math.abs(row.edgeDelta).toFixed(1)}
                          </span>
                        ) : null}
                      </div>

                      <div
                        className={[
                          'matchup-page__slot-card',
                          'matchup-page__slot-card--right',
                          'matchup-page__slot-card--opponent',
                          activePick ? 'matchup-page__slot-card--muted' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {row.opponentSlot ? (
                          <>
                            <span className="matchup-page__slot-numbers matchup-page__slot-numbers--right">
                              <span className="matchup-page__slot-projection">{formatProjection(row.opponentProjection)}</span>
                            </span>
                            <span className="matchup-page__slot-copy matchup-page__slot-copy--right">
                              <span className="matchup-page__row-name">{row.opponentSlot.starter.shortName}</span>
                              <span className="matchup-page__row-secondary">
                                <span className="matchup-page__meta-full">
                                  {lineupMetaFor(row.opponentSlot.starter)}
                                </span>
                                <span className="matchup-page__meta-compact">
                                  {lineupMetaFor(row.opponentSlot.starter, null, true)}
                                </span>
                              </span>
                            </span>
                            <PlayerHeadshot
                              className="matchup-page__slot-headshot matchup-page__slot-headshot--opp"
                              fallbackClassName="matchup-page__headshot-fallback"
                              imageClassName="matchup-page__headshot-image"
                              player={row.opponentSlot.starter}
                            />
                          </>
                        ) : (
                          <span className="matchup-page__slot-empty">No starter</span>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {/* Picking a starter is only useful if you can see the bench
                  option it can be weighed against, so the drawer opens with
                  the pick instead of leaving the answer hidden. */}
              <details
                className="matchup-page__bench-drawer"
                ref={benchRef}
                onToggle={(event) => setIsBenchOpen(event.currentTarget.open)}
                open={isBenchOpen || Boolean(activePick)}
              >
                <summary className="matchup-page__bench-summary">
                  {(matchup.opponentTeam.bench?.length ?? 0) > 0
                    ? `Benches · ${benchRows.length} vs ${matchup.opponentTeam.bench!.length}`
                    : `Your bench · ${benchRows.length}`}
                </summary>
                <div className="matchup-page__bench-columns">
                  <div className="matchup-page__lineup-list matchup-page__lineup-list--bench">
                    {benchRows.map((benchRow) => {
                      const bestFitMeta = benchRow.bestFit
                        ? `Would start at ${benchRow.bestFit.slot.slotLabel === 'FLEX' ? 'FLX' : benchRow.bestFit.slot.slotLabel} · ${formatAmericanOdds(engine.activeLine.yours.moneyline)} → ${formatAmericanOdds(benchRow.bestFit.line.moneyline)}`
                        : null;

                      return renderLineupRow({
                        /* The starter rows have taken the compact meta since
                           the truncation sweep; the bench rows were still
                           building the full string, and with "Would start at
                           FLX · +100 → +240" bolted on the end it ran 141px
                           past a 200px column and ellipsised every time. */
                        meta: lineupMetaFor(benchRow.player, bestFitMeta, true),
                        player: benchRow.player,
                        projection: benchRow.projection,
                        selected: compareSelection.some((candidate) => candidate.id === benchRow.player.id),
                        slotLabel: benchRow.player.position,
                        tone: 'bench',
                      });
                    })}
                  </div>

                  <div className="matchup-page__lineup-list matchup-page__lineup-list--bench">
                    {(matchup.opponentTeam.bench ?? []).map((benchRow) => (
                      <div
                        className="matchup-page__lineup-row matchup-page__lineup-row--bench matchup-page__lineup-row--static"
                        key={`opp-bench-${benchRow.player.id}`}
                      >
                        <span className="matchup-page__lineup-hitbox matchup-page__lineup-hitbox--no-slot">
                          <span className="matchup-page__lineup-player">
                            <PlayerChip player={benchRow.player} showPosition size="sm" />
                            <span className="matchup-page__lineup-copy">
                              <span className="matchup-page__row-name">{benchRow.player.shortName}</span>
                              <span className="matchup-page__row-secondary">{lineupMetaFor(benchRow.player)}</span>
                            </span>
                          </span>
                          <span className="matchup-page__projection">{formatProjection(benchRow.projection)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </section>

            {headToHead ? <HeadToHeadStrip summary={headToHead} /> : null}





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

          <aside className="matchup-page__rail">
            {biggestSwing ? (
              <section className="matchup-page__module matchup-page__module--rail-call">
                <div className="matchup-page__module-row">
                  <div className="matchup-page__module-meta">
                    <MatchupSuggestionStatus
                      asOf={suggestionsAsOf}
                      isFetching={suggestionsFetching}
                      isStale={suggestionsStale}
                    />
                    {/* The rescan came with the market module this widget
                        absorbed, so it comes here rather than disappearing. */}
                    {marketScan.isScanning ? (
                      <SimulationLoader label="Scanning the market" size="compact" variant="scan" />
                    ) : (
                      <button
                        aria-label="Scan the market"
                        className={[
                          'matchup-page__market-refresh',
                          marketScan.coolingDown ? 'matchup-page__market-refresh--cooldown' : '',
                        ].filter(Boolean).join(' ')}
                        disabled={marketScan.coolingDown}
                        onClick={() => onScanMarket?.()}
                        type="button"
                      >
                        {marketScan.coolingDown ? marketScan.buttonLabel : <span aria-hidden="true">↻</span>}
                      </button>
                    )}
                  </div>
                </div>
                <div className="matchup-page__rail-call-swap">
                  <MarketPlayerUnit label="Sit" players={[biggestSwing.starter]} />
                  <span aria-hidden="true" className="matchup-page__edge-swap-arrow">→</span>
                  <MarketPlayerUnit label="Start" players={[biggestSwing.alternative]} tone="accent" />
                </div>
                <div className="matchup-page__rail-call-market">
                  <span className="matchup-page__edge-line-label">Win probability</span>
                  <span className="matchup-page__rail-call-values">
                    <span className="matchup-page__price-old">{biggestEdgeDisplay?.beforePrimary}</span>
                    <span aria-hidden="true">→</span>
                    <span className="matchup-page__price-new matchup-page__price-new--up">
                      {biggestEdgeDisplay?.afterPrimary}
                    </span>
                    <span className="matchup-page__edge-delta matchup-page__edge-delta--up">
                      {formatSignedPercent(biggestSwing.delta)}
                    </span>
                  </span>
                </div>
                {marketRows.length > 0 ? (
                  <div className="matchup-page__adds">
                    {marketRows.map((mover) => (
                      <MarketMoverRow
                        acceptanceProbability={mover.acceptanceProbability}
                        claimPlayer={mover.claimPlayer}
                        from={mover.before}
                        gain={mover.gain}
                        getPlayers={mover.getPlayers}
                        givePlayers={mover.givePlayers}
                        href={marketHrefForMover(mover)}
                        key={mover.headline}
                        label={mover.headline}
                        lowAcceptanceTagLabel={mover.lowAcceptanceTag}
                        onDismiss={
                          mover.kind === 'trade' && mover.signature
                            ? () => onDismissMover?.(mover.signature as string)
                            : null
                        }
                        sublabel={mover.kind === 'trade' ? undefined : mover.detail}
                        to={mover.after}
                        why={mover.kind === 'trade'
                          ? marketMoverWhy({
                              acceptanceProbability: mover.acceptanceProbability,
                              from: mover.before,
                              gain: mover.gain,
                              partnerLabel: mover.partnerLabel,
                              to: mover.after,
                            })
                          : undefined}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="matchup-page__edge-actions">
                  <button className="matchup-page__row-action" onClick={inspectBiggestEdge} type="button">
                    Inspect why
                  </button>
                  <button
                    className="matchup-page__row-action"
                    onClick={() => engine.selectPlayer(biggestSwing.slotIndex, biggestSwing.alternativeIndex)}
                    type="button"
                  >
                    Preview
                  </button>
                  {stored && officialUrl ? (
                    <a
                      className="matchup-page__text-link"
                      href={officialUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {stored.provider === 'espn' ? 'Open in ESPN ↗︎' : 'Open Sleeper ↗︎'}
                    </a>
                  ) : null}
                </div>
              </section>
            ) : isConnected && showSuggestionSkeletons ? (
              <MatchupSuggestionSkeleton mode="edge" title="Who do I start?" subtitle="the book's answer" />
            ) : isConnected ? (
              <section className="matchup-page__module matchup-page__module--rail-call matchup-page__module--rail-call-clean">
                <div className="matchup-page__module-row">
                </div>
                <p className="matchup-page__rail-call-clean">
                  Your lineup is already the best play.
                </p>
                {marketRows.length > 0 ? (
                  <div className="matchup-page__adds">
                    {marketRows.map((mover) => (
                      <MarketMoverRow
                        acceptanceProbability={mover.acceptanceProbability}
                        claimPlayer={mover.claimPlayer}
                        from={mover.before}
                        gain={mover.gain}
                        getPlayers={mover.getPlayers}
                        givePlayers={mover.givePlayers}
                        href={marketHrefForMover(mover)}
                        key={mover.headline}
                        label={mover.headline}
                        lowAcceptanceTagLabel={mover.lowAcceptanceTag}
                        onDismiss={
                          mover.kind === 'trade' && mover.signature
                            ? () => onDismissMover?.(mover.signature as string)
                            : null
                        }
                        sublabel={mover.kind === 'trade' ? undefined : mover.detail}
                        to={mover.after}
                        why={mover.kind === 'trade'
                          ? marketMoverWhy({
                              acceptanceProbability: mover.acceptanceProbability,
                              from: mover.before,
                              gain: mover.gain,
                              partnerLabel: mover.partnerLabel,
                              to: mover.after,
                            })
                          : undefined}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Trades earn a box of their own rather than a tier inside the
                start/add widget, but a small one: two rows, above the field. */}
            {isConnected ? <HubDeals /> : null}

            {isConnected && titles && titles.length > 2 ? <TitleOdds rows={titles} /> : null}

            <section className="matchup-page__module matchup-page__module--rail-chart">
              {matchupHistorySeries.length > 1 ? (
                <OddsChart
                  caption="Held values between updates. Tap players below to compare."
                  className="matchup-page__rail-chart"
                  defaultRangeId="week"
                  deltaFormatter={probabilityDeltaRead}
                  displayValueForDelta={(value) => Math.round(Math.max(0, Math.min(100, value)))}
                  footer={
                    lineMovement
                      ? `The market moved from ${formatAmericanOdds(lineMovement.from)} to ${formatAmericanOdds(lineMovement.to)} this week.`
                      : matchupHistorySeries.length > 1
                        ? 'No real movement today.'
                        : 'This chart lights up after a couple of line updates.'
                  }
                  hero={{
                    id: 'matchup-line',
                    name: matchup.yourTeam.teamName,
                    endpointDetail: formatDisplayedOdds(
                      engine.activeLine.yours.moneyline,
                      engine.activeLine.yours.winProbability,
                    ),
                    points: matchupHistorySeries,
                  }}
                  summaryFormatter={probabilitySummary}
                  title="Line movement"
                  valueFormatter={formatPercent}
                />
              ) : (
                <div className="matchup-page__rail-placeholder">
                  <span className="matchup-page__eyebrow">Line movement</span>
                  <strong>No real movement yet</strong>
                  <p className="matchup-page__meta-copy">This panel lights up once the book reprices the matchup a couple of times.</p>
                </div>
              )}
            </section>

          </aside>
      </div>

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
              Pick two players to compare.
            </p>
          ) : (
            <div className="matchup-page__slip-chips">
              {compareSelection.map((pick) => (
                <span className="matchup-page__slip-chip" key={pick.id}>
                  <PlayerChip player={pick} showPosition={false} size="sm" />
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
                  + add second player
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
              ? 'Pick two players to compare'
              : 'See the verdict'}
          </button>
        </div>
      ) : null}

      {sharePayload ? (
        <ShareCardPreview
          draw={(options) => drawShareCard(sharePayload, options)}
          filename={shareFilename(sharePayload.you, matchup.week)}
          message={hubShareMessage({
            team: sharePayload.you,
            leagueName: sharePayload.leagueName,
            titleOdds: sharePayload.titleOdds,
            rank: sharePayload.standing?.rank ?? null,
            of: sharePayload.standing?.of ?? null,
          })}
          onClose={() => setSharePayload(null)}
        />
      ) : null}

      {compareResult && compareModalPlayers ? (
        <CompareSheet
          comparison={compareResult}
          getVolatilityProfile={volatilityResolver.getVolatilityProfile}
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
          week={matchup.week}
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
              <PlayerChip player={entry.player} showPosition={false} size="sm" />
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
  const {
    stored,
    bootstrap,
    pricing,
    pricingMeta,
    lineHistory,
    isLoading,
    error,
    marketScan,
    scanMarket,
  } = useLeagueConnection();
  const [marketScanNote, setMarketScanNote] = useState<string | null>(null);
  const [scanClock, setScanClock] = useState(() => Date.now());
  const currentWeek = pricing?.week ?? bootstrap?.week ?? null;
  const { dismissedSignatures, dismiss, undo, pendingUndoSignature } =
    useDismissedTradeSuggestions(stored?.leagueId ?? null, currentWeek);

  useEffect(() => {
    if (
      !marketScan.lastScannedAt ||
      Date.now() - marketScan.lastScannedAt >= marketScan.cooldownMs
    ) {
      return undefined;
    }
    const timer = window.setInterval(() => setScanClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [marketScan.cooldownMs, marketScan.lastScannedAt]);


  /* Above every early return. This page bails out for the loading state and
     again for a pre-draft league, and a hook declared below those runs on some
     renders and not others — which React reports as "rendered more hooks than
     during the previous render" and a blank page. */
  /* The league's title market, condensed for the rail. Every value is served:
     titleProb and championOdds come off the season sim, and the move is that
     probability minus the one the board opened at. */
  const titleRows = useMemo<TitleRow[] | null>(() => {
    if (!pricing?.available) return null;
    const futures = pricing.futures ?? [];
    if (futures.length < 3) return null;

    /* Same phantom-week filter the season band uses: the scheduler recorded
       snapshots past the current fantasy week while the app was reading the
       NFL's preseason week as a fantasy week, and a week nobody has played
       cannot be where the line opened. */
    const history = [...(pricing.titleHistory ?? [])]
      .filter((entry) => currentWeek == null || entry.week <= currentWeek)
      .sort((a, b) => a.at - b.at);

    /* The same trailing window the League tab's move column reads, including
       its fallback: if fewer than two snapshots landed in the last six days,
       the whole series is the window. Leagues priced weekly always take that
       fallback and so read as movement since the board opened, which is the
       only honest answer when weekly is all you have. Leagues priced daily get
       the six-day read on both surfaces. */
    const latest = history.at(-1)?.at ?? 0;
    const recent = history.filter((entry) => entry.at >= latest - 6 * 24 * 60 * 60 * 1000);
    const window = recent.length > 1 ? recent : history;

    const opened = new Map<string, number>();
    Object.entries(window[0]?.odds ?? {}).forEach(([rosterId, odds]) => {
      if (odds != null) opened.set(rosterId, impliedProbability(odds));
    });

    return futures.map((future) => {
      const open = opened.get(String(future.rosterId));
      return {
        rosterId: future.rosterId,
        teamName: future.teamName,
        titleProb: future.titleProb,
        championOdds: future.championOdds,
        isUser: future.isUser,
        move: open != null ? Number((future.titleProb - open).toFixed(1)) : null,
      };
    });
  }, [pricing, currentWeek]);


  if (stored && !bootstrap) {
    if (isLoading) {
      return <MatchupColdLoading label={stored.leagueName ?? `${PROVIDER_LABEL[stored.provider]} league`} />;
    }
    return (
      <div className="matchup-page">
        <h1 className="visually-hidden">Matchup</h1>
        <SeasonalNotice>
          {isLoading
            ? `Syncing your ${PROVIDER_LABEL[stored.provider]} league…`
            : error ?? `We couldn't load your ${PROVIDER_LABEL[stored.provider]} league right now.`}
        </SeasonalNotice>
      </div>
    );
  }

  /* Before a draft there is nothing to price, and the Hub's whole vocabulary is
     prices. It has to leave rather than render zeroes. This sits after the
     bootstrap guard above, so `bootstrap` is real by here. */
  if (stored && bootstrap && isLeaguePreDraft(bootstrap)) {
    return (
      <PreDraftHub
        bootstrap={bootstrap}
        officialUrl={officialLeagueUrl({
          provider: stored.provider,
          leagueId: stored.leagueId,
          season: stored.season,
          espnTeamId:
            stored.provider === 'espn'
              ? bootstrap.teams.find((team) => team.isUser)?.rosterId ?? null
              : null,
        })}
        provider={stored.provider}
      />
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

  const pricedMovers = pricing?.movers ?? [];

  // Real priced movers (waiver claim + trade lane) for connected leagues.
  // Same-position 1-for-1 swaps are NOT filtered out — they are valid, often-fair
  // trades, and hiding them made surfaces disagree about what trades exist.
  const movers =
    connectedMatchup && bootstrap && pricing?.available
      ? pricedMovers
        .reduce<PricedMover[]>((nextMovers, mover) => {
          const getIds = mover.getPlayerIds ?? (mover.getPlayerId ? [mover.getPlayerId] : []);
          const giveIds = mover.givePlayerIds ?? (mover.givePlayerId ? [mover.givePlayerId] : []);
          const signature = stored?.leagueId && mover.kind === 'trade'
            ? marketMoverSignature(stored.leagueId, mover)
            : null;
          if (signature && dismissedSignatures.has(signature)) return nextMovers;
          const getPlayers = getIds.map((id) => displayCatalogPlayer(id, bootstrap.players));
          const givePlayers = giveIds.map((id) => displayCatalogPlayer(id, bootstrap.players));
          const partnerTeam = mover.partnerRosterId == null
            ? null
            : bootstrap.teams.find((team) => team.rosterId === mover.partnerRosterId);
          nextMovers.push({
            kind: mover.kind,
            leagueId: mover.leagueId,
            headline: mover.headline,
            detail: mover.detail,
            playerId: mover.playerId,
            claimPlayer:
              mover.kind !== 'trade'
                ? resolveWaiverClaimPlayer(mover, bootstrap.players)
                : undefined,
            givePlayerIds: giveIds,
            getPlayerIds: getIds,
            givePlayers,
            getPlayers,
            partnerRosterId: mover.partnerRosterId,
            partnerLabel: counterpartyLabel(partnerTeam?.teamName, mover.partnerRosterId ?? null),
            gain: mover.valueGain,
            acceptanceProbability: mover.acceptanceProbability ?? null,
            before: mover.titleOddsBefore,
            after: mover.titleOddsAfter,
            signature,
          });
          return nextMovers;
        }, [])
      : [];
  const suggestionsAsOf = formatAsOfTime(pricingMeta.lastUpdatedAt);
  const scanCoolingDown =
    marketScan.lastScannedAt != null &&
    scanClock - marketScan.lastScannedAt < marketScan.cooldownMs;
  const scanButtonLabel = scanCoolingDown && marketScan.lastScannedAt
    ? `Scanned at ${formatAsOfTime(marketScan.lastScannedAt)}`
    : 'Scan the market';

  const handleScanMarket = async () => {
    if (!stored || !bootstrap || marketScan.isScanning || scanCoolingDown) return;
    const visibleBefore = new Set(
      movers
        .filter((mover) => mover.kind === 'trade' && mover.signature)
        .map((mover) => mover.signature as string),
    );
    const nextPricing = await scanMarket();
    const nextVisibleTradeSignatures = (nextPricing?.movers ?? [])
      .filter((mover) => mover.kind === 'trade')
      .map((mover) => (stored.leagueId ? marketMoverSignature(stored.leagueId, mover) : null))
      .filter(
        (signature): signature is string =>
          signature !== null && !dismissedSignatures.has(signature),
      );
    const hasFreshTrade = nextVisibleTradeSignatures.some((signature) => !visibleBefore.has(signature));
    setMarketScanNote(
      hasFreshTrade
        ? null
        : 'No new deals on the board. The market moves when lineups do.',
    );
  };

  return (
    <>
      <MatchupLive
        movers={movers}
        titles={titleRows}
        userFuture={pricing?.available ? pricing.futures?.find((f) => f.isUser) ?? null : null}
        titleHistory={pricing?.available ? pricing.titleHistory ?? null : null}
        isConnected={connectedMatchup !== null}
        isPriced={Boolean(pricing?.available)}
        lineHistory={lineHistory}
        lineMovement={connectedMatchup ? lineMovement : null}
        matchup={connectedMatchup ?? MOCK_MATCHUP}
        scoringNote={pricing?.available ? pricing.scoringNote ?? null : null}
        marketScan={{
          isScanning: marketScan.isScanning,
          buttonLabel: scanButtonLabel,
          coolingDown: scanCoolingDown,
          note: marketScanNote,
        }}
        onDismissMover={(signature) => {
          dismiss(signature);
          setMarketScanNote(null);
        }}
        onScanMarket={() => {
          void handleScanMarket();
        }}
        suggestionsAsOf={suggestionsAsOf}
        suggestionsFetching={pricingMeta.isFetching}
        suggestionsResolved={pricingMeta.hasResolved}
        suggestionsStale={pricingMeta.isStale}
        unpricedStarterCount={
          pricing?.available && bootstrap
            ? (pricing.lines
                ?.flatMap((line) => Object.entries(line.sides))
                .find(([rosterId]) =>
                  String(bootstrap.teams.find((team) => team.isUser)?.rosterId) === rosterId,
                )?.[1]?.unpricedStarters.length ?? 0)
            : 0
        }
        unpricedStarterNames={
          pricing?.available && bootstrap
            ? (pricing.lines
                ?.flatMap((line) => Object.entries(line.sides))
                .find(([rosterId]) =>
                  String(bootstrap.teams.find((team) => team.isUser)?.rosterId) === rosterId,
                )?.[1]?.unpricedStarters ?? [])
                .map((playerId) => bootstrap.players[playerId]?.name ?? playerId)
            : []
        }
      />
      <DismissToast onUndo={undo} visible={pendingUndoSignature != null} />
    </>
  );
}
