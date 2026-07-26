import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeCard, TradeSide } from '../components/trade-display/TradeDisplay';
import { SimulationLoader } from '../components/ui/SimulationLoader';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import '../components/trade/TradeAnalyzerPanel.css';
import '../components/trade-display/TradeDisplay.css';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useDismissedTradeSuggestions } from '../hooks/useDismissedTradeSuggestions';
import { toPlayer } from '../adapters/connectedLeague';
import {
  priceTrade,
  analyzeTradeApi,
  fetchTradeCounter,
  fetchTradeSuggestions,
  type TradeResult,
  type TradeAnalysis,
  type TradeCounter,
  type TradeSuggestion,
  type TradeTraits,
} from '../services/leagueApi';
import { TradeAnalyzerPanel } from '../components/trade/TradeAnalyzerPanel';
import type { LeagueBootstrap } from '../services/leagueApi';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import {
  samePositionOneForOneTrade,
  tradeSignature,
} from '../utils/tradeMarket';
import {
  acceptanceGaugeLabel,
  applyTradeDisplayPolicy,
} from '../utils/tradeSuggestionDisplay';
import { acceptanceProbability } from '../utils/tradeAcceptance';
import { signedDeltaClass } from '../utils/deltaTone';
import { formatAmericanOdds } from '../utils/formatOdds';
import {
  useDynastyTradesExperimental,
  useScoutingAffectsAcceptance,
  writeScoutingAffectsAcceptance,
} from '../hooks/useLabsFlags';
import type { ManagerFile } from '../services/managerFiles';
import { compileManagerFile } from '../services/managerFiles';
import {
  clearTradeTraitsOverride,
  loadTradeTraitsRecord,
  resolveTradeTraits,
  saveTradeTraits,
  NEUTRAL_READ,
} from '../utils/tradeTraits';
import {
  tradeSideFromIds,
} from '../utils/tradeDisplay';
import './TradePage.css';

type MarketPositionFilter = 'all' | 'QB' | 'RB' | 'WR' | 'TE';

function normalizeMarketPosition(value: string | null | undefined): Exclude<MarketPositionFilter, 'all'> | null {
  const upper = value?.toUpperCase();
  if (upper === 'QB' || upper === 'RB' || upper === 'WR' || upper === 'TE') return upper;
  return null;
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

function deltaTone(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function formatGeneratedAt(value?: number) {
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

function recordText(record: { wins: number; losses: number; ties?: number }) {
  return record.ties ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

const NEUTRAL_TRADE_TRAITS: TradeTraits = {
  toughness: 5,
  dealAppetite: 5,
  fandomTeam: null,
  fandomLevel: 5,
};

const MAX_VISIBLE_MARKET_CARDS = 5;

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
  const { bootstrap, stored, pricing, isLoading, error } =
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
  const [marketManagerFilter, setMarketManagerFilter] = useState<number | null>(null);
  const [marketPositionFilter, setMarketPositionFilter] = useState<MarketPositionFilter>('all');
  const [managerSuggestions, setManagerSuggestions] = useState<TradeSuggestion[]>([]);
  const [managerSuggestionsLoading, setManagerSuggestionsLoading] = useState(false);
  const [managerSuggestionsError, setManagerSuggestionsError] = useState<string | null>(null);
  const [managerSuggestionsUpdatedAt, setManagerSuggestionsUpdatedAt] = useState<number | null>(null);
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false);
  const [isEditingTrade, setIsEditingTrade] = useState(true);
  const [showAllMarketCards, setShowAllMarketCards] = useState(false);
  const verdictRef = useRef<HTMLElement | null>(null);
  const selectedPartner = useMemo(
    () => partners.find((team) => team.rosterId === partnerRosterId) ?? null,
    [partnerRosterId, partners],
  );
  const futuresByRoster = useMemo(
    () => new Map((pricing?.futures ?? []).map((future) => [future.rosterId, future])),
    [pricing?.futures],
  );
  const scoutingAffectsAcceptance = useScoutingAffectsAcceptance(stored?.leagueId);
  const dynastyTradesExperimental = useDynastyTradesExperimental();

  const currentWeek = pricing?.week ?? bootstrap?.week ?? null;
  const { dismissedSignatures, dismiss, undo, restoreAll, pendingUndoSignature } =
    useDismissedTradeSuggestions(stored?.leagueId ?? null, currentWeek);
  const managerSuggestionEntries = useMemo(() => {
    if (!stored || !bootstrap || marketManagerFilter == null) return [];

    const targeted = managerSuggestions
      .filter((suggestion) => suggestion.partnerRosterId === marketManagerFilter)
      .map((suggestion) => ({
        suggestion,
        signature: tradeSignature({
          leagueId: stored.leagueId,
          partnerRosterId: suggestion.partnerRosterId,
          givePlayerIds: suggestion.give.map((asset) => asset.id),
          getPlayerIds: suggestion.get.map((asset) => asset.id),
        }),
        acceptanceProbability: acceptanceProbability(
          suggestion.partnerDelta,
          friendliness,
          relationship,
        ),
        valueGain: suggestion.youDelta,
        position: normalizeMarketPosition(
          suggestion.get
            .map((asset) => bootstrap.players[asset.id]?.position)
            .find(Boolean),
        ),
      }))
      .filter(
        (entry) =>
          !samePositionOneForOneTrade(
            {
              givePlayerIds: entry.suggestion.give.map((asset) => asset.id),
              getPlayerIds: entry.suggestion.get.map((asset) => asset.id),
            },
            bootstrap.players,
          ),
      );

    const positionFiltered = targeted.filter(
      (entry) => marketPositionFilter === 'all' || entry.position === marketPositionFilter,
    );
    const { visible } = applyTradeDisplayPolicy(positionFiltered);
    return visible.filter((entry) => !dismissedSignatures.has(entry.signature));
  }, [
    bootstrap,
    dismissedSignatures,
    friendliness,
    managerSuggestions,
    marketManagerFilter,
    marketPositionFilter,
    relationship,
    stored,
  ]);
  const showingManagerMarket = marketManagerFilter != null;
  const visibleManagerSuggestions = showAllMarketCards
    ? managerSuggestionEntries
    : managerSuggestionEntries.slice(0, MAX_VISIBLE_MARKET_CARDS);
  const visibleMarketCount = showingManagerMarket ? managerSuggestionEntries.length : 0;
  const hiddenMarketCount = showingManagerMarket
    ? managerSuggestionEntries.length - visibleManagerSuggestions.length
    : 0;
  const managerFacts = showingManagerMarket
    ? `${partners.length} managers priced · ${visibleMarketCount} deals found`
    : `${partners.length} managers taking calls`;

  useEffect(() => {
    setShowAllMarketCards(false);
  }, [marketManagerFilter, marketPositionFilter]);

  useEffect(() => {
    if (!stored || marketManagerFilter == null) {
      setManagerSuggestions([]);
      setManagerSuggestionsUpdatedAt(null);
      setManagerSuggestionsError(null);
      setManagerSuggestionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setManagerSuggestionsLoading(true);
    setManagerSuggestionsError(null);

    // Send YOUR saved read (friendliness/relationship) for each manager so the scan's
    // accept % uses the exact sliders you set on their card — the same input the
    // Build-a-trade analyzer uses. Only real overrides travel; managers you haven't
    // adjusted fall back to neutral server-side.
    const readsByRoster: Record<number, { friendliness: number; relationship: number }> = {};
    for (const team of partners) {
      const rec = loadTradeTraitsRecord(stored.leagueId, team.rosterId);
      if (rec && rec.mode !== 'default') {
        readsByRoster[team.rosterId] = {
          friendliness: rec.friendliness,
          relationship: rec.relationship,
        };
      }
    }

    fetchTradeSuggestions(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: marketManagerFilter,
      readsByRoster,
    })
      .then((response) => {
        if (cancelled) return;
        if (!response.available) {
          setManagerSuggestionsError(response.reason ?? 'Could not price manager trades right now.');
          setManagerSuggestions([]);
          return;
        }
        setManagerSuggestions(response.suggestions ?? []);
        setManagerSuggestionsUpdatedAt(Date.now());
      })
      .catch(() => {
        if (cancelled) return;
        setManagerSuggestionsError('Could not price manager trades right now.');
      })
      .finally(() => {
        if (!cancelled) setManagerSuggestionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [marketManagerFilter, stored, partners]);

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
    setMarketManagerFilter(partner.rosterId);
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
  const builderIdle = !builderCollapsed && partnerRosterId == null && give.length === 0 && getIds.length === 0;
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

  const loadSuggestedTrade = (suggestion: TradeSuggestion) => {
    const givePlayerIds = suggestion.give.map((asset) => asset.id);
    const getPlayerIds = suggestion.get.map((asset) => asset.id);
    setPartnerRosterId(suggestion.partnerRosterId);
    setGive(givePlayerIds);
    setGetIds(getPlayerIds);
    resetOutputs();
    setParams({
      view: 'deals',
      leagueId: stored.leagueId,
      managerRosterId: String(suggestion.partnerRosterId),
      give: givePlayerIds.join(','),
      get: getPlayerIds.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const dismissLane = (signature: string) => dismiss(signature);

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

  const tradeSideOrEmpty = (label: string, ids: string[]) =>
    ids.length > 0
      ? tradeSideFromIds(label, ids, bootstrap.players)
      : { label, assets: [{ id: `${label}-empty`, name: 'No players selected.', kind: 'text' as const }] };

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
    // Pieces on a board, not a list: group by position so you scan the
    // roster the way you think about it.
    const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const groups = POSITION_ORDER
      .map((position) => ({ position, rows: rows.filter((r) => r.player.position === position) }))
      .filter((group) => group.rows.length > 0);
    const leftover = rows.filter((r) => !POSITION_ORDER.includes(r.player.position));
    if (leftover.length > 0) groups.push({ position: 'Other', rows: leftover });
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
          {groups.map((group) => (
            <div className="trade-cc__pool-group" key={group.position}>
              <p className="trade-cc__pool-divider">{group.position}</p>
              <div className="trade-cc__pool-grid">
                {group.rows.map((row) => (
                  <button
                    aria-pressed={list.includes(row.id)}
                    className={[
                      'trade-cc__pill',
                      list.includes(row.id) ? 'trade-cc__pill--on' : '',
                      row.isStarter ? '' : 'trade-cc__pill--bench',
                    ].join(' ')}
                    disabled={isPricing || counterLoading}
                    key={row.id}
                    onClick={() => toggle(list, set, row.id)}
                    type="button"
                  >
                    <PlayerHeadshot
                      className="trade-cc__pill-headshot"
                      fallbackClassName="trade-cc__pill-headshot-fallback"
                      imageClassName="trade-cc__pill-headshot-image"
                      player={toPlayer(row.id, bootstrap.players)}
                    />
                    <span className="trade-cc__pill-copy">
                      <span className="trade-cc__pill-name">{row.player.name}</span>
                      <span className="trade-cc__pill-pos">
                        {[row.player.position, row.player.team].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span aria-hidden="true" className="trade-cc__pill-add">
                      {list.includes(row.id) ? '✓' : '+'}
                    </span>
                  </button>
                ))}
              </div>
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

  const applyMarketManagerFilter = (rosterId: number) => {
    if (isPricing || counterLoading) return;
    setMarketManagerFilter(rosterId);
    choosePartner(rosterId);
  };

  const marketLoaderLabel = showingManagerMarket
    ? `Simulating trades with ${partners.find((team) => team.rosterId === marketManagerFilter)?.teamName ?? 'this manager'}`
    : 'Simulating trades';

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
            <div className="trade-cc__market-kicker">
              <span className="trade-cc__live-pulse" aria-hidden="true" />
              <p className="trade-cc__kicker">Trade finder</p>
            </div>
            <h2 className="trade-cc__title">Find a trade.</h2>
            <p className="trade-cc__finder-sub">
              Pick a manager. The book finds deals they&apos;d actually take.
            </p>
            <p className="trade-cc__finder-facts">{managerFacts}</p>
            {managerSuggestionsError && showingManagerMarket ? (
              <p className="trade-cc__finder-note">{managerSuggestionsError}</p>
            ) : null}
          </div>
          <button
            aria-expanded={showRead}
            className="trade-cc__partner-read trade-cc__partner-read--inline"
            disabled={marketManagerFilter == null || isPricing || counterLoading}
            onClick={() => setShowRead((current) => !current)}
            type="button"
          >
            {showRead ? 'Hide read' : 'Your read'}
          </button>
        </div>
        <div className="trade-cc__filter-stack">
          <div className="trade-cc__filter-row">
            <span className="trade-cc__filter-label">Managers</span>
            <div className="trade-cc__manager-grid">
              {partners.map((team) => (
                <button
                  aria-pressed={marketManagerFilter === team.rosterId}
                  className={[
                    'trade-cc__manager-card',
                    marketManagerFilter === team.rosterId ? 'trade-cc__manager-card--active' : '',
                  ].filter(Boolean).join(' ')}
                  key={`market-manager-${team.rosterId}`}
                  onClick={() => applyMarketManagerFilter(team.rosterId)}
                  type="button"
                >
                  <span className="trade-cc__manager-card-top">
                    {renderTeamAvatar(team)}
                    <span className="trade-cc__manager-card-copy">
                      <span className="trade-cc__manager-card-name" title={team.teamName}>
                        {team.teamName}
                      </span>
                      <span className="trade-cc__manager-card-meta">{recordText(team.record)}</span>
                    </span>
                  </span>
                  <span className="trade-cc__manager-card-bottom">
                    <span className="trade-cc__manager-card-stat-label">
                      <span className="trade-cc__manager-card-stat-default">Title price</span>
                      <span aria-hidden="true" className="trade-cc__manager-card-cta">Find trades ▸</span>
                    </span>
                    <strong className="trade-cc__manager-card-stat-value">
                      {futuresByRoster.get(team.rosterId)?.championOdds != null
                        ? formatAmericanOdds(futuresByRoster.get(team.rosterId)!.championOdds)
                        : 'Off board'}
                    </strong>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="trade-cc__filter-row">
            <span className="trade-cc__filter-label">Position</span>
            <div className="trade-cc__filter-chips">
              {(['all', 'QB', 'RB', 'WR', 'TE'] as const).map((position) => (
                <button
                  aria-pressed={marketPositionFilter === position}
                  className={[
                    'trade-cc__filter-chip',
                    marketPositionFilter === position ? 'trade-cc__filter-chip--active' : '',
                  ].filter(Boolean).join(' ')}
                  key={`market-position-${position}`}
                  onClick={() => setMarketPositionFilter(position)}
                  type="button"
                >
                  {position === 'all' ? 'All' : position}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showRead && selectedPartner && marketManagerFilter != null ? (
          <ManagerReadCard
            friendliness={friendliness}
            leagueId={stored.leagueId}
            name={selectedPartner.teamName}
            onChange={updateRead}
            onReset={resetRead}
            relationship={relationship}
            scoutingOn={scoutingAffectsAcceptance}
            source={readSource}
            sourceLabel={readSourceLabel}
            suggestedRead={suggestedRead}
            suggestedReason={suggestedReadReason}
            suggestedReceipt={{
              friendliness: scoutingFile?.readDefaults.friendlinessReceipt ?? `data suggests ${suggestedRead.friendliness}`,
              relationship: scoutingFile?.readDefaults.relationshipReceipt ?? `data suggests ${suggestedRead.relationship}`,
            }}
          />
        ) : null}

        {managerSuggestionsLoading && visibleMarketCount > 0 ? (
          <div className="trade-cc__finder-loader-inline">
            <SimulationLoader label={marketLoaderLabel} size="compact" variant="trade" />
          </div>
        ) : null}

        {visibleMarketCount > 0 ? (
          <>
            <div
              className={[
                'trade-cc__market-grid',
                managerSuggestionsLoading && showingManagerMarket ? 'trade-cc__market-grid--stale' : '',
              ].filter(Boolean).join(' ')}
            >
              {visibleManagerSuggestions.map((entry) => {
                const getPlayerIds = entry.suggestion.get.map((asset) => asset.id);
                const givePlayerIds = entry.suggestion.give.map((asset) => asset.id);
                const partner = partners.find((team) => team.rosterId === entry.suggestion.partnerRosterId);
                const acceptanceRead = acceptanceGaugeLabel(entry.acceptanceProbability);
                return (
                  <TradeCard
                    acceptanceLabel={acceptanceRead}
                    acceptanceProbability={entry.acceptanceProbability}
                    dismissLabel="Dismiss this suggested trade"
                    generatedAt={formatGeneratedAt(managerSuggestionsUpdatedAt ?? undefined)}
                    getSide={tradeSideFromIds('You get', getPlayerIds, bootstrap.players)}
                    impactRows={[
                      {
                        label: 'Your title',
                        value: signedPct(entry.suggestion.youDelta),
                        tone: deltaTone(entry.suggestion.youDelta),
                        emphasis: 'primary',
                      },
                      {
                        label: 'them',
                        value: signedPct(entry.suggestion.partnerDelta),
                        tone: deltaTone(entry.suggestion.partnerDelta),
                        emphasis: 'secondary',
                      },
                    ]}
                    key={entry.signature}
                    onClick={() => loadSuggestedTrade(entry.suggestion)}
                    onDismiss={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dismissLane(entry.signature);
                    }}
                    partnerLine={partner?.teamName ?? entry.suggestion.partnerName}
                    sendSide={tradeSideFromIds('You send', givePlayerIds, bootstrap.players)}
                  />
                );
              })}
            </div>
            {hiddenMarketCount > 0 ? (
              <button
                className="trade-cc__show-more"
                onClick={() => setShowAllMarketCards(true)}
                type="button"
              >
                Show {hiddenMarketCount} more
              </button>
            ) : null}
          </>
        ) : managerSuggestionsLoading && showingManagerMarket ? (
          <SimulationLoader label={marketLoaderLabel} variant="trade" />
        ) : (
          <p className="trade-cc__empty-lane">
            {showingManagerMarket
              ? `The book found no deals with ${selectedPartner?.teamName ?? 'this manager'} this week.`
              : 'Pick a manager above to see the book\'s deals.'}
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
          builderIdle ? 'trade-cc__builder--idle' : '',
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
              <TradeSide dense side={tradeSideOrEmpty('You send', give)} tone="send" />
              <span className="trade-cc__deal-strip-arrow" aria-hidden="true">⇄</span>
              <TradeSide dense side={tradeSideOrEmpty('You get', getIds)} tone="get" />
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

        <div
          className={[
            'trade-cc__columns',
            builderIdle ? 'trade-cc__columns--idle' : '',
          ].filter(Boolean).join(' ')}
        >
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

          <div
            className={[
              'trade-cc__side',
              'trade-cc__side--partner',
              partnerRosterId == null ? 'trade-cc__side--idle' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="trade-cc__side-head">
              <div>
                <p className="trade-cc__column-label">Their side</p>
                <h3 className="trade-cc__side-title">You get</h3>
              </div>
              <div className="trade-cc__partner-tools">
                {renderPartnerSelector()}
                {partnerRosterId != null && !showingManagerMarket ? (
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
            {partnerRosterId != null && showRead && !showingManagerMarket ? (
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
              <div className="trade-cc__partner-empty">
                <p className="trade-cc__hint">Pick a manager to open the other side of the market.</p>
                <p className="trade-cc__partner-empty-note">
                  The builder stays quiet until you choose who you want to price.
                </p>
              </div>
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
                your championship <span className={signedDeltaClass(analysis.you.delta.titleProb)}>{signedPct(analysis.you.delta.titleProb)}</span>
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
                    <TradeSide
                      dense
                      side={tradeSideOrEmpty('Add', counter.add.map((add) => add.id))}
                      tone={counter.whoAdds === 'you' ? 'send' : 'get'}
                    />
                    <p className="trade-cc__counter-body">
                      {counter.whoAdds === 'you'
                        ? `Add ${counter.add.map((a) => a.name).join(' + ')} to your side to even it out.`
                        : `Ask ${analysis.partner.teamName} to add ${counter.add.map((a) => a.name).join(' + ')} to even it out.`}
                    </p>
                    {counter.before && counter.after ? (
                      <div className="trade-cc__counter-deltas">
                        <span>
                          You <b className={signedDeltaClass(counter.before.youDelta)}>{signedPct(counter.before.youDelta)}</b>{' '}
                          to <b className={signedDeltaClass(counter.after.youDelta)}>{signedPct(counter.after.youDelta)}</b>
                        </span>
                        <span>
                          Them <b className={signedDeltaClass(counter.before.partnerDelta)}>{signedPct(counter.before.partnerDelta)}</b>{' '}
                          to <b className={signedDeltaClass(counter.after.partnerDelta)}>{signedPct(counter.after.partnerDelta)}</b>
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

  // Scouting no longer exists as a page; old /market?view=scouting links land on Deals.
  useEffect(() => {
    if (params.get('view') != null) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete('view');
      setParams(nextParams, { replace: true });
    }
  }, [params, setParams]);

  return (
    <div className="market-page">
      <h1 className="visually-hidden">Market</h1>
      <TradeDealsView />
    </div>
  );
}
