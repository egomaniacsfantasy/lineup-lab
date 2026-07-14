import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { SimulationLoader } from '../components/ui/SimulationLoader';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { ScoutingView } from './market/ScoutingView.tsx';
import '../components/trade/TradeAnalyzerPanel.css';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useDismissedTradeSuggestions } from '../hooks/useDismissedTradeSuggestions';
import { toPlayer } from '../adapters/connectedLeague';
import {
  priceTrade,
  analyzeTradeApi,
  fetchTradeCounter,
  type TradeResult,
  type TradeAnalysis,
  type TradeCounter,
  type TradeTraits,
} from '../services/leagueApi';
import { TradeAnalyzerPanel } from '../components/trade/TradeAnalyzerPanel';
import type { LeagueBootstrap, MarketMover } from '../services/leagueApi';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import { getAcceptanceLingo } from '../utils/acceptanceLingo';
import {
  marketMoverPlayerIds,
  marketMoverSignature,
  samePositionOneForOneTrade,
} from '../utils/tradeMarket';
import {
  acceptanceGaugeLabel,
  applyTradeDisplayPolicy,
  lowAcceptanceTag,
} from '../utils/tradeSuggestionDisplay';
import {
  useDynastyTradesExperimental,
  useScoutingAffectsAcceptance,
  writeScoutingAffectsAcceptance,
} from '../hooks/useLabsFlags';
import type { ManagerFile } from '../services/managerFiles';
import { compileManagerFile } from '../services/managerFiles';
import {
  clearTradeTraitsOverride,
  resolveTradeTraits,
  saveTradeTraits,
  NEUTRAL_READ,
} from '../utils/tradeTraits';
import './TradePage.css';

function laneIds(primary?: string[], fallback?: string) {
  return primary?.length ? primary : fallback ? [fallback] : [];
}

function playerName(bootstrap: LeagueBootstrap, id: string) {
  return bootstrap.players[id]?.name ?? `Player ${id}`;
}

function lastName(name: string) {
  const pieces = name.trim().split(/\s+/);
  return pieces.at(-1) ?? name;
}

function initialLast(name: string) {
  const pieces = name.trim().split(/\s+/);
  if (pieces.length <= 1) return name;
  return `${pieces[0][0]}. ${lastName(name)}`;
}

function laneSideLabel(bootstrap: LeagueBootstrap, ids: string[], compressed: boolean) {
  if (ids.length === 0) return 'PLAYER';
  return ids
    .map((id) => {
      const name = playerName(bootstrap, id);
      return compressed ? initialLast(name) : name;
    })
    .join(' + ')
    .toUpperCase();
}

function DealLaneTitle({
  fullIncoming,
  fullOutgoing,
  compressedIncoming,
  compressedOutgoing,
}: {
  fullIncoming: string;
  fullOutgoing: string;
  compressedIncoming: string;
  compressedOutgoing: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState<'full' | 'snug' | 'compressed'>('full');
  const incoming = fit === 'compressed' ? compressedIncoming : fullIncoming;
  const outgoing = fit === 'compressed' ? compressedOutgoing : fullOutgoing;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const overflows = el.scrollWidth > el.clientWidth + 1;
        if (!overflows) return;
        setFit((current) => {
          if (current === 'full') return 'snug';
          if (current === 'snug') return 'compressed';
          return current;
        });
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fit, fullIncoming, fullOutgoing, compressedIncoming, compressedOutgoing]);

  return (
    <span
      className={[
        'trade-cc__lane-title',
        fit === 'snug' ? 'trade-cc__lane-title--snug' : '',
        fit === 'compressed' ? 'trade-cc__lane-title--compressed' : '',
      ].filter(Boolean).join(' ')}
      ref={ref}
    >
      <span>{incoming}</span>
      <span className="trade-cc__lane-for">for</span>
      <span>{outgoing}</span>
    </span>
  );
}


function acceptanceStyle(probability = 50): CSSProperties {
  const pct = Math.min(100, Math.max(0, probability));
  return { '--lane-acceptance-pct': `${pct}%` } as CSSProperties;
}

function acceptanceTone(probability = 50) {
  const tone = getAcceptanceLingo(probability)?.tone ?? 'neutral';
  if (tone === 'good') return 'trade-cc__lane-acceptance-fill--good';
  if (tone === 'bad') return 'trade-cc__lane-acceptance-fill--muted';
  return 'trade-cc__lane-acceptance-fill--neutral';
}

function analysisVerdict(youDeltaTitle: number) {
  if (youDeltaTitle >= 4) return { label: 'Steal', stamp: 'STEAL.', tone: 'good' };
  if (youDeltaTitle >= 1.5) return { label: 'Good value', stamp: 'GOOD VALUE.', tone: 'good' };
  if (youDeltaTitle > -1.5) return { label: 'Fair', stamp: 'FAIR DEAL.', tone: 'neutral' };
  if (youDeltaTitle > -4) return { label: 'Overpay', stamp: 'OVERPAY.', tone: 'bad' };
  return { label: 'Big overpay', stamp: 'BIG OVERPAY.', tone: 'bad' };
}

function railPosition(youDeltaTitle: number) {
  return 0.5 + 0.5 * Math.tanh(youDeltaTitle / 6);
}

function priceRailStyle(position: number): CSSProperties {
  const pct = Math.max(0, Math.min(1, position)) * 100;
  return {
    '--trade-price-position': `${pct}%`,
    '--trade-price-fill-left': `${Math.min(50, pct)}%`,
    '--trade-price-fill-width': `${Math.abs(pct - 50)}%`,
  } as CSSProperties;
}

function signedPct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatGeneratedAt(value?: number) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatClockTime(value?: number | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TM';
}

const NEUTRAL_TRADE_TRAITS: TradeTraits = {
  toughness: 5,
  dealAppetite: 5,
  fandomTeam: null,
  fandomLevel: 5,
};

// Starters first, in their lineup order, then the bench, the way a manager
// reads a roster.
function rosterRows(bootstrap: LeagueBootstrap, rosterId: number) {
  const team = bootstrap.teams.find((t) => t.rosterId === rosterId);
  if (!team) return [];
  const starters = (team.starters ?? []).filter((id) => id && id !== '0');
  const starterSet = new Set(starters);
  const bench = team.players.filter((id) => !starterSet.has(id));
  return [...starters, ...bench]
    .map((id) => ({ id, player: bootstrap.players[id], isStarter: starterSet.has(id) }))
    .filter((row) => row.player);
}

function laneBelongsToLeague(
  lane: MarketMover,
  bootstrap: LeagueBootstrap,
  leagueId: string,
) {
  if (lane.leagueId && lane.leagueId !== leagueId) return false;
  const partner = lane.partnerRosterId == null
    ? null
    : bootstrap.teams.find((team) => team.rosterId === lane.partnerRosterId);
  if (!partner) return false;

  const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
  const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
  if (givePlayerIds.length === 0 || getPlayerIds.length === 0) return false;

  const userTeam = bootstrap.teams.find((team) => team.isUser);
  if (!userTeam) return false;
  return (
    givePlayerIds.every((id) => userTeam.players.includes(id)) &&
    getPlayerIds.every((id) => partner.players.includes(id))
  );
}

function tradeLanesForLeague(
  pricing: ReturnType<typeof useLeagueConnection>['pricing'],
  bootstrap: LeagueBootstrap | null,
  leagueId: string | null,
) {
  if (!pricing?.available || !bootstrap || !leagueId) return [];
  const candidateLanes = (pricing.movers ?? [])
    .filter((mover) => mover.kind === 'trade' && laneBelongsToLeague(mover, bootstrap, leagueId))
    .filter((mover) => !samePositionOneForOneTrade(mover, bootstrap.players));
  const { visible, longShotFallback } = applyTradeDisplayPolicy(candidateLanes);
  return visible
    .map((lane) => ({
      lane,
      signature: marketMoverSignature(leagueId, lane),
      lowAcceptanceTag: lowAcceptanceTag(
        lane.acceptanceProbability,
        longShotFallback === lane,
      ),
    }))
    .filter(
      (
        entry,
      ): entry is {
        lane: MarketMover;
        signature: string;
        lowAcceptanceTag: string | null;
      } => Boolean(entry.signature),
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
    <div className="trade-cc__dismiss-toast" role="status">
      <span>Dismissed.</span>
      <button className="trade-cc__dismiss-toast-action" onClick={onUndo} type="button">
        Undo
      </button>
    </div>
  );
}

/** Your private read on a manager: two subjective sliders that feed the trade
 *  acceptance model. Saved per manager and loaded into every trade with them. */
function ManagerReadCard({
  leagueId,
  name,
  friendliness,
  relationship,
  scoutingOn,
  suggestedRead,
  suggestedReceipt,
  source,
  sourceLabel,
  suggestedReason,
  onChange,
  onReset,
}: {
  leagueId: string;
  name: string;
  friendliness: number;
  relationship: number;
  scoutingOn: boolean;
  suggestedRead: { friendliness: number; relationship: number };
  suggestedReceipt: { friendliness: string; relationship: string };
  source: 'neutral' | 'scouted' | 'override';
  sourceLabel: string;
  suggestedReason: string;
  onChange: (next: { friendliness?: number; relationship?: number }) => void;
  onReset: () => void;
}) {
  return (
    <div className="trade-cc__read-card">
      <p className="trade-cc__read-title">Your read on {name}</p>
      <label className="trade-cc__read-toggle">
        <span>Scouting affects acceptance odds</span>
        <button
          aria-pressed={scoutingOn}
          className={[
            'trade-cc__read-toggle-btn',
            scoutingOn ? 'trade-cc__read-toggle-btn--on' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => writeScoutingAffectsAcceptance(leagueId, !scoutingOn)}
          type="button"
        >
          <span />
        </button>
      </label>
      <ReadSlider
        label="Trade-friendliness"
        hint="0 = stubborn hoarder · 10 = wheeler-dealer"
        value={friendliness}
        ghost={suggestedRead.friendliness}
        ghostReceipt={suggestedReceipt.friendliness}
        onChange={(n) => onChange({ friendliness: n })}
      />
      <ReadSlider
        label="Relationship"
        hint="0 = despises you · 10 = great terms"
        value={relationship}
        ghost={suggestedRead.relationship}
        ghostReceipt={suggestedReceipt.relationship}
        onChange={(n) => onChange({ relationship: n })}
      />
      <p className="trade-cc__read-note">
        Only nudges the acceptance odds, never the championship numbers. {source === 'override'
          ? 'Your override is active.'
          : scoutingOn
            ? `Scouted default is active (${sourceLabel}).`
            : 'Scouting is off, so the file stays neutral.'}
      </p>
      <p className="trade-cc__read-note">{suggestedReason}</p>
      {source === 'override' ? (
        <button className="trade-cc__read-reset" onClick={onReset} type="button">
          Reset to scouted
        </button>
      ) : null}
    </div>
  );
}

function ReadSlider({
  label,
  hint,
  value,
  ghost,
  ghostReceipt,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  ghost?: number;
  ghostReceipt?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="trade-cc__read-slider">
      <div className="trade-cc__read-slider-head">
        <span>{label}</span>
        <span className="trade-cc__read-slider-value">{value}</span>
      </div>
      <input type="range" min={0} max={10} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {typeof ghost === 'number' ? (
        <span className="trade-cc__read-slider-ghost">
          {ghostReceipt ?? `data suggests ${ghost}`}
        </span>
      ) : null}
      <span className="trade-cc__read-slider-hint">{hint}</span>
    </div>
  );
}

function TradeDealsView() {
  const { bootstrap, stored, pricing, isLoading, error, marketScan, scanMarket } =
    useLeagueConnection();
  const [params, setParams] = useSearchParams();
  const builderRef = useRef<HTMLElement | null>(null);

  const userTeam = bootstrap?.teams.find((t) => t.isUser) ?? null;
  const partners = useMemo(
    () => (bootstrap ? bootstrap.teams.filter((t) => !t.isUser) : []),
    [bootstrap],
  );

  const [partnerRosterId, setPartnerRosterId] = useState<number | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [getIds, setGetIds] = useState<string[]>([]);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [isPricing, setIsPricing] = useState(false);
  const [analysis, setAnalysis] = useState<TradeAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [counter, setCounter] = useState<TradeCounter | null>(null);
  const [counterLoading, setCounterLoading] = useState(false);
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');
  const [friendliness, setFriendliness] = useState(5);
  const [relationship, setRelationship] = useState(5);
  const [suggestedRead, setSuggestedRead] = useState(NEUTRAL_READ);
  const [suggestedReadReason, setSuggestedReadReason] = useState(
    'Neutral file until a manager dossier is compiled.',
  );
  const [readSource, setReadSource] = useState<'neutral' | 'scouted' | 'override'>('neutral');
  const [readSourceLabel, setReadSourceLabel] = useState('neutral file');
  const [scoutingFile, setScoutingFile] = useState<ManagerFile | null>(null);
  const [showRead, setShowRead] = useState(false);
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false);
  const [isEditingTrade, setIsEditingTrade] = useState(true);
  const [openLaneWhy, setOpenLaneWhy] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scanClock, setScanClock] = useState(() => Date.now());
  const verdictRef = useRef<HTMLElement | null>(null);
  const selectedPartner = useMemo(
    () => partners.find((team) => team.rosterId === partnerRosterId) ?? null,
    [partnerRosterId, partners],
  );
  const scoutingAffectsAcceptance = useScoutingAffectsAcceptance(stored?.leagueId);
  const dynastyTradesExperimental = useDynastyTradesExperimental();

  const currentWeek = pricing?.week ?? bootstrap?.week ?? null;
  const { dismissedSignatures, dismiss, undo, restoreAll, pendingUndoSignature } =
    useDismissedTradeSuggestions(stored?.leagueId ?? null, currentWeek);
  const laneEntries = useMemo(
    () => tradeLanesForLeague(pricing, bootstrap, stored?.leagueId ?? null),
    [bootstrap, pricing, stored?.leagueId],
  );
  const lanes = useMemo(
    () => laneEntries.filter((entry) => !dismissedSignatures.has(entry.signature)),
    [dismissedSignatures, laneEntries],
  );

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

  const scanCoolingDown =
    marketScan.lastScannedAt != null &&
    scanClock - marketScan.lastScannedAt < marketScan.cooldownMs;
  const scanButtonLabel = scanCoolingDown && marketScan.lastScannedAt
    ? `Scanned at ${formatClockTime(marketScan.lastScannedAt)}`
    : 'Scan the market';

  // A deep link from Scouting/Matchup (managerRosterId / manager in the URL)
  // pre-selects that partner in the builder. We intentionally do NOT pre-fill
  // give/get from the URL, so a stale suggestion URL can never "default" the
  // analyzer to some trade. The builder always starts with an empty trade.
  // Applied once per partner so later re-renders (pricing/lanes refetch) can't
  // overwrite manual edits.
  const appliedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!bootstrap || !stored) return;
    const leagueParam = params.get('leagueId');
    if (leagueParam && leagueParam !== stored.leagueId) return;
    const rosterParam = Number(params.get('managerRosterId'));
    const managerParam = params.get('manager');
    const giveParam = params.get('give');
    const getParam = params.get('get');
    const partner = Number.isFinite(rosterParam) && rosterParam > 0
      ? bootstrap.teams.find((team) => team.rosterId === rosterParam)
      : managerParam
        ? bootstrap.teams.find((team) => team.ownerId === managerParam)
        : null;
    if (!partner || partner.isUser) return;
    const nextGive = giveParam ? giveParam.split(',').filter(Boolean) : [];
    const nextGet = getParam ? getParam.split(',').filter(Boolean) : [];
    const sig = `${partner.rosterId}:${nextGive.join(',')}:${nextGet.join(',')}`;
    if (appliedDeepLink.current === sig) return; // already applied; don't overwrite manual edits
    appliedDeepLink.current = sig;
    setPartnerRosterId(partner.rosterId);
    setGive(nextGive);
    setGetIds(nextGet);
    resetOutputs();
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }, [bootstrap, params, stored]);

  useEffect(() => {
    if (!stored || !selectedPartner) {
      setScoutingFile(null);
      setSuggestedRead(NEUTRAL_READ);
      setSuggestedReadReason('Neutral file until a manager dossier is compiled.');
      setReadSourceLabel('neutral file');
      return;
    }
    if (stored.provider !== 'sleeper' || !selectedPartner.ownerId) {
      setScoutingFile(null);
      setSuggestedRead(NEUTRAL_READ);
      setSuggestedReadReason('No public Sleeper file is connected here, so the read stays neutral.');
      setReadSourceLabel('neutral file');
      return;
    }

    let cancelled = false;
    compileManagerFile({
      provider: stored.provider,
      leagueId: stored.leagueId,
      managerTeam: selectedPartner,
      viewerUserId: stored.userId,
      currentWeek: bootstrap?.week ?? 1,
    })
      .then((file) => {
        if (cancelled) return;
        setScoutingFile(file);
        setSuggestedRead(file.readDefaults);
        setSuggestedReadReason(file.readDefaults.rationale);
        setReadSourceLabel(file.readDefaults.sourceLabel);
      })
      .catch(() => {
        if (cancelled) return;
        setScoutingFile(null);
        setSuggestedRead(NEUTRAL_READ);
        setSuggestedReadReason('The file could not be refreshed, so the read stays neutral.');
        setReadSourceLabel('neutral file');
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap?.week, selectedPartner, stored]);

  // Resolve the active read for this manager from scouted defaults + overrides.
  useEffect(() => {
    if (!stored) return;
    const resolved = resolveTradeTraits(
      stored.leagueId,
      partnerRosterId,
      suggestedRead,
      scoutingAffectsAcceptance,
    );
    setFriendliness(resolved.friendliness);
    setRelationship(resolved.relationship);
    setReadSource(resolved.source);
    setReadSourceLabel(
      scoutingAffectsAcceptance
          ? scoutingFile?.readDefaults.sourceLabel ?? 'neutral file'
          : 'neutral file',
    );
    setShowRead(false);
  }, [partnerRosterId, scoutingAffectsAcceptance, scoutingFile, stored, suggestedRead]);

  const updateRead = (next: { friendliness?: number; relationship?: number }) => {
    const t = { friendliness, relationship, ...next };
    setFriendliness(t.friendliness);
    setRelationship(t.relationship);
    setReadSource('override');
    if (stored) saveTradeTraits(stored.leagueId, partnerRosterId, { ...t, mode: 'override' });
  };

  const resetRead = () => {
    if (!stored) return;
    clearTradeTraitsOverride(stored.leagueId, partnerRosterId);
    const resolved = resolveTradeTraits(
      stored.leagueId,
      partnerRosterId,
      suggestedRead,
      scoutingAffectsAcceptance,
    );
    setFriendliness(resolved.friendliness);
    setRelationship(resolved.relationship);
    setReadSource(resolved.source);
  };

  const canPrice = partnerRosterId != null && give.length > 0 && getIds.length > 0;
  const verdictReady = Boolean(
    result?.available &&
    result.you &&
    result.them &&
    analysis?.available &&
    analysis.you &&
    analysis.partner,
  );
  const builderCollapsed = verdictReady && !isEditingTrade;
  const verdictMeta = verdictReady && analysis?.you && analysis.partner
    ? {
        verdict: analysisVerdict(analysis.you.delta.titleProb),
        priceStyle: priceRailStyle(railPosition(analysis.you.delta.titleProb)),
        railTone: railPosition(analysis.you.delta.titleProb) >= 0.5 ? 'steal' : 'overpay',
      }
    : null;

  useEffect(() => {
    if (!builderCollapsed) return;
    window.setTimeout(() => verdictRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
  }, [builderCollapsed]);

  // Connected leagues get Market deals; the mock targets are
  // demo-only and never render next to a real roster.
  if (stored && !bootstrap) {
    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Market</h1>
        <SeasonalNotice>
          {isLoading
            ? 'Syncing your trade board…'
            : error ?? "We couldn't load your league context for trades right now."}
        </SeasonalNotice>
      </div>
    );
  }

  if (!bootstrap || !userTeam || !stored) {
    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Trade targets</h1>
        <TradeTargetsList groups={MOCK_TRADE_TARGET_GROUPS} />
      </div>
    );
  }

  // TEMPORARY - dynasty trade UX unvalidated
  if (bootstrap.league.leagueType === 'keeper') {
    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Market</h1>
        <SeasonalNotice>
          Market deals are still redraft-first. Keeper leagues stay off for now because player age
          and keep-cost value are not priced yet.
        </SeasonalNotice>
      </div>
    );
  }
  if (bootstrap.league.leagueType === 'dynasty' && !dynastyTradesExperimental) {
    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Market</h1>
        <SeasonalNotice>
          Dynasty trades are behind the Labs switch right now. Turn on Dynasty trades
          (experimental) in More to test the flow.
        </SeasonalNotice>
      </div>
    );
  }

  // Any change to the trade invalidates both the price verdict and the sim.
  const resetOutputs = () => {
    setResult(null);
    setAnalysis(null);
    setAnalysisError(null);
    setCounter(null);
    setCounterLoading(false);
    setIsEditingTrade(true);
  };

  const fetchCounter = async () => {
    if (!stored || partnerRosterId == null || give.length === 0 || getIds.length === 0) return;
    setCounterLoading(true);
    setCounter(null);
    try {
      const c = await fetchTradeCounter(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give,
        get: getIds,
      });
      setCounter(c);
    } catch {
      setCounter({ available: false, reason: 'error' });
    } finally {
      setCounterLoading(false);
    }
  };

  // Inject the counter's throw-in onto the right side and re-price + re-analyze.
  const applyCounterAdd = (c: TradeCounter) => {
    const ids = (c.add ?? []).map((a) => a.id);
    if (ids.length === 0) return;
    const nextGive = c.whoAdds === 'you' ? [...new Set([...give, ...ids])] : give;
    const nextGet = c.whoAdds === 'them' ? [...new Set([...getIds, ...ids])] : getIds;
    setGive(nextGive);
    setGetIds(nextGet);
    setCounter(null);
    setIsEditingTrade(false);
    setIsPricing(true);
    const pricePromise = priceTrade(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: partnerRosterId!,
      give: nextGive,
      get: nextGet,
      traits: NEUTRAL_TRADE_TRAITS,
    }).then(setResult).catch(() => {});
    const analysisPromise = runAnalysis(nextGive, nextGet);
    void Promise.allSettled([pricePromise, analysisPromise]).finally(() => {
      setIsPricing(false);
      setIsEditingTrade(false);
    });
  };

  const runAnalysis = async (giveIds: string[], getIds2: string[]) => {
    if (partnerRosterId == null) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const a = await analyzeTradeApi(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give: giveIds,
        get: getIds2,
      });
      setAnalysis(a);
      if (!a.available) setAnalysisError(a.reason ?? 'Could not analyze this trade.');
    } catch (e) {
      setAnalysis(null);
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    if (isPricing || counterLoading) return;
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    resetOutputs();
  };

  const loadLane = (lane: MarketMover) => {
    const { givePlayerIds, getPlayerIds } = marketMoverPlayerIds(lane);
    if (lane.partnerRosterId == null || givePlayerIds.length === 0 || getPlayerIds.length === 0) return;
    setPartnerRosterId(lane.partnerRosterId);
    setGive(givePlayerIds);
    setGetIds(getPlayerIds);
    resetOutputs();
    setParams({
      view: 'deals',
      leagueId: stored.leagueId,
      managerRosterId: String(lane.partnerRosterId),
      give: givePlayerIds.join(','),
      get: getPlayerIds.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const laneWhy = (lane: MarketMover) => {
    const parts = [];
    if (lane.valueGain != null) {
      parts.push(`Your starters move ${signedPct(lane.valueGain).replace('%', ' pts/wk')}.`);
    }
    if (lane.partnerGain != null) {
      parts.push(`Their starters move ${signedPct(lane.partnerGain).replace('%', ' pts/wk')}.`);
    }
    if (lane.acceptanceProbability != null) {
      const partnerName = partners.find((team) => team.rosterId === lane.partnerRosterId)?.teamName;
      parts.push(`${partnerName ?? `Roster ${lane.partnerRosterId ?? '?'}`} accepts this ${lane.acceptanceProbability}% of the time.`);
    }
    if (lane.acceptanceReason) {
      parts.push(lane.acceptanceReason);
    }
    return parts.join(' ');
  };

  const dismissLane = (signature: string) => {
    dismiss(signature);
    setScanNotice(null);
  };

  const runPricing = async () => {
    if (partnerRosterId == null || give.length === 0 || getIds.length === 0) return;
    setIsPricing(true);
    setCounter(null);
    // One press: price the trade AND simulate its full-season impact.
    const pricePromise = priceTrade(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId,
      give,
      get: getIds,
      traits: NEUTRAL_TRADE_TRAITS,
    })
      .then(setResult)
      .catch(() => {});
    const analysisPromise = runAnalysis(give, getIds);
    try {
      await Promise.allSettled([pricePromise, analysisPromise]);
    } finally {
      setIsPricing(false);
      setIsEditingTrade(false);
    }
  };

  const handleScanMarket = async () => {
    if (!stored || !bootstrap || marketScan.isScanning || scanCoolingDown) return;
    const visibleBefore = new Set(lanes.map((entry) => entry.signature));
    const nextPricing = await scanMarket();
    const nextEntries = tradeLanesForLeague(nextPricing, bootstrap, stored.leagueId);
    const nextVisible = nextEntries.filter((entry) => !dismissedSignatures.has(entry.signature));
    const hasFreshVisibleTrade = nextVisible.some((entry) => !visibleBefore.has(entry.signature));
    setScanNotice(
      hasFreshVisibleTrade
        ? null
        : 'No new deals on the board. The market moves when lineups do.',
    );
  };

  // One-tap fair counter: add the suggested throw-in(s) to the right side and reprice.
  const renderLaneHeadshots = (
    getPlayerIds: string[],
    givePlayerIds: string[],
    compact: boolean,
  ) => {
    const allChips = [
      ...getPlayerIds.map((id) => ({ id, side: 'get' })),
      ...givePlayerIds.map((id) => ({ id, side: 'send' })),
    ];
    const visibleChips = allChips.slice(0, 4);
    const hiddenCount = allChips.length - visibleChips.length;

    return (
      <span className={['trade-cc__lane-headshots', compact ? 'trade-cc__lane-headshots--compact' : ''].filter(Boolean).join(' ')}>
        {visibleChips.map((chip) => (
          <PlayerHeadshot
            className={[
              'trade-cc__lane-headshot',
              chip.side === 'get'
                ? 'trade-cc__lane-headshot--get'
                : 'trade-cc__lane-headshot--send',
            ].filter(Boolean).join(' ')}
            fallbackClassName="trade-cc__lane-headshot-fallback"
            imageClassName="trade-cc__lane-headshot-image"
            key={`${chip.side}-${chip.id}`}
            player={toPlayer(chip.id, bootstrap.players)}
          />
        ))}
        {hiddenCount > 0 ? (
          <span className="trade-cc__lane-headshot trade-cc__lane-headshot--more">
            +{hiddenCount}
          </span>
        ) : null}
      </span>
    );
  };

  const renderDealPlayer = (id: string, tone: 'send' | 'get') => {
    const player = bootstrap.players[id];
    if (!player) return null;
    return (
      <span className={`trade-cc__deal-player trade-cc__deal-player--${tone}`} key={`${tone}-${id}`}>
        <PlayerHeadshot
          className="trade-cc__deal-player-headshot"
          fallbackClassName="trade-cc__deal-player-headshot-fallback"
          imageClassName="trade-cc__deal-player-headshot-image"
          player={toPlayer(id, bootstrap.players)}
        />
        <span className="trade-cc__deal-player-copy">
          <span className="trade-cc__deal-player-name">{player.name}</span>
        </span>
        <span className="trade-cc__deal-player-pos">{player.position}</span>
      </span>
    );
  };

  const renderDealSide = (ids: string[], label: string, tone: 'send' | 'get') => (
    <div className={`trade-cc__deal-side trade-cc__deal-side--${tone}`}>
      <span className="trade-cc__deal-side-label">{label}</span>
      <div className="trade-cc__deal-side-players">
        {ids.length > 0 ? ids.map((id) => renderDealPlayer(id, tone)) : (
          <span className="trade-cc__deal-side-empty">No players selected.</span>
        )}
      </div>
    </div>
  );

  const renderSelectedCards = (
    _rosterId: number,
    ids: string[],
    set: (v: string[]) => void,
    empty: string,
    tone: 'send' | 'get',
  ) => (
    <div className="trade-cc__selected-deck">
      {ids.length === 0 ? (
        <p className="trade-cc__selected-empty">{empty}</p>
      ) : (
        ids.map((id) => {
          const player = bootstrap.players[id];
          if (!player) return null;
          return (
            <article className={`trade-cc__asset-card trade-cc__asset-card--${tone}`} key={id}>
              <PlayerHeadshot
                className="trade-cc__asset-headshot"
                fallbackClassName="trade-cc__asset-headshot-fallback"
                imageClassName="trade-cc__asset-headshot-image"
                player={toPlayer(id, bootstrap.players)}
              />
              <span className="trade-cc__asset-pos">{player.position}</span>
              <span className="trade-cc__asset-copy">
                <span className="trade-cc__asset-name">{player.name}</span>
              </span>
              <button
                aria-label={`Remove ${player.name}`}
                className="trade-cc__asset-remove"
                disabled={isPricing || counterLoading}
                onClick={() => toggle(ids, set, id)}
                type="button"
              >
                ×
              </button>
            </article>
          );
        })
      )}
    </div>
  );

  const renderPool = (
    rosterId: number,
    list: string[],
    set: (v: string[]) => void,
    search: string,
    setSearch: (v: string) => void,
  ) => {
    const q = search.trim().toLowerCase();
    const allRows = rosterRows(bootstrap, rosterId);
    const rows = q ? allRows.filter((r) => r.player.name.toLowerCase().includes(q)) : allRows;
    const firstBenchIndex = rows.findIndex((r) => !r.isStarter);
    return (
      <>
        <input
          className="trade-cc__pool-search"
          disabled={isPricing || counterLoading}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search players"
          type="search"
          value={search}
        />
        <div className="trade-cc__pool">
          {rows.map((row, index) => (
          <div key={row.id}>
            {index === firstBenchIndex && firstBenchIndex > 0 ? (
              <p className="trade-cc__pool-divider">Bench</p>
            ) : null}
            <button
              className={[
                'trade-cc__pill',
                list.includes(row.id) ? 'trade-cc__pill--on' : '',
                row.isStarter ? '' : 'trade-cc__pill--bench',
              ].join(' ')}
              disabled={isPricing || counterLoading}
              onClick={() => toggle(list, set, row.id)}
              type="button"
            >
              <PlayerHeadshot
                className="trade-cc__pill-headshot"
                fallbackClassName="trade-cc__pill-headshot-fallback"
                imageClassName="trade-cc__pill-headshot-image"
                player={toPlayer(row.id, bootstrap.players)}
              />
              <span className="trade-cc__pill-pos">{row.player.position}</span>
              <span className="trade-cc__pill-name">{row.player.name}</span>
              <span className="trade-cc__pill-add">{list.includes(row.id) ? '✓ Added' : 'Add'}</span>
            </button>
          </div>
          ))}
        </div>
      </>
    );
  };

  const choosePartner = (rosterId: number | null) => {
    if (isPricing || counterLoading) return;
    setPartnerRosterId(rosterId);
    setPartnerMenuOpen(false);
    setGetIds([]);
    resetOutputs();
  };

  const renderTeamAvatar = (team: NonNullable<typeof selectedPartner>) => (
    <span className="trade-cc__team-avatar" aria-hidden="true">
      {team.avatarUrl ? (
        <img alt="" src={team.avatarUrl} />
      ) : (
        <span>{initials(team.teamName)}</span>
      )}
    </span>
  );

  const renderPartnerSelector = () => (
    <div className="trade-cc__partner-menu">
      <button
        aria-expanded={partnerMenuOpen}
        className="trade-cc__partner-trigger"
        disabled={isPricing || counterLoading}
        onClick={() => setPartnerMenuOpen((current) => !current)}
        type="button"
      >
        {selectedPartner ? renderTeamAvatar(selectedPartner) : <span className="trade-cc__team-avatar" aria-hidden="true">?</span>}
        <span className="trade-cc__partner-trigger-copy">
          <span>{selectedPartner?.teamName ?? 'Pick manager'}</span>
          {selectedPartner ? (
            <span>{selectedPartner.record.wins}-{selectedPartner.record.losses}</span>
          ) : null}
        </span>
      </button>
      {partnerMenuOpen ? (
        <div className="trade-cc__partner-options" role="listbox" aria-label="Pick manager">
          {partners.map((team) => (
            <button
              aria-selected={partnerRosterId === team.rosterId}
              className={[
                'trade-cc__partner-option',
                partnerRosterId === team.rosterId ? 'trade-cc__partner-option--active' : '',
              ].filter(Boolean).join(' ')}
              key={team.rosterId}
              onClick={() => choosePartner(team.rosterId)}
              role="option"
              type="button"
            >
              {renderTeamAvatar(team)}
              <span className="trade-cc__partner-option-copy">
                <span>{team.teamName}</span>
                <span>{team.record.wins}-{team.record.losses}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="trade-page">
      <h1 className="visually-hidden">Market</h1>

      <section className="trade-cc__finder">
        <div className="trade-cc__finder-head">
          <div>
            <h2 className="trade-cc__section-label">Managers you match with</h2>
            {scanNotice ? <p className="trade-cc__finder-sub">{scanNotice}</p> : null}
          </div>
          {marketScan.isScanning ? (
            <SimulationLoader label="Scanning the market" size="compact" variant="scan" />
          ) : (
            <button
              className="trade-cc__scan-btn"
              disabled={scanCoolingDown}
              onClick={() => void handleScanMarket()}
              type="button"
            >
              {scanButtonLabel}
            </button>
          )}
        </div>
        {lanes.length > 0 ? (
          <>
          {lanes.map(({ lane, signature, lowAcceptanceTag: laneTag }, index) => {
            const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
            const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
            const compact = index > 0;
            const partner = partners.find((team) => team.rosterId === lane.partnerRosterId);
            const acceptance = lane.acceptanceProbability ?? 50;
            const acceptanceRead = acceptanceGaugeLabel(acceptance);
            const laneKey = `lane-${lane.partnerRosterId}-${givePlayerIds.join(',')}-${getPlayerIds.join(',')}`;
            const whyOpen = openLaneWhy === laneKey;
            const generated = formatGeneratedAt(lane.pricedAt ?? pricing?.computedAt);
            return (
              <article
                className={['trade-cc__lane', compact ? 'trade-cc__lane--compact' : ''].filter(Boolean).join(' ')}
                key={laneKey}
                onClick={() => loadLane(lane)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  loadLane(lane);
                }}
                role="button"
                tabIndex={0}
              >
                <button
                  aria-label="Dismiss this suggested trade"
                  className="trade-cc__lane-dismiss"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    dismissLane(signature);
                  }}
                  type="button"
                >
                  Not interested
                </button>
                <span className="trade-cc__lane-top">
                  {renderLaneHeadshots(getPlayerIds, givePlayerIds, compact)}
                  <span className="trade-cc__lane-title-wrap">
                    <DealLaneTitle
                      compressedIncoming={laneSideLabel(bootstrap, getPlayerIds, true)}
                      compressedOutgoing={laneSideLabel(bootstrap, givePlayerIds, true)}
                      fullIncoming={laneSideLabel(bootstrap, getPlayerIds, false)}
                      fullOutgoing={laneSideLabel(bootstrap, givePlayerIds, false)}
                      key={`${getPlayerIds.join(',')}|${givePlayerIds.join(',')}`}
                    />
                    {laneTag ? <span className="trade-cc__lane-tag">{laneTag}</span> : null}
                  </span>
                  <span className="trade-cc__lane-chevron" aria-hidden="true">{'>'}</span>
                </span>

                <span className="trade-cc__lane-mid">
                  <span className="trade-cc__lane-copy">
                    <span className="trade-cc__lane-manager">{partner?.teamName ?? 'Manager'}</span>
                    <span className="trade-cc__lane-numbers">
                      <span className="trade-cc__lane-you">you {lane.valueGain != null ? signedPct(lane.valueGain).replace('%', '') : '+0.0'} pts/wk</span>
                      <span> · them {lane.partnerGain != null ? signedPct(lane.partnerGain).replace('%', '') : '+0.0'} pts/wk</span>
                    </span>
                  </span>
                  <span className="trade-cc__lane-acceptance" style={acceptanceStyle(acceptance)}>
                    <span className="trade-cc__lane-acceptance-label">
                      <span>{acceptanceRead ?? `${acceptance}%`}</span>
                    </span>
                    <span className="trade-cc__lane-acceptance-track">
                      <span
                        className={['trade-cc__lane-acceptance-fill', acceptanceTone(acceptance)].join(' ')}
                      />
                      <span className="trade-cc__lane-acceptance-notch" />
                      <span className="trade-cc__lane-acceptance-marker" />
                    </span>
                  </span>
                </span>
                <span className="trade-cc__lane-bottom">
                  <button
                    aria-expanded={whyOpen}
                    className="trade-cc__lane-why"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenLaneWhy((current) => (current === laneKey ? null : laneKey));
                    }}
                    type="button"
                  >
                    Why this trade?
                  </button>
                  {generated ? (
                    <span className="trade-cc__lane-generated">generated at {generated}</span>
                  ) : null}
                </span>
                {whyOpen ? (
                  <div className="trade-cc__lane-rationale" onClick={(event) => event.stopPropagation()}>
                    <p>{laneWhy(lane)}</p>
                    <button
                      className="trade-cc__lane-open"
                      onClick={(event) => {
                        event.stopPropagation();
                        loadLane(lane);
                      }}
                      type="button"
                    >
                      Open in Market →
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          </>
        ) : (
          <p className="trade-cc__empty-lane">
            {laneEntries.length > 0
              ? 'All current deals are dismissed. Restore them below or scan again.'
              : 'No suggested deals priced yet. Build your own below.'}
          </p>
        )}
        {dismissedSignatures.size > 0 ? (
          <p className="trade-cc__restore-line">
            Dismissed deals ({dismissedSignatures.size}) ·{' '}
            <button className="trade-cc__restore-btn" onClick={restoreAll} type="button">
              Restore
            </button>
          </p>
        ) : null}
      </section>

      {/* ── Builder ── */}
      <section
        className={[
          'trade-cc__builder',
          builderCollapsed ? 'trade-cc__builder--collapsed' : '',
        ].filter(Boolean).join(' ')}
        ref={builderRef}
      >
        {builderCollapsed ? (
          <div className="trade-cc__deal-strip">
            <div className="trade-cc__deal-strip-top">
              <span className="trade-cc__deal-strip-partner">
                {selectedPartner?.teamName ?? 'Manager'}
              </span>
              {isPricing ? (
                <SimulationLoader label="Pricing this trade" size="compact" />
              ) : (
                <button
                  className="trade-cc__edit-btn"
                  onClick={() => setIsEditingTrade(true)}
                  type="button"
                >
                  Edit trade
                </button>
              )}
            </div>
            <div className="trade-cc__deal-strip-grid">
              {renderDealSide(give, 'You send', 'send')}
              <span className="trade-cc__deal-strip-arrow" aria-hidden="true">⇄</span>
              {renderDealSide(getIds, 'You get', 'get')}
            </div>
          </div>
        ) : (
        <>
        <div className="trade-cc__builder-head">
          <div>
            <p className="trade-cc__kicker">Build a trade</p>
            <h2 className="trade-cc__title">Who is moving?</h2>
          </div>
        </div>

        <div className="trade-cc__columns">
          <div className="trade-cc__side">
            <div className="trade-cc__side-head">
              <div>
                <p className="trade-cc__column-label">Your side</p>
                <h3 className="trade-cc__side-title">You send</h3>
              </div>
              <span className="trade-cc__side-team">{userTeam.teamName}</span>
            </div>
            {renderSelectedCards(userTeam.rosterId, give, setGive, 'No players selected yet.', 'send')}
            {renderPool(userTeam.rosterId, give, setGive, giveSearch, setGiveSearch)}
          </div>

          <div className="trade-cc__side trade-cc__side--partner">
            <div className="trade-cc__side-head">
              <div>
                <p className="trade-cc__column-label">Their side</p>
                <h3 className="trade-cc__side-title">You get</h3>
              </div>
              <div className="trade-cc__partner-tools">
                {renderPartnerSelector()}
                {partnerRosterId != null ? (
                  <button
                    className="trade-cc__partner-read"
                    aria-expanded={showRead}
                    disabled={isPricing || counterLoading}
                    onClick={() => setShowRead((v) => !v)}
                    type="button"
                  >
                    {showRead ? 'Hide read' : 'Your read'}
                  </button>
                ) : null}
              </div>
            </div>
            {partnerRosterId != null && showRead ? (
              <ManagerReadCard
                leagueId={stored.leagueId}
                name={partners.find((t) => t.rosterId === partnerRosterId)?.teamName ?? 'this manager'}
                friendliness={friendliness}
                relationship={relationship}
                scoutingOn={scoutingAffectsAcceptance}
                source={readSource}
                sourceLabel={readSourceLabel}
                suggestedRead={suggestedRead}
                suggestedReceipt={{
                  friendliness: scoutingFile?.readDefaults.friendlinessReceipt ?? `data suggests ${suggestedRead.friendliness}`,
                  relationship: scoutingFile?.readDefaults.relationshipReceipt ?? `data suggests ${suggestedRead.relationship}`,
                }}
                suggestedReason={suggestedReadReason}
                onChange={updateRead}
                onReset={resetRead}
              />
            ) : null}
            {partnerRosterId != null ? (
              <>
                {renderSelectedCards(partnerRosterId, getIds, setGetIds, 'No return selected yet.', 'get')}
                {renderPool(partnerRosterId, getIds, setGetIds, getSearch, setGetSearch)}
              </>
            ) : (
              <p className="trade-cc__hint">Pick a manager to see their roster.</p>
            )}
          </div>
        </div>

        {isPricing ? (
          <SimulationLoader label="Pricing this trade" />
        ) : (
          <button
            className="trade-cc__price-btn"
            disabled={!canPrice}
            onClick={() => void runPricing()}
            type="button"
          >
            Price this trade
          </button>
        )}
        </>
        )}
      </section>

      {verdictReady && analysis?.you && analysis.partner && verdictMeta ? (
        <section className="trade-cc__verdict" ref={verdictRef}>
          <div className="trade-cc__verdict-hero">
            <div>
              <p className={`trade-cc__verdict-stamp trade-cc__verdict-stamp--${verdictMeta.verdict.tone}`}>
                {verdictMeta.verdict.stamp}
              </p>
              <p className="trade-cc__verdict-subhead">
                your championship <span>{signedPct(analysis.you.delta.titleProb)}</span>
              </p>
            </div>
            <div
              className={[
                'trade-cc__hero-price',
                `trade-cc__hero-price--${verdictMeta.railTone}`,
              ].join(' ')}
              style={verdictMeta.priceStyle}
            >
              <span className="trade-cc__price-track" />
              <span className="trade-cc__price-center" />
              <span className="trade-cc__price-fill" />
              <span className="trade-cc__price-marker" />
              <span className="trade-cc__price-labels">
                <span>Overpay</span>
                <span>Fair</span>
                <span>Steal</span>
              </span>
            </div>
            {verdictMeta.verdict.label !== 'Fair' ? (
              <div className="trade-cc__hero-counter">
                {counterLoading ? (
                  <SimulationLoader label="Finding fair add" variant="evener" />
                ) : counter == null ? (
                  <button
                    className="trade-cc__counter-btn trade-cc__counter-btn--primary"
                    onClick={() => void fetchCounter()}
                    type="button"
                  >
                    Even out this trade →
                  </button>
                ) : !counter.available ? (
                  <p className="trade-cc__counter-body">Couldn&apos;t compute a fair counter.</p>
                ) : counter.needed === false ? (
                  <p className="trade-cc__counter-body">This trade is already balanced.</p>
                ) : counter.add && counter.add.length > 0 ? (
                  <div className="trade-cc__counter-card">
                    {renderDealSide(
                      counter.add.map((add) => add.id),
                      'Add',
                      counter.whoAdds === 'you' ? 'send' : 'get',
                    )}
                    <p className="trade-cc__counter-body">
                      {counter.whoAdds === 'you'
                        ? `Add ${counter.add.map((a) => a.name).join(' + ')} to your side to even it out.`
                        : `Ask ${analysis.partner.teamName} to add ${counter.add.map((a) => a.name).join(' + ')} to even it out.`}
                    </p>
                    {counter.before && counter.after ? (
                      <div className="trade-cc__counter-deltas">
                        <span>
                          You <b>{signedPct(counter.before.youDelta)}</b> to <b>{signedPct(counter.after.youDelta)}</b>
                        </span>
                        <span>
                          Them <b>{signedPct(counter.before.partnerDelta)}</b> to <b>{signedPct(counter.after.partnerDelta)}</b>
                        </span>
                      </div>
                    ) : null}
                    <button
                      className="trade-cc__counter-btn"
                      onClick={() => applyCounterAdd(counter)}
                      type="button"
                    >
                      {counter.whoAdds === 'you' ? 'Add it to what you give' : 'Add it to what you get'}
                    </button>
                  </div>
                ) : (
                  <p className="trade-cc__counter-body">No single add balances this trade well.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="trade-cc__accept-toggle-row">
            <span>Scouting affects acceptance odds</span>
            <button
              aria-pressed={scoutingAffectsAcceptance}
              className={[
                'trade-cc__read-toggle-btn',
                scoutingAffectsAcceptance ? 'trade-cc__read-toggle-btn--on' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => writeScoutingAffectsAcceptance(stored.leagueId, !scoutingAffectsAcceptance)}
              type="button"
            >
              <span />
            </button>
          </div>

          <TradeAnalyzerPanel
            analysis={analysis}
            analyzing={analyzing}
            error={analysisError}
            friendliness={friendliness}
            relationship={relationship}
            readSource={readSource}
            readSourceLabel={readSourceLabel}
            showVerdict={false}
          />
        </section>
      ) : result && !result.available ? (
        <SeasonalNotice>
          {result.reason === 'no_projections'
            ? 'Trades price once projections are imported.'
            : 'Pick at least one player on each side to price the trade.'}
        </SeasonalNotice>
      ) : null}
      <DismissToast onUndo={undo} visible={pendingUndoSignature != null} />
    </div>
  );
}

export function TradePage() {
  const [params, setParams] = useSearchParams();
  const { stored } = useLeagueConnection();
  const view = params.get('view') === 'scouting' ? 'scouting' : 'deals';

  const setView = (next: 'deals' | 'scouting') => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('view', next);
    if (stored?.leagueId) nextParams.set('leagueId', stored.leagueId);
    setParams(nextParams, { replace: true });
  };

  return (
    <div className="market-page">
      <h1 className="visually-hidden">Market</h1>
      <div className="market-page__view-tabs" role="tablist" aria-label="Market views">
        {[
          ['deals', 'Deals'],
          ['scouting', 'Scouting'],
        ].map(([key, label]) => (
          <button
            aria-selected={view === key}
            className={[
              'market-page__view-tab',
              view === key ? 'market-page__view-tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={key}
            onClick={() => setView(key as 'deals' | 'scouting')}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'deals' ? <TradeDealsView /> : <ScoutingView />}
    </div>
  );
}
