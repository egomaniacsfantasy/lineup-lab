import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { resolveApiUrl } from '../services/apiBase.ts';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeSide } from '../components/trade-display/TradeDisplay';
import { SimulationLoader } from '../components/ui/SimulationLoader';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { TradeFinder } from '../components/trade/TradeFinder';
import '../components/trade/TradeAnalyzerPanel.css';
import '../components/trade-display/TradeDisplay.css';
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
  type TradeSuggestion,
  type TradeTraits,
} from '../services/leagueApi';
import { TradeAnalyzerPanel } from '../components/trade/TradeAnalyzerPanel';
import type { LeagueBootstrap } from '../services/leagueApi';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import { signedDeltaClass } from '../utils/deltaTone';
import { analysisVerdict, signedPct, tradeCardHeadline } from '../utils/tradeVerdict';
import { tradesSupported } from '../utils/leagueCapabilities';
import { useScoutingAffectsAcceptance } from '../hooks/useLabsFlags';
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TM';
}

type MarketView = 'finder' | 'build';

/* The finder is a ticket (TradeFinder): who with, what you send, what you
   get, and the shape. The builder beside it is the same trade with every leg
   exact. A found deal opens in the builder already filled in. */
const MARKET_VIEWS: { id: MarketView; label: string }[] = [
  { id: 'finder', label: 'Trade finder' },
  { id: 'build', label: 'Build trades' },
];

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
  /* The pricing call's own failure. It used to be discarded, which is most of
     why a broken trade looked like a button that did nothing. */
  const [priceError, setPriceError] = useState<string | null>(null);
  const [counter, setCounter] = useState<TradeCounter | null>(null);
  const [counterLoading, setCounterLoading] = useState(false);
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');
  const [friendliness, setFriendliness] = useState(5);
  const [relationship, setRelationship] = useState(5);
  const [suggestedRead, setSuggestedRead] = useState(NEUTRAL_READ);
  const [scoutingFile, setScoutingFile] = useState<ManagerFile | null>(null);
  /* The partner a deep link asked for (/market?manager=3). The finder owns
     its own ticket; this is only the preset it applies on arrival. */
  const [finderPartner, setFinderPartner] = useState<number | null>(null);
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
    setFinderPartner(rosterId);
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
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false);
  const [isEditingTrade, setIsEditingTrade] = useState(true);
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

  const currentWeek = pricing?.week ?? bootstrap?.week ?? null;
  const { dismissedSignatures, dismiss, undo, restoreAll, pendingUndoSignature } =
    useDismissedTradeSuggestions(stored?.leagueId ?? null, currentWeek);
  // The entire-league board machinery (leagueScanLine, shareSuggestion,
  // leagueDealRows, refreshLeagueDeals, leagueDealByKey) was removed with the
  // whole-league auto-scan (user). Per-manager deals + the builder remain.

  /* Your read on every manager, so a league-wide scan prices acceptance the
     way the builder does for one. Scouted defaults only load for the manager
     open in the builder; the rest resolve from saved overrides or neutral. */
  const readsByRoster = useMemo(() => {
    if (!stored) return {};
    const out: Record<number, { friendliness: number; relationship: number }> = {};
    for (const team of partners) {
      const read = team.rosterId === partnerRosterId
        ? { friendliness, relationship }
        : resolveTradeTraits(stored.leagueId, team.rosterId, NEUTRAL_READ, scoutingAffectsAcceptance);
      out[team.rosterId] = { friendliness: read.friendliness, relationship: read.relationship };
    }
    return out;
  }, [friendliness, partnerRosterId, partners, relationship, scoutingAffectsAcceptance, stored]);

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
    setFinderPartner(partner.rosterId);
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
        <SeasonalNotice>
          {isLoading
            ? 'Syncing your trade board…'
            : error ?? "We couldn't load your league right now."}
        </SeasonalNotice>
      </div>
    );
  }

  if (!bootstrap || !userTeam || !stored) {
    return (
      <div className="trade-page">
        <TradeTargetsList groups={MOCK_TRADE_TARGET_GROUPS} />
      </div>
    );
  }

  /* One refusal for both. There were two branches here saying nearly the
     same thing in different words, and only one of them was reached for a
     dynasty league. */
  if (!tradesSupported(bootstrap)) {
    return (
      <div className="trade-page">
        <SeasonalNotice>
          Trades are off for dynasty and keeper leagues. Picks and future seasons
          are most of what changes hands there, and we only price this season.
        </SeasonalNotice>
      </div>
    );
  }

  // Any change to the trade invalidates both the price verdict and the sim.
  const resetOutputs = () => {
    setResult(null);
    setAnalysis(null);
    setAnalysisError(null);
    setPriceError(null);
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
    setPriceError(null);
    /* Same swallow as runPricing had, in the path that applies a counter.
       Pressing the counter's add button and getting no response is the same
       dead button by another route. */
    const pricePromise = priceTrade(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: partnerRosterId!,
      give: nextGive,
      get: nextGet,
      traits: NEUTRAL_TRADE_TRAITS,
    })
      .then(setResult)
      .catch((error: unknown) => {
        setPriceError(
          error instanceof Error && error.message
            ? error.message
            : 'The trade could not be priced.',
        );
      });
    const analysisPromise = runAnalysis(nextGive, nextGet);
    void Promise.allSettled([pricePromise, analysisPromise]).finally(() => {
      setIsPricing(false);
      setIsEditingTrade(false);
    });
  };

  const runAnalysis = async (giveIds: string[], getIds2: string[], partner: number | null = partnerRosterId) => {
    if (partner == null) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const a = await analyzeTradeApi(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId: partner,
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
    setMarketView('build');
    setParams({
      leagueId: stored.leagueId,
      managerRosterId: String(suggestion.partnerRosterId),
      give: givePlayerIds.join(','),
      get: getPlayerIds.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  /* Explicit inputs rather than state, so a ticket the finder hands over
     can be priced in the same press that fills the builder in. */
  const runPricingWith = async (partner: number, giveIds: string[], getIds2: string[]) => {
    if (giveIds.length === 0 || getIds2.length === 0) return;
    setIsPricing(true);
    setCounter(null);
    setPriceError(null);
    // One press: price the trade AND simulate its full-season impact.
    const pricePromise = priceTrade(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: partner,
      give: giveIds,
      get: getIds2,
      traits: NEUTRAL_TRADE_TRAITS,
    })
      .then(setResult)
      /* Not swallowed. This caught every failure and threw it away, so a
         request that timed out or answered 500 left `result` null — and null
         is neither "priced" nor "unavailable", so the panel below rendered
         nothing at all. The loader flashed and the screen went back to how it
         was, which is indistinguishable from a dead button. */
      .catch((error: unknown) => {
        setPriceError(
          error instanceof Error && error.message
            ? error.message
            : 'The trade could not be priced.',
        );
      });
    const analysisPromise = runAnalysis(giveIds, getIds2, partner);
    try {
      await Promise.allSettled([pricePromise, analysisPromise]);
    } finally {
      setIsPricing(false);
      setIsEditingTrade(false);
    }
  };

  const runPricing = async () => {
    if (partnerRosterId == null) return;
    await runPricingWith(partnerRosterId, give, getIds);
  };

  /* Every leg of the ticket exact: fill the builder and price it at once. */
  const priceExactTicket = (trade: { partnerRosterId: number; give: string[]; get: string[] }) => {
    if (isPricing || counterLoading) return;
    setPartnerRosterId(trade.partnerRosterId);
    setGive(trade.give);
    setGetIds(trade.get);
    resetOutputs();
    setMarketView('build');
    setParams({
      leagueId: stored.leagueId,
      managerRosterId: String(trade.partnerRosterId),
      give: trade.give.join(','),
      get: trade.get.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
    void runPricingWith(trade.partnerRosterId, trade.give, trade.get);
  };

  /* A proposal is an argument you make to another manager, so a found deal
     has to be able to leave the app as a picture. */
  const shareSuggestion = (suggestion: TradeSuggestion) => {
    const partner = partners.find((team) => team.rosterId === suggestion.partnerRosterId);
    const getPlayerIds = suggestion.get.map((asset) => asset.id);
    const givePlayerIds = suggestion.give.map((asset) => asset.id);
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
      verdict: tradeCardHeadline(suggestion.youDelta, suggestion.partnerDelta),
      you: {
        manager: userTeam?.teamName ?? 'You',
        avatar: resolveApiUrl(userTeam?.avatarUrl) ?? null,
        assets: getPlayerIds.map(asset),
        titleDelta: signedPct(suggestion.youDelta),
        playoffDelta: signedPct(suggestion.youPlayoffDelta ?? 0),
        titleUp: suggestion.youDelta >= 0,
        playoffUp: (suggestion.youPlayoffDelta ?? 0) >= 0,
      },
      them: {
        manager: partner?.teamName ?? 'Them',
        avatar: resolveApiUrl(partner?.avatarUrl) ?? null,
        assets: givePlayerIds.map(asset),
        titleDelta: signedPct(suggestion.partnerDelta),
        playoffDelta: signedPct(suggestion.partnerPlayoffDelta ?? 0),
        titleUp: suggestion.partnerDelta >= 0,
        playoffUp: (suggestion.partnerPlayoffDelta ?? 0) >= 0,
      },
    });
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
                {player.byeWeek ? <span className="trade-cc__asset-bye">BYE {player.byeWeek}</span> : null}
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
          aria-label="Search players"
          autoComplete="off"
          className="trade-cc__pool-search"
          disabled={isPricing || counterLoading}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search players"
          spellCheck={false}
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
                        {[row.player.position, row.player.team, row.player.byeWeek ? `BYE ${row.player.byeWeek}` : null]
                          .filter(Boolean)
                          .join(' · ')}
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

  const renderTeamAvatar = (team: NonNullable<typeof selectedPartner>) => (
    <span className="trade-cc__team-avatar" aria-hidden="true">
      {team.avatarUrl ? (
        <img alt="" height={64} loading="lazy" src={resolveApiUrl(team.avatarUrl) ?? undefined} width={64} />
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
          </button>
        ))}
      </div>

      <section
        className={[
          'trade-cc__finder',
          marketView === 'finder' ? '' : 'trade-cc__finder--hidden',
        ].filter(Boolean).join(' ')}
      >
        <TradeFinder
          bootstrap={bootstrap}
          busy={isPricing || counterLoading}
          dismissedSignatures={dismissedSignatures}
          futuresByRoster={futuresByRoster}
          leagueId={stored.leagueId}
          onBuild={loadSuggestedTrade}
          onDismiss={dismiss}
          onPriceExact={priceExactTicket}
          onRestoreAll={restoreAll}
          onShare={shareSuggestion}
          partners={partners}
          presetPartnerRosterId={finderPartner}
          pricing={pricing}
          readsByRoster={readsByRoster}
          userId={stored.userId}
          userTeam={userTeam}
        />
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
                <p className="trade-cc__hint">Pick a manager to trade with.</p>
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
                  <p className="trade-cc__counter-body">Couldn&apos;t find a fair add.</p>
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
        /* Say why it did not price.

           This printed "pick at least one player on each side" for every
           reason except missing projections — including the reasons that
           arise with both sides already full, which is the only way to reach
           this branch by pressing the button. Being told to do the thing you
           just did reads as the app not having noticed you at all. */
        <SeasonalNotice>
          {result.reason === 'no_projections'
            ? "Trades price once this week's projections are in."
            : give.length === 0 || getIds.length === 0
              ? 'Pick at least one player on each side to price the trade.'
              : 'Could not price this trade. Try again.'}
        </SeasonalNotice>
      ) : priceError || analysisError ? (
        /* Anything that went wrong, said out loud.

           This branch did not exist. The only place a failure was ever
           reported was the analyzer panel, which sits INSIDE the verdict
           block above — and that block only renders when both calls have
           already succeeded. So the message explaining why the trade could
           not be priced was gated behind the trade having been priced, and
           the three ways this screen can fail all rendered the same nothing:
           pricing rejected, analysis rejected, or pricing fine and analysis
           not. The button looked dead in every one of them. */
        <section className="trade-cc__failure" role="status">
          {/* The heading has to agree with the sentence under it. It said
              "did not price" in every case, including the one where the price
              came back fine and only the season impact failed. */}
          <p className="trade-cc__failure-head">
            {priceError ? 'This trade did not price.' : 'The trade priced, but not its season impact.'}
          </p>
          <p className="trade-cc__failure-detail">
            {priceError && analysisError
              ? `${priceError} The season impact did not run either.`
              : priceError
                ? priceError
                : analysisError}
          </p>
          <button
            className="trade-cc__failure-retry"
            disabled={isPricing || !canPrice}
            onClick={() => void runPricing()}
            type="button"
          >
            Try again
          </button>
        </section>
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
