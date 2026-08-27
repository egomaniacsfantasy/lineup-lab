import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { resolveApiUrl } from '../services/apiBase.ts';
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
import { tradeSignature } from '../utils/tradeMarket';
import {
  acceptanceGaugeLabel,
  sortByTradeFairness,
  tradeFairnessScore,
} from '../utils/tradeSuggestionDisplay';
import { formatAcceptancePercent, getAcceptanceLingo } from '../utils/acceptanceLingo';
import { acceptanceProbability } from '../utils/tradeAcceptance';
import { signedDeltaClass } from '../utils/deltaTone';
import { analysisVerdict, deltaTone, signedPct, tradeCardHeadline } from '../utils/tradeVerdict';
import { formatAmericanOdds } from '../utils/formatOdds';
import {
  useDynastyTradesExperimental,
  useScoutingAffectsAcceptance,
} from '../hooks/useLabsFlags';
import type { ManagerFile } from '../services/managerFiles';
import { compileManagerFile } from '../services/managerFiles';
import {
  resolveTradeTraits,
  NEUTRAL_READ,
} from '../utils/tradeTraits';
import {
  tradeSideFromIds,
} from '../utils/tradeDisplay';
import './TradePage.css';
import { PreDraftHub } from '../components/matchup/PreDraftHub';
import { isLeaguePreDraft } from '../utils/preDraft';
import { officialLeagueUrl } from '../utils/officialLeagueUrl';
import { drawTradeCard, type TradeCardProposal, type TradeCardAsset } from '../utils/tradeCard';
import { shareFilename, tradeShareMessage } from '../utils/shareMessage';
import { ShareCardPreview } from '../components/matchup/ShareCardPreview';
import { LeagueDealBoard, type LeagueDealRow } from '../components/trade/LeagueDealBoard';
import { acceptableDeals } from '../utils/dealBoardPolicy';

type MarketPositionFilter = 'all' | 'QB' | 'RB' | 'WR' | 'TE';

function normalizeMarketPosition(value: string | null | undefined): Exclude<MarketPositionFilter, 'all'> | null {
  const upper = value?.toUpperCase();
  if (upper === 'QB' || upper === 'RB' || upper === 'WR' || upper === 'TE') return upper;
  return null;
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

type MarketView = 'finder' | 'build';

/* Three tabs was a phone compromise: the finder and the manager picker were
   split because neither fitted beside the other in 402px. On a desktop they
   are the same job — the finder searches the whole league, and picking a
   manager narrows the same search. */
const MARKET_VIEWS: { id: MarketView; label: string }[] = [
  { id: 'finder', label: 'Trade finder' },
  { id: 'build', label: 'Build trades' },
];

function recordText(record: { wins: number; losses: number; ties?: number }) {
  return record.ties ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

const NEUTRAL_TRADE_TRAITS: TradeTraits = {
  toughness: 5,
  dealAppetite: 5,
  fandomTeam: null,
  fandomLevel: 5,
};

const MAX_VISIBLE_MARKET_CARDS = 15;

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
  const [scoutingFile, setScoutingFile] = useState<ManagerFile | null>(null);
  const [marketManagerFilter, setMarketManagerFilter] = useState<number | null>(null);
  const deepLinkAppliedRef = useRef(false);

  /* Deep link from the hub: /market?manager=3 opens that manager's deals
     instead of the empty picker. It sets the builder partner as well as the
     filter, the way applyMarketManagerFilter does, because the deals heading
     names the partner and read "this manager" when only the filter was set.
     This has to live above the component's early return: putting it next to
     that handler changed hook order between renders and blanked the page. */
  useEffect(() => {
    if (deepLinkAppliedRef.current || partners.length === 0) return;
    const raw = params.get('manager');
    const rosterId = raw != null ? Number(raw) : Number.NaN;
    if (!Number.isFinite(rosterId) || !partners.some((team) => team.rosterId === rosterId)) {
      deepLinkAppliedRef.current = true;
      return;
    }
    deepLinkAppliedRef.current = true;
    setMarketManagerFilter(rosterId);
    setPartnerRosterId(rosterId);
  }, [params, partners]);
  /* Deal-first. The tab opened on an instruction ("Pick a manager and the book
     builds the deals...") above a nine-tile grid, so the first screen of a
     trade finder contained no trades. The book already prices deals across the
     whole league on every repricing — those are what you came for, so they
     lead, and picking a manager becomes the second question rather than the
     toll gate. */
  const [marketView, setMarketView] = useState<MarketView>('finder');
  /* A proposal is an argument you make to another manager, so it has to be
     able to leave the app as a picture. */
  const [tradeCard, setTradeCard] = useState<TradeCardProposal | null>(null);
  /* The league-wide board is its own question with its own answer, so it gets
     its own request rather than sharing the manager pipeline. Sharing them is
     what made a league-wide scan run and then filter every result away for not
     belonging to a manager nobody had picked. */
  const [leagueDeals, setLeagueDeals] = useState<TradeSuggestion[] | null>(null);

  useEffect(() => {
    if (!stored?.leagueId || !stored.userId || !bootstrap) return undefined;
    const key = `og.leagueDeals.${stored.leagueId}:${stored.userId}`;
    const DEALS_TTL_MS = 120_000;
    // Use a RECENT cached scan as-is: the league-wide scan is heavy, and re-running it
    // on every mount/navigation lagged the page and interrupted itself (returning only
    // a couple of trades). Only refetch when the cache is stale, so the numbers stay
    // fresh without constant re-simulation.
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const data = Array.isArray(parsed) ? parsed : parsed?.data;
        const at = Array.isArray(parsed) ? 0 : parsed?.at ?? 0;
        if (Array.isArray(data)) {
          setLeagueDeals(data as TradeSuggestion[]);
          if (Date.now() - at < DEALS_TTL_MS) return undefined;
        }
      }
    } catch {
      // storage unavailable; the scan just runs
    }
    let cancelled = false;
    void fetchTradeSuggestions(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: null,
    })
      .then((response) => {
        if (cancelled) return;
        const found = response.available ? response.suggestions ?? [] : [];
        setLeagueDeals(found);
        try {
          window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: found }));
        } catch {
          // ignore
        }
      })
      .catch(() => {
        if (!cancelled) setLeagueDeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stored?.leagueId, stored?.userId, bootstrap]);

  const [marketPositionFilter, setMarketPositionFilter] = useState<MarketPositionFilter>('all');
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
  const [leagueScanLine, setLeagueScanLine] = useState(0);
  useEffect(() => {
    if (leagueDeals !== null) return undefined;
    const timer = window.setInterval(() => setLeagueScanLine((n) => n + 1), 2600);
    return () => window.clearInterval(timer);
  }, [leagueDeals]);

  /* One place that turns a suggestion into a card, so the league board and the
     manager list cannot drift into describing the same deal differently. */
  const shareSuggestion = (suggestion: TradeSuggestion) => {
    if (!bootstrap) return;
    const partner = bootstrap.teams.find(
      (team) => team.rosterId === suggestion.partnerRosterId,
    );
    const asset = (id: string): TradeCardAsset => {
      const player = toPlayer(id, bootstrap.players);
      return {
        name: player.name,
        position: player.position,
        team: player.team,
        headshotUrl: resolveApiUrl(player.headshotUrl) ?? null,
      };
    };
    /* Each column shows what that manager RECEIVES, so the sides cross: you
       get what he gives up. Acceptance is deliberately absent; it is a private
       read and this card is the thing you hand him. */
    setTradeCard({
      eyebrow: `Week ${bootstrap.week}`,
      leagueName: stored?.leagueName ?? null,
      verdict: tradeCardHeadline(suggestion.youDelta, suggestion.partnerDelta),
      you: {
        manager: userTeam?.teamName ?? 'You',
        avatar: resolveApiUrl(userTeam?.avatarUrl) ?? null,
        assets: suggestion.get.map((a) => asset(a.id)),
        titleDelta: signedPct(suggestion.youDelta),
        playoffDelta: signedPct(suggestion.youPlayoffDelta ?? 0),
        titleUp: suggestion.youDelta >= 0,
        playoffUp: (suggestion.youPlayoffDelta ?? 0) >= 0,
      },
      them: {
        manager: partner?.teamName ?? 'Them',
        avatar: resolveApiUrl(partner?.avatarUrl) ?? null,
        assets: suggestion.give.map((a) => asset(a.id)),
        titleDelta: signedPct(suggestion.partnerDelta),
        playoffDelta: signedPct(suggestion.partnerPlayoffDelta ?? 0),
        titleUp: suggestion.partnerDelta >= 0,
        playoffUp: (suggestion.partnerPlayoffDelta ?? 0) >= 0,
      },
    });
  };

  const leagueDealRows = useMemo<LeagueDealRow[] | null>(() => {
    if (!bootstrap || leagueDeals === null) return null;
    /* Fairest first: the trades that move BOTH teams' championship odds the least
       (|youDelta| + |partnerDelta|). Identical ranking to the Hub deals section;
       acceptance probability is no longer part of the value. The server already
       guarantees youDelta > 0, so every shown deal still nudges your title up.
       Acceptance % is still displayed as context, just not used to rank. */
    /* Filter, then sort. The board only ever sorted, so the fifteen
       least-bad ideas carried the heading "best deals" however bad they were.
       See dealBoardPolicy: a quarterback straight across for a skill player
       in a one-quarterback league, and any deal where one side takes nearly
       all of the value, are not deals this heading can honestly make. */
    const { kept } = acceptableDeals(
      leagueDeals,
      (playerId) => bootstrap.players[playerId]?.position ?? null,
      bootstrap.league.rosterPositions,
    );

    return sortByTradeFairness(kept)
      .slice(0, 15)
      .map((suggestion) => {
        const accept = acceptanceProbability(suggestion.partnerDelta, 5, 5);
        return {
        key: tradeSignature({
          leagueId: stored?.leagueId ?? '',
          partnerRosterId: suggestion.partnerRosterId,
          givePlayerIds: suggestion.give.map((asset) => asset.id),
          getPlayerIds: suggestion.get.map((asset) => asset.id),
        }),
        partnerName:
          bootstrap.teams.find((team) => team.rosterId === suggestion.partnerRosterId)?.teamName
          ?? 'A manager',
        send: suggestion.give.map((asset) => toPlayer(asset.id, bootstrap.players)),
        get: suggestion.get.map((asset) => toPlayer(asset.id, bootstrap.players)),
        delta: signedPct(suggestion.youDelta),
        up: suggestion.youDelta >= 0,
        acceptance: formatAcceptancePercent(accept),
        };
      });
  }, [bootstrap, leagueDeals, stored?.leagueId]);

  const leagueDealByKey = useMemo(() => {
    const map = new Map<string, TradeSuggestion>();
    if (!stored) return map;
    for (const suggestion of leagueDeals ?? []) {
      map.set(
        tradeSignature({
          leagueId: stored.leagueId,
          partnerRosterId: suggestion.partnerRosterId,
          givePlayerIds: suggestion.give.map((asset) => asset.id),
          getPlayerIds: suggestion.get.map((asset) => asset.id),
        }),
        suggestion,
      );
    }
    return map;
  }, [leagueDeals, stored]);

  const managerSuggestionEntries = useMemo(() => {
    if (!stored || !bootstrap || marketManagerFilter == null) return [];

    // Clicking a manager just FILTERS the one league-wide pool (leagueDeals) to that
    // manager -- the exact same trades and numbers as the "best deals" board. There is
    // no separate per-manager scan, so the two can never disagree, and a manager the
    // board shows a trade with is never empty here. (Only the user's own position
    // filter and dismissals still narrow it.)
    const entries = (leagueDeals ?? [])
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
      }));

    const positionFiltered = entries.filter(
      (entry) => marketPositionFilter === 'all' || entry.position === marketPositionFilter,
    );
    const ranked = [...positionFiltered].sort(
      (a, b) => tradeFairnessScore(a.suggestion) - tradeFairnessScore(b.suggestion),
    );
    return ranked.filter((entry) => !dismissedSignatures.has(entry.signature));
  }, [
    bootstrap,
    dismissedSignatures,
    friendliness,
    leagueDeals,
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

  useEffect(() => {
    setShowAllMarketCards(false);
  }, [marketManagerFilter, marketPositionFilter]);

  useEffect(() => {
    // Per-manager trades come from the already-fetched league pool (leagueDeals); there
    // is no separate per-manager scan, so nothing to fetch or fail here. "Loading" just
    // tracks whether that pool has arrived.
    setManagerSuggestionsError(null);
    setManagerSuggestionsLoading(marketManagerFilter != null && leagueDeals === null);
    setManagerSuggestionsUpdatedAt(leagueDeals !== null ? Date.now() : null);
  }, [marketManagerFilter, leagueDeals]);

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
    /* A deal arriving with both sides is a built trade, so land on the builder
       rather than dropping the user on the finder with an invisible builder
       already filled in behind it. */
    if (nextGive.length > 0 && nextGet.length > 0) setMarketView('build');
    resetOutputs();
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }, [bootstrap, params, stored]);

  useEffect(() => {
    if (!stored || !selectedPartner) {
      setScoutingFile(null);
      setSuggestedRead(NEUTRAL_READ);
      return;
    }
    if (stored.provider !== 'sleeper' || !selectedPartner.ownerId) {
      setScoutingFile(null);
      setSuggestedRead(NEUTRAL_READ);
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
      })
      .catch(() => {
        if (cancelled) return;
        setScoutingFile(null);
        setSuggestedRead(NEUTRAL_READ);
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
  }, [partnerRosterId, scoutingAffectsAcceptance, scoutingFile, stored, suggestedRead]);



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

  const applyMarketManagerFilter = (rosterId: number | null) => {
    if (isPricing || counterLoading) return;
    setMarketManagerFilter(rosterId);
    if (rosterId != null) choosePartner(rosterId);
  };


  const marketLoaderLabel = showingManagerMarket
    ? `Simulating trades with ${partners.find((team) => team.rosterId === marketManagerFilter)?.teamName ?? 'this manager'}`
    : 'Simulating trades';

  const renderTeamAvatar = (team: NonNullable<typeof selectedPartner>) => (
    <span className="trade-cc__team-avatar" aria-hidden="true">
      {team.avatarUrl ? (
        <img alt="" src={resolveApiUrl(team.avatarUrl) ?? undefined} />
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

      {tradeCard ? (
        <ShareCardPreview
          draw={(options) => drawTradeCard(tradeCard, options)}
          filename={shareFilename(tradeCard.you.manager, bootstrap?.week, 'trade')}
          message={tradeShareMessage({
            you: tradeCard.you.manager,
            them: tradeCard.them.manager,
            youGet: tradeCard.you.assets.map((a) => a.name),
            theyGet: tradeCard.them.assets.map((a) => a.name),
            verdict: tradeCard.verdict,
            yourTitleDelta: tradeCard.you.titleDelta,
            theirTitleDelta: tradeCard.them.titleDelta,
            bothGain: tradeCard.you.titleUp && tradeCard.them.titleUp,
          })}
          onClose={() => setTradeCard(null)}
        />
      ) : null}

      {/* Three questions, in the order people actually ask them: what has the
          book got, who would say yes, and what if I build my own. */}
      <div className="trade-cc__views" role="tablist" aria-label="Trade views">
        {MARKET_VIEWS.map((view) => (
          <button
            aria-selected={marketView === view.id}
            className={[
              'trade-cc__view',
              marketView === view.id ? 'trade-cc__view--active' : '',
            ].filter(Boolean).join(' ')}
            key={view.id}
            onClick={() => setMarketView(view.id)}
            role="tab"
            type="button"
          >
            {view.label}
            {view.id === 'finder' && visibleMarketCount > 0 ? (
              <span className="trade-cc__view-count">{visibleMarketCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <section
        className={[
          'trade-cc__finder',
          marketView === 'finder' ? '' : 'trade-cc__finder--hidden',
        ].filter(Boolean).join(' ')}
      >
        <LeagueDealBoard
          loading={leagueDeals === null}
          onOpen={(key) => {
            const found = leagueDealByKey.get(key);
            if (found) loadSuggestedTrade(found);
          }}
          onShare={(key) => {
            const found = leagueDealByKey.get(key);
            if (found) shareSuggestion(found);
          }}
          rows={leagueDealRows}
          scanLine={leagueScanLine}
        />

        {/* The read is about a specific manager, so it appears once there is
            one. Rendering it disabled above an empty heading left a dead row
            at the top of the view where the title used to be. */}
        {managerSuggestionsError && showingManagerMarket ? (
          <p className="trade-cc__finder-note">{managerSuggestionsError}</p>
        ) : null}
        <div className="trade-cc__filter-stack">
          <div className="trade-cc__filter-row">
            <span className="trade-cc__filter-label">
              {marketManagerFilter == null
                ? 'Tap a manager to see the best deals with them'
                : 'Manager'}
            </span>
            {/* League sizes run 4 to 20, so density follows the number of
                partners as well as the viewport: few managers get roomy
                rows, a 20-team league packs tighter so the board never
                pushes the builder off the page. */}
            {selectedPartner && marketManagerFilter != null ? (
              /* Once a manager is chosen the other eight are noise, and leaving
                 them on screen pushed the deals they load a full screen down —
                 you had to scroll to find out anything had happened at all. */
              <div className="trade-cc__manager-chosen">
                <span className="trade-cc__manager-chosen-id">
                  {renderTeamAvatar(selectedPartner)}
                  <span className="trade-cc__manager-chosen-copy">
                    <span className="trade-cc__manager-chosen-name">{selectedPartner.teamName}</span>
                    <span className="trade-cc__manager-chosen-meta">
                      {recordText(selectedPartner.record)}
                      {futuresByRoster.get(selectedPartner.rosterId)?.championOdds != null
                        ? ` · title ${formatAmericanOdds(futuresByRoster.get(selectedPartner.rosterId)!.championOdds)}`
                        : ''}
                    </span>
                  </span>
                </span>
                <button
                  className="trade-cc__manager-change"
                  onClick={() => applyMarketManagerFilter(null)}
                  type="button"
                >
                  Change
                </button>
              </div>
            ) : (
            <div
              className={[
                'trade-cc__manager-grid',
                partners.length <= 6 ? 'trade-cc__manager-grid--roomy' : '',
                partners.length >= 13 ? 'trade-cc__manager-grid--dense' : '',
              ].filter(Boolean).join(' ')}
            >
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
                  <span className="trade-cc__manager-card-id">
                    {renderTeamAvatar(team)}
                    <span className="trade-cc__manager-card-copy">
                      <span className="trade-cc__manager-card-name" title={team.teamName}>
                        {team.teamName}
                      </span>
                      <span className="trade-cc__manager-card-meta">{recordText(team.record)}</span>
                    </span>
                  </span>
                  <span className="trade-cc__manager-card-price">
                    <span className="trade-cc__manager-card-stat-label">Title</span>
                    <strong className="trade-cc__manager-card-stat-value">
                      {futuresByRoster.get(team.rosterId)?.championOdds != null
                        ? formatAmericanOdds(futuresByRoster.get(team.rosterId)!.championOdds)
                        : 'Off board'}
                    </strong>
                    <span aria-hidden="true" className="trade-cc__manager-card-cta">Find trades ▸</span>
                  </span>
                </button>
              ))}
            </div>
            )}
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



        {managerSuggestionsLoading && visibleMarketCount > 0 ? (
          <div className="trade-cc__finder-loader-inline">
            <SimulationLoader label={marketLoaderLabel} size="compact" variant="trade" />
          </div>
        ) : null}
        {managerSuggestionsLoading ? (
          <p className="trade-cc__empty-note">
            Simulating every deal worth making with them. You can leave and come
            back. The result is held for five minutes.
          </p>
        ) : null}

        {visibleMarketCount > 0 ? (
          <>
            {/* The manager and the scan time are the same on every card, so
                they belong here once rather than on each result. */}
            <div className="trade-cc__market-results-head">
              <span className="trade-cc__market-results-title">
                Deals with {selectedPartner?.teamName ?? 'this manager'}
              </span>
              {formatGeneratedAt(managerSuggestionsUpdatedAt ?? undefined) ? (
                <span className="trade-cc__market-results-meta">
                  scanned {formatGeneratedAt(managerSuggestionsUpdatedAt ?? undefined)}
                </span>
              ) : null}
            </div>
            <div
              className={[
                'trade-cc__market-grid',
                managerSuggestionsLoading && showingManagerMarket ? 'trade-cc__market-grid--stale' : '',
              ].filter(Boolean).join(' ')}
            >
              {visibleManagerSuggestions.map((entry) => {
                const getPlayerIds = entry.suggestion.get.map((asset) => asset.id);
                const givePlayerIds = entry.suggestion.give.map((asset) => asset.id);
                const acceptanceRead = acceptanceGaugeLabel(entry.acceptanceProbability);
                /* Same mapping the analyzer already applies to a title delta,
                   so a suggested deal and a built one are graded alike. */
                const suggestionVerdict = analysisVerdict(entry.suggestion.youDelta);
                return (
                  <TradeCard
                    acceptanceBand={getAcceptanceLingo(entry.acceptanceProbability)?.label ?? null}
                    acceptanceLabel={acceptanceRead}
                    acceptanceProbability={entry.acceptanceProbability}
                    acceptanceValue={formatAcceptancePercent(entry.acceptanceProbability)}
                    verdictLabel={suggestionVerdict.label}
                    verdictTone={suggestionVerdict.tone as 'good' | 'neutral' | 'bad'}
                    dismissLabel="Dismiss this suggested trade"
                    getSide={tradeSideFromIds('You get', getPlayerIds, bootstrap.players)}
                    impactRows={[
                      /* Your title change is what the card is for, so it
                         leads. Playoffs and this week support it at one shared
                         smaller size, and each partner value rides on its own
                         metric's row instead of taking a row of its own. Same
                         six served numbers, three rows. */
                      {
                        label: 'Your title',
                        value: signedPct(entry.suggestion.youDelta),
                        tone: deltaTone(entry.suggestion.youDelta),
                        emphasis: 'lead',
                        mirror: {
                          label: 'them',
                          value: signedPct(entry.suggestion.partnerDelta),
                          tone: deltaTone(entry.suggestion.partnerDelta),
                        },
                      },
                      ...(entry.suggestion.youPlayoffDelta != null
                        ? [
                            {
                              label: 'Playoffs',
                              value: signedPct(entry.suggestion.youPlayoffDelta),
                              tone: deltaTone(entry.suggestion.youPlayoffDelta),
                              emphasis: 'primary' as const,
                              mirror: {
                                label: 'them',
                                value: signedPct(entry.suggestion.partnerPlayoffDelta ?? 0),
                                tone: deltaTone(entry.suggestion.partnerPlayoffDelta ?? 0),
                              },
                            },
                          ]
                        : []),
                      ...(entry.suggestion.youWeekDelta != null
                        ? [
                            {
                              label: 'This week',
                              value: signedPct(entry.suggestion.youWeekDelta),
                              tone: deltaTone(entry.suggestion.youWeekDelta),
                              emphasis: 'primary' as const,
                              mirror: {
                                label: 'them',
                                value: signedPct(entry.suggestion.partnerWeekDelta ?? 0),
                                tone: deltaTone(entry.suggestion.partnerWeekDelta ?? 0),
                              },
                            },
                          ]
                        : []),
                    ]}
                    key={entry.signature}
                    onShare={() => {
                      const partner = partners.find(
                        (team) => team.rosterId === entry.suggestion.partnerRosterId,
                      );
                      const asset = (id: string): TradeCardAsset => {
                        const player = toPlayer(id, bootstrap.players);
                        return {
                          name: player.name,
                          position: player.position,
                          team: player.team,
                          headshotUrl: resolveApiUrl(player.headshotUrl) ?? null,
                        };
                      };
                      setTradeCard({
                        eyebrow: `Week ${bootstrap.week}`,
                        leagueName: stored?.leagueName ?? null,
                        verdict: tradeCardHeadline(
                          entry.suggestion.youDelta,
                          entry.suggestion.partnerDelta,
                        ),
                        you: {
                          manager: userTeam?.teamName ?? 'You',
                          avatar: resolveApiUrl(userTeam?.avatarUrl) ?? null,
                          assets: getPlayerIds.map(asset),
                          titleDelta: signedPct(entry.suggestion.youDelta),
                          playoffDelta: signedPct(entry.suggestion.youPlayoffDelta ?? 0),
                          titleUp: entry.suggestion.youDelta >= 0,
                          playoffUp: (entry.suggestion.youPlayoffDelta ?? 0) >= 0,
                        },
                        them: {
                          manager: partner?.teamName ?? 'Them',
                          avatar: resolveApiUrl(partner?.avatarUrl) ?? null,
                          assets: givePlayerIds.map(asset),
                          titleDelta: signedPct(entry.suggestion.partnerDelta),
                          playoffDelta: signedPct(entry.suggestion.partnerPlayoffDelta ?? 0),
                          titleUp: entry.suggestion.partnerDelta >= 0,
                          playoffUp: (entry.suggestion.partnerPlayoffDelta ?? 0) >= 0,
                        },
                      });
                    }}
                    onClick={() => loadSuggestedTrade(entry.suggestion)}
                    onDismiss={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dismissLane(entry.signature);
                    }}
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
          marketView === 'build' ? '' : 'trade-cc__builder--hidden',
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
              <span className="trade-cc__deal-strip-arrow" aria-hidden="true">
                <span className="trade-display__eyebrow trade-cc__deal-strip-arrow-spacer">&nbsp;</span>
                <span className="trade-cc__deal-strip-arrow-glyph">⇄</span>
              </span>
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
              </div>
            </div>

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

          {/* Scouting-affects-acceptance is hidden with the personas it
              belongs to. The preference still exists and still applies; it
              just is not a switch on the trade screen any more. */}

          <TradeAnalyzerPanel
            analysis={analysis}
            analyzing={analyzing}
            error={analysisError}
            friendliness={friendliness}
            relationship={relationship}
            showVerdict={false}
          />

          {/* The card was only reachable from the finder, which is the half of
              the tab where the deal is not yours. A trade you built by hand is
              exactly the one you want to send someone. */}
          {analysis?.available && analysis.you && analysis.partner
            && give.length > 0 && getIds.length > 0 ? (
            <button
              className="trade-cc__share"
              onClick={() => {
                const you = analysis.you;
                const them = analysis.partner;
                if (!bootstrap || !you || !them) return;
                const partner = bootstrap.teams.find(
                  (team) => team.rosterId === partnerRosterId,
                );
                const userTeam = bootstrap.teams.find((team) => team.isUser);
                const asset = (id: string): TradeCardAsset => {
                  const player = toPlayer(id, bootstrap.players);
                  return {
                    name: player.name,
                    position: player.position,
                    team: player.team,
                    headshotUrl: resolveApiUrl(player.headshotUrl) ?? null,
                  };
                };
                setTradeCard({
                  eyebrow: `Week ${bootstrap.week}`,
                  leagueName: stored?.leagueName ?? null,
                  verdict: tradeCardHeadline(you.delta.titleProb, them.delta.titleProb),
                  you: {
                    manager: userTeam?.teamName ?? 'You',
                    avatar: resolveApiUrl(userTeam?.avatarUrl) ?? null,
                    assets: getIds.map(asset),
                    titleDelta: signedPct(you.delta.titleProb),
                    playoffDelta: signedPct(you.delta.playoffProb),
                    titleUp: you.delta.titleProb >= 0,
                    playoffUp: you.delta.playoffProb >= 0,
                  },
                  them: {
                    manager: partner?.teamName ?? 'Them',
                    avatar: resolveApiUrl(partner?.avatarUrl) ?? null,
                    assets: give.map(asset),
                    titleDelta: signedPct(them.delta.titleProb),
                    playoffDelta: signedPct(them.delta.playoffProb),
                    titleUp: them.delta.titleProb >= 0,
                    playoffUp: them.delta.playoffProb >= 0,
                  },
                });
              }}
              type="button"
            >
              Share this trade
            </button>
          ) : null}
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
  const { stored, bootstrap } = useLeagueConnection();

  // Scouting no longer exists as a page; old /market?view=scouting links land on Deals.
  useEffect(() => {
    if (params.get('view') != null) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete('view');
      setParams(nextParams, { replace: true });
    }
  }, [params, setParams]);

  /* Nobody owns a player before a draft, so the finder was offering twelve
     undrafted teams as trade partners and pricing a title for each of them. */
  if (stored && bootstrap && isLeaguePreDraft(bootstrap)) {
    return (
      <PreDraftHub
        bootstrap={bootstrap}
        officialUrl={officialLeagueUrl(stored)}
        provider={stored.provider}
        scope="trades"
      />
    );
  }

  return (
    <div className="market-page">
      <h1 className="visually-hidden">Market</h1>
      <TradeDealsView />
    </div>
  );
}
