import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { ScoutingView } from './market/ScoutingView';
import '../components/trade/TradeAnalyzerPanel.css';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
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
import { TradeAnalyzerPanel, acceptanceProbability } from '../components/trade/TradeAnalyzerPanel';
import type { LeagueBootstrap, MarketMover } from '../services/leagueApi';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import { loadTradeTraits, saveTradeTraits } from '../utils/tradeTraits';
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
  if (probability >= 60) return 'trade-cc__lane-acceptance-fill--good';
  if (probability < 40) return 'trade-cc__lane-acceptance-fill--muted';
  return 'trade-cc__lane-acceptance-fill--neutral';
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

/** Your private read on a manager: two subjective sliders that feed the trade
 *  acceptance model. Saved per manager and loaded into every trade with them. */
function ManagerReadCard({
  name,
  friendliness,
  relationship,
  onChange,
}: {
  name: string;
  friendliness: number;
  relationship: number;
  onChange: (next: { friendliness?: number; relationship?: number }) => void;
}) {
  return (
    <div className="trade-cc__read-card">
      <p className="trade-cc__read-title">Your read on {name}</p>
      <ReadSlider
        label="Trade-friendliness"
        hint="0 = stubborn hoarder · 10 = wheeler-dealer"
        value={friendliness}
        onChange={(n) => onChange({ friendliness: n })}
      />
      <ReadSlider
        label="Relationship"
        hint="0 = despises you · 10 = great terms"
        value={relationship}
        onChange={(n) => onChange({ relationship: n })}
      />
      <p className="trade-cc__read-note">
        Only nudges the acceptance odds — never the championship numbers. Saved for this manager.
      </p>
    </div>
  );
}

function ReadSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="trade-cc__read-slider">
      <div className="trade-cc__read-slider-head">
        <span>{label}</span>
        <span className="trade-cc__read-slider-value">{value}</span>
      </div>
      <input type="range" min={0} max={10} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="trade-cc__read-slider-hint">{hint}</span>
    </div>
  );
}

function TradeDealsView() {
  const { bootstrap, stored, pricing, isLoading, error, refresh } = useLeagueConnection();
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
  const [analysisDrops, setAnalysisDrops] = useState<string[] | null>(null);
  const [counter, setCounter] = useState<TradeCounter | null>(null);
  const [counterLoading, setCounterLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<TradeSuggestion[] | null>(null);
  const [suggDebug, setSuggDebug] = useState<{ simmed: number; positive: number } | null>(null);
  const [suggLoading, setSuggLoading] = useState(false);
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');
  const [friendliness, setFriendliness] = useState(5);
  const [relationship, setRelationship] = useState(5);
  const [showRead, setShowRead] = useState(false);
  const refreshKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!stored || isLoading) return;
    const computedAt = pricing?.computedAt ?? 0;
    const stale = !computedAt || Date.now() - computedAt > 2 * 60_000;
    const key = `${stored.provider}:${stored.leagueId}:${computedAt}`;
    if (!stale || refreshKeyRef.current === key) return;
    refreshKeyRef.current = key;
    void refresh();
  }, [isLoading, pricing?.computedAt, refresh, stored]);

  const lanes = useMemo(
    () => {
      if (!pricing?.available || !bootstrap || !stored) return [];
      return (pricing.movers ?? []).filter((mover) =>
        mover.kind === 'trade' && laneBelongsToLeague(mover, bootstrap, stored.leagueId),
      );
    },
    [bootstrap, pricing, stored],
  );

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

    const matchingLane = lanes.find((lane) =>
      lane.partnerRosterId === partner.rosterId ||
      (lane.getPlayerId && partner.players.includes(lane.getPlayerId)),
    );
    const nextGive = giveParam
      ? giveParam.split(',').filter(Boolean)
      : matchingLane?.givePlayerIds ?? (matchingLane?.givePlayerId ? [matchingLane.givePlayerId] : []);
    const nextGet = getParam
      ? getParam.split(',').filter(Boolean)
      : matchingLane?.getPlayerIds ?? (matchingLane?.getPlayerId ? [matchingLane.getPlayerId] : []);

    setPartnerRosterId(partner.rosterId);
    setGive(nextGive);
    setGetIds(nextGet);
    resetOutputs();
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }, [bootstrap, lanes, params, stored]);

  // Load your saved read (friendliness/relationship) for the selected manager.
  useEffect(() => {
    if (!stored) return;
    const t = loadTradeTraits(stored.leagueId, partnerRosterId);
    setFriendliness(t.friendliness);
    setRelationship(t.relationship);
    setShowRead(false);
  }, [partnerRosterId, stored]);

  const updateRead = (next: { friendliness?: number; relationship?: number }) => {
    const t = { friendliness, relationship, ...next };
    setFriendliness(t.friendliness);
    setRelationship(t.relationship);
    if (stored) saveTradeTraits(stored.leagueId, partnerRosterId, t);
  };

  // Sim-scored trade suggestions (server returns Δ championship % for both sides;
  // we rank client-side by expected gain using our per-manager sliders).
  useEffect(() => {
    if (!stored || !bootstrap) return;
    let active = true;
    setSuggLoading(true);
    fetchTradeSuggestions(stored.leagueId, { userId: stored.userId })
      .then((r) => {
        if (!active) return;
        setSuggestions(r.available ? r.suggestions ?? [] : []);
        setSuggDebug(r.debug ? { simmed: r.debug.simmed, positive: r.debug.positive } : null);
      })
      .catch(() => { if (active) setSuggestions([]); })
      .finally(() => { if (active) setSuggLoading(false); });
    return () => { active = false; };
  }, [stored, bootstrap?.league.id]);

  // Rank suggestions by expected championship gain = yourΔc × P(partner accepts),
  // where acceptance uses YOUR saved friendliness/relationship read per manager.
  // All server suggestions (raise YOUR title) scored with acceptance.
  const scoredSuggestions = useMemo(() => {
    if (!suggestions) return [];
    return suggestions.map((s) => {
      const t = loadTradeTraits(stored?.leagueId ?? '', s.partnerRosterId);
      const accept = acceptanceProbability(s.partnerDelta, t.friendliness, t.relationship);
      return { ...s, accept, score: (s.youDelta * accept) / 100 };
    });
  }, [suggestions, stored?.leagueId, friendliness, relationship]);
  // Keep only those clearing the acceptance floor (kills fleeces), rank by expected gain.
  const ACCEPT_FLOOR = 10;
  const rankedSuggestions = scoredSuggestions
    .filter((s) => s.accept >= ACCEPT_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

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

  // Redraft-only for now: dynasty/keeper value lives in youth and picks that
  // Franco's weekly model doesn't price yet, so we don't pretend to.
  if (bootstrap.league.leagueType !== 'redraft') {
    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Market</h1>
        <SeasonalNotice>
          Market deals are built for redraft leagues. Dynasty and
          keeper trades turn on player age and pick value, which we don&apos;t
          price yet. It&apos;s coming.
        </SeasonalNotice>
      </div>
    );
  }

  // Any change to the trade invalidates both the price verdict and the sim.
  const resetOutputs = () => {
    setResult(null);
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisDrops(null);
    setCounter(null);
    setCounterLoading(false);
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
        userDrops: analysisDrops,
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
    setResult(null);
    setCounter(null);
    void priceTrade(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: partnerRosterId!,
      give: nextGive,
      get: nextGet,
      traits: NEUTRAL_TRADE_TRAITS,
    }).then(setResult).catch(() => {});
    void runAnalysis(nextGive, nextGet, null);
  };

  const runAnalysis = async (giveIds: string[], getIds2: string[], userDrops: string[] | null = null) => {
    if (partnerRosterId == null) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const a = await analyzeTradeApi(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give: giveIds,
        get: getIds2,
        userDrops,
      });
      setAnalysis(a);
      setAnalysisDrops(userDrops);
      if (!a.available) setAnalysisError(a.reason ?? 'Could not analyze this trade.');
    } catch (e) {
      setAnalysis(null);
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    resetOutputs();
  };

  const loadSuggestion = (s: TradeSuggestion) => {
    const givePlayerIds = s.give.map((g) => g.id);
    const getPlayerIds = s.get.map((g) => g.id);
    setPartnerRosterId(s.partnerRosterId);
    setGive(givePlayerIds);
    setGetIds(getPlayerIds);
    resetOutputs();
    setParams({
      view: 'deals',
      leagueId: stored.leagueId,
      managerRosterId: String(s.partnerRosterId),
      give: givePlayerIds.join(','),
      get: getPlayerIds.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const runPricing = async () => {
    if (partnerRosterId == null || give.length === 0 || getIds.length === 0) return;
    setIsPricing(true);
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
    const analysisPromise = runAnalysis(give, getIds, null);
    try {
      await Promise.allSettled([pricePromise, analysisPromise]);
    } finally {
      setIsPricing(false);
    }
  };

  // One-tap fair counter: add the suggested throw-in(s) to the right side and reprice.
  const canPrice = partnerRosterId != null && give.length > 0 && getIds.length > 0;
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
              <span className="trade-cc__pill-add">{list.includes(row.id) ? 'Added' : 'Add'}</span>
            </button>
          </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="trade-page">
      <h1 className="visually-hidden">Market</h1>

      <section className="trade-cc__finder">
        <h2 className="trade-cc__section-label">Managers you match with</h2>
        <p className="trade-cc__finder-sub">Trades that raise your title odds, ranked by title gain × chance they accept.</p>
        {suggLoading && suggestions == null ? (
          <div className="trade-cc__lane-skeleton" aria-label="Simulating trades">
            <span />
            <span />
            <span />
          </div>
        ) : rankedSuggestions.length > 0 ? (
          <>
          {rankedSuggestions.map((s, index) => {
            const getPlayerIds = s.get.map((g) => g.id);
            const givePlayerIds = s.give.map((g) => g.id);
            const compact = index > 0;
            const key = `sugg-${s.partnerRosterId}-${givePlayerIds.join(',')}-${getPlayerIds.join(',')}`;
            return (
              <article
                className={['trade-cc__lane', compact ? 'trade-cc__lane--compact' : ''].filter(Boolean).join(' ')}
                key={key}
                onClick={() => loadSuggestion(s)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  loadSuggestion(s);
                }}
                role="button"
                tabIndex={0}
              >
                <span className="trade-cc__lane-top">
                  {renderLaneHeadshots(getPlayerIds, givePlayerIds, compact)}
                  <DealLaneTitle
                    compressedIncoming={laneSideLabel(bootstrap, getPlayerIds, true)}
                    compressedOutgoing={laneSideLabel(bootstrap, givePlayerIds, true)}
                    fullIncoming={laneSideLabel(bootstrap, getPlayerIds, false)}
                    fullOutgoing={laneSideLabel(bootstrap, givePlayerIds, false)}
                    key={`${getPlayerIds.join(',')}|${givePlayerIds.join(',')}`}
                  />
                </span>

                <span className="trade-cc__lane-mid">
                  <span className="trade-cc__lane-copy">
                    <span className="trade-cc__lane-manager">{s.partnerName}</span>
                    <span className="trade-cc__lane-numbers">
                      <span className="trade-cc__lane-you">your title {s.youDelta > 0 ? '+' : ''}{s.youDelta}%</span>
                    </span>
                  </span>
                  <span className="trade-cc__lane-acceptance" style={acceptanceStyle(s.accept)}>
                    <span className="trade-cc__lane-acceptance-label">
                      <span>{s.accept}% to accept</span>
                    </span>
                    <span className="trade-cc__lane-acceptance-track">
                      <span
                        className={['trade-cc__lane-acceptance-fill', acceptanceTone(s.accept)].join(' ')}
                      />
                      <span className="trade-cc__lane-acceptance-notch" />
                      <span className="trade-cc__lane-acceptance-marker" />
                    </span>
                  </span>
                </span>
              </article>
            );
          })}
          </>
        ) : scoredSuggestions.length > 0 ? (
          <p className="trade-cc__empty-lane">
            Found {scoredSuggestions.length} trade{scoredSuggestions.length === 1 ? '' : 's'} that raise your title,
            but the best is only {Math.max(...scoredSuggestions.map((s) => s.accept))}% to accept (below the {ACCEPT_FLOOR}% bar).
          </p>
        ) : (
          <p className="trade-cc__empty-lane">
            No trade raises your title odds right now
            {suggDebug ? ` (simmed ${suggDebug.simmed}, ${suggDebug.positive} raised your title).` : '.'}
          </p>
        )}
      </section>

      {/* ── Builder ── */}
      <section className="trade-cc__builder" ref={builderRef}>
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
                <select
                  className="trade-cc__partner-select"
                  onChange={(event) => {
                    setPartnerRosterId(Number(event.target.value) || null);
                    setGetIds([]);
                    resetOutputs();
                  }}
                  value={partnerRosterId ?? ''}
                >
                  <option value="">Pick manager</option>
                  {partners.map((team) => (
                    <option key={team.rosterId} value={team.rosterId}>
                      {team.teamName}
                    </option>
                  ))}
                </select>
                {partnerRosterId != null ? (
                  <button
                    className="trade-cc__partner-read"
                    aria-expanded={showRead}
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
                name={partners.find((t) => t.rosterId === partnerRosterId)?.teamName ?? 'this manager'}
                friendliness={friendliness}
                relationship={relationship}
                onChange={updateRead}
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

        <button
          className="trade-cc__price-btn"
          disabled={!canPrice || isPricing}
          onClick={() => void runPricing()}
          type="button"
        >
          {isPricing ? 'Pricing…' : 'Price this trade'}
        </button>

        <TradeAnalyzerPanel
          analysis={analysis}
          analyzing={analyzing}
          error={analysisError}
          drops={analysisDrops}
          onOverrideDrops={(d) => void runAnalysis(give, getIds, d)}
          userPlayers={userTeam.players}
          nameOf={(id) => playerName(bootstrap, id)}
          posOf={(id) => bootstrap.players[id]?.position ?? ''}
          friendliness={friendliness}
          relationship={relationship}
        />
      </section>

      {/* ── Verdict ── */}
      {result && result.available && result.you && result.them ? (
        (() => {
          const renderFaces = (ids: string[], tone: 'get' | 'give') => (
            <div className={`trade-cc__verdict-face-group trade-cc__verdict-face-group--${tone}`}>
              {ids.map((id) => (
                <span
                  className={`trade-cc__verdict-face trade-cc__verdict-face--${tone}`}
                  key={id}
                  title={playerName(bootstrap, id)}
                >
                  <PlayerHeadshot
                    name={playerName(bootstrap, id)}
                    player={toPlayer(id, bootstrap.players)}
                  />
                </span>
              ))}
            </div>
          );

          return (
            <section className="trade-cc__verdict">
              <div className="trade-cc__verdict-faces" aria-label="Trade players">
                <div className="trade-cc__verdict-face-side">
                  <span className="trade-cc__verdict-face-label">You send</span>
                  {renderFaces(give, 'give')}
                </div>
                <span className="trade-cc__verdict-arrows" aria-hidden="true">
                  <span>→</span>
                  <span>←</span>
                </span>
                <div className="trade-cc__verdict-face-side">
                  <span className="trade-cc__verdict-face-label">You get</span>
                  {renderFaces(getIds, 'get')}
                </div>
              </div>

              {analysis?.available && analysis.you && analysis.partner ? (
                <div className="trade-cc__counter">
                  {counter == null ? (
                    <button
                      className="trade-cc__counter-btn"
                      onClick={() => void fetchCounter()}
                      disabled={counterLoading}
                      type="button"
                    >
                      {counterLoading ? 'Simulating fair adds…' : 'Even out this trade →'}
                    </button>
                  ) : !counter.available ? (
                    <p className="trade-cc__counter-body">Couldn&apos;t compute a fair counter.</p>
                  ) : counter.needed === false ? (
                    <p className="trade-cc__counter-body">This trade is already balanced.</p>
                  ) : counter.add && counter.add.length > 0 ? (
                    <>
                      <p className="trade-cc__counter-body">
                        {counter.whoAdds === 'you'
                          ? `Add ${counter.add.map((a) => a.name).join(' + ')} to your side to even it out.`
                          : `Ask ${analysis.partner.teamName} to add ${counter.add.map((a) => a.name).join(' + ')} to even it out.`}
                        {counter.before && counter.after
                          ? ` Your championship ${counter.before.youDelta > 0 ? '+' : ''}${counter.before.youDelta}% to ${counter.after.youDelta > 0 ? '+' : ''}${counter.after.youDelta}%, ${analysis.partner.teamName} ${counter.before.partnerDelta > 0 ? '+' : ''}${counter.before.partnerDelta}% to ${counter.after.partnerDelta > 0 ? '+' : ''}${counter.after.partnerDelta}%.`
                          : ''}
                      </p>
                      <button
                        className="trade-cc__counter-btn"
                        onClick={() => applyCounterAdd(counter)}
                        type="button"
                      >
                        {counter.whoAdds === 'you' ? 'Add it to what you give' : 'Add it to what you get'}
                      </button>
                    </>
                  ) : (
                    <p className="trade-cc__counter-body">No single add balances this trade well.</p>
                  )}
                </div>
              ) : null}

              <div className="trade-cc__fit">
                <p className="trade-cc__reasons-title">Your depth after</p>
                <div className="trade-cc__fit-rows">
                  {['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
                    .filter((pos) => {
                      const before = result.you!.depthBefore[pos] ?? 0;
                      const after = result.you!.depthAfter[pos] ?? 0;
                      return !['K', 'DEF'].includes(pos) || before !== after;
                    })
                    .map((pos) => {
                      const before = result.you!.depthBefore[pos] ?? 0;
                      const after = result.you!.depthAfter[pos] ?? 0;
                      const changed = after !== before;
                      const improved = after > before;
                      return (
                        <div className="trade-cc__fit-row" key={pos}>
                          <span className="trade-cc__fit-pos">{pos}</span>
                          <span
                            className={[
                              'trade-cc__fit-count',
                              changed
                                ? improved
                                  ? 'trade-cc__fit-count--up'
                                  : 'trade-cc__fit-count--down'
                                : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {changed ? (
                              <>
                                {before} → {after} {improved ? '▲' : '▼'}
                              </>
                            ) : (
                              after
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {result.isDepthPackage ? (
                <SeasonalNotice>
                  This is a depth package: you&apos;re sending several players but only
                  one would start for them. It&apos;s worth less than it looks.
                </SeasonalNotice>
              ) : null}
            </section>
          );
        })()
      ) : result && !result.available ? (
        <SeasonalNotice>
          {result.reason === 'no_projections'
            ? 'Trades price once projections are imported.'
            : 'Pick at least one player on each side to price the trade.'}
        </SeasonalNotice>
      ) : null}
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
