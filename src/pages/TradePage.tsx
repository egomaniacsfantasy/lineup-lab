import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { ScoutingView } from './market/ScoutingView';
import { TradeAnalyzerPanel } from '../components/trade/TradeAnalyzerPanel';
import '../components/trade/TradeAnalyzerPanel.css';
import { useScoutingCard } from '../contexts/ScoutingCardContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { toPlayer } from '../adapters/connectedLeague';
import {
  priceTrade,
  analyzeTradeApi,
  fetchTradeRationale,
  type TradeResult,
  type TradeAnalysis,
  type TradeRationaleResponse,
  type TradeTraits,
} from '../services/leagueApi';
import type { LeagueBootstrap, MarketMover } from '../services/leagueApi';
import { formatAmericanOdds } from '../utils/formatOdds';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import './TradePage.css';

function signedDelta(value = 0) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function impliedTitleProbability(odds: number) {
  return odds <= -100 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

function titleOddsImproved(before: number, after: number) {
  return impliedTitleProbability(after) > impliedTitleProbability(before);
}

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

type RationaleState = {
  loading: boolean;
  error?: string | null;
  data?: TradeRationaleResponse | null;
};

function TradeRationalePanel({ state }: { state?: RationaleState }) {
  if (!state || state.loading) {
    return <span className="trade-cc__rationale-panel">Pricing the explanation...</span>;
  }

  if (state.error) {
    return <span className="trade-cc__rationale-panel trade-cc__rationale-panel--error">{state.error}</span>;
  }

  const data = state.data;
  if (!data) return null;

  return (
    <span className="trade-cc__rationale-panel">
      {data.narration ? <span className="trade-cc__rationale-summary">{data.narration}</span> : null}
      <span className="trade-cc__rationale-summary">{data.structured.summary}</span>
      <span className="trade-cc__rationale-sections">
        {data.structured.sections.map((section) => (
          <span className="trade-cc__rationale-section" key={section.label}>
            <span className="trade-cc__rationale-label">{section.label}</span>
            {section.facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}

function generatedAt(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

function TradeDealsView() {
  const { bootstrap, stored, pricing, isLoading, error, refresh } = useLeagueConnection();
  const { openScoutingCard } = useScoutingCard();
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
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');
  const [openLaneWhy, setOpenLaneWhy] = useState<string | null>(null);
  const [rationaleByKey, setRationaleByKey] = useState<Record<string, RationaleState>>({});
  const [liveRead, setLiveRead] = useState<{
    loading: boolean;
    result: TradeResult | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });
  const refreshKeyRef = useRef<string | null>(null);
  const giveSignature = give.join(',');
  const getSignature = getIds.join(',');

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
  const lanesResolved = pricing != null && (!pricing.available || Array.isArray(pricing.movers));

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

  useEffect(() => {
    if (!stored || partnerRosterId == null || give.length === 0 || getIds.length === 0) {
      setLiveRead({ loading: false, result: null, error: null });
      return undefined;
    }

    let active = true;
    setLiveRead((current) => ({ ...current, loading: true, error: null }));
    const timer = window.setTimeout(() => {
      void priceTrade(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give,
        get: getIds,
        traits: NEUTRAL_TRADE_TRAITS,
      })
        .then((priced) => {
          if (!active) return;
          setLiveRead({ loading: false, result: priced, error: priced.available ? null : priced.reason ?? 'unpriced' });
        })
        .catch(() => {
          if (!active) return;
          setLiveRead({ loading: false, result: null, error: 'Could not price the live read.' });
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [getSignature, giveSignature, getIds, give, partnerRosterId, stored]);

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

  const loadLane = (lane: (typeof lanes)[number]) => {
    const getPlayerIds = lane.getPlayerIds ?? (lane.getPlayerId ? [lane.getPlayerId] : []);
    const givePlayerIds = lane.givePlayerIds ?? (lane.givePlayerId ? [lane.givePlayerId] : []);
    const ownerRosterId = lane.partnerRosterId ?? bootstrap.teams.find((t) =>
      getPlayerIds.some((id) => t.players.includes(id)),
    )?.rosterId;
    if (ownerRosterId == null) return;
    setPartnerRosterId(ownerRosterId);
    setGive(givePlayerIds);
    setGetIds(getPlayerIds);
    resetOutputs();
    setParams({
      view: 'deals',
      leagueId: stored.leagueId,
      managerRosterId: String(ownerRosterId),
      give: givePlayerIds.join(','),
      get: getPlayerIds.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const toggleRationale = (
    key: string,
    body: Parameters<typeof fetchTradeRationale>[1],
  ) => {
    if (openLaneWhy === key) {
      setOpenLaneWhy(null);
      return;
    }

    setOpenLaneWhy(key);
    if (rationaleByKey[key]?.data || rationaleByKey[key]?.loading) return;

    setRationaleByKey((current) => ({
      ...current,
      [key]: { loading: true },
    }));
    void fetchTradeRationale(stored.leagueId, body)
      .then((data) => {
        setRationaleByKey((current) => ({
          ...current,
          [key]: { loading: false, data },
        }));
      })
      .catch(() => {
        setRationaleByKey((current) => ({
          ...current,
          [key]: {
            loading: false,
            error: 'Could not price this explanation. Try again.',
          },
        }));
      });
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
      .then((priced) => {
        setResult(priced);
        setLiveRead({ loading: false, result: priced, error: priced.available ? null : priced.reason ?? 'unpriced' });
      })
      .catch(() => {});
    const analysisPromise = runAnalysis(give, getIds, null);
    try {
      await Promise.allSettled([pricePromise, analysisPromise]);
    } finally {
      setIsPricing(false);
    }
  };

  // One-tap fair counter: add the suggested throw-in(s) to the right side and reprice.
  const applyCounter = async (counter: NonNullable<TradeResult['fairCounter']>) => {
    if (!stored || partnerRosterId == null) return;
    const ids = counter.add.map((a) => a.id);
    const nextGive = counter.whoAdds === 'you' ? [...new Set([...give, ...ids])] : give;
    const nextGet = counter.whoAdds === 'them' ? [...new Set([...getIds, ...ids])] : getIds;
    setGive(nextGive);
    setGetIds(nextGet);
    setIsPricing(true);
    const pricePromise = priceTrade(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId,
      give: nextGive,
      get: nextGet,
      traits: NEUTRAL_TRADE_TRAITS,
    })
      .then((priced) => {
        setResult(priced);
        setLiveRead({ loading: false, result: priced, error: priced.available ? null : priced.reason ?? 'unpriced' });
      })
      .catch(() => {});
    const analysisPromise = runAnalysis(nextGive, nextGet, null);
    try {
      await Promise.allSettled([pricePromise, analysisPromise]);
    } finally {
      setIsPricing(false);
    }
  };

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

  const rosterRole = (rosterId: number, id: string) => {
    const team = bootstrap.teams.find((candidate) => candidate.rosterId === rosterId);
    if (!team) return 'Roster';
    return (team.starters ?? []).includes(id) ? 'Starter' : 'Bench';
  };

  const playerContextValue = (rosterId: number, id: string) => {
    const mean = pricing?.playerMeans?.[id]?.mean;
    const role = rosterRole(rosterId, id);
    const player = bootstrap.players[id];
    const depth = player?.position
      ? bootstrap.teams.find((team) => team.rosterId === rosterId)?.players.filter((playerId) =>
          bootstrap.players[playerId]?.position === player.position,
        ).length
      : null;
    const projection = typeof mean === 'number' && Number.isFinite(mean) ? `${mean.toFixed(1)} wk` : 'unpriced';
    const depthText = depth == null || !player?.position ? '' : ` · ${player.position}${depth}`;
    return `${role} · ${projection}${depthText}`;
  };

  const selectedTotal = (ids: string[]) =>
    ids.reduce((sum, id) => sum + (pricing?.playerMeans?.[id]?.mean ?? 0), 0);

  const liveResult = liveRead.result?.available ? liveRead.result : null;
  const liveTitleMoved =
    liveResult?.you?.titleAfter != null &&
    liveResult?.you?.titleBefore != null &&
    liveResult.you.titleAfter !== liveResult.you.titleBefore;
  const liveTitleUp = liveTitleMoved
    ? titleOddsImproved(liveResult!.you!.titleBefore, liveResult!.you!.titleAfter)
    : false;
  const assetDelta = selectedTotal(getIds) - selectedTotal(give);

  const renderSelectedCards = (
    rosterId: number,
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
                <span className="trade-cc__asset-meta">
                  {player.team} · {playerContextValue(rosterId, id)}
                </span>
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
              <span className="trade-cc__pill-value">{playerContextValue(rosterId, row.id)}</span>
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
        {!lanesResolved ? (
          <div className="trade-cc__lane-skeleton" aria-label="Pricing trade lanes">
            <span />
            <span />
            <span />
          </div>
        ) : lanes.length > 0 ? (
          <>
          {lanes.map((lane, index) => {
            const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
            const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
            const fullIncoming = laneSideLabel(bootstrap, getPlayerIds, false);
            const fullOutgoing = laneSideLabel(bootstrap, givePlayerIds, false);
            const compressedIncoming = laneSideLabel(bootstrap, getPlayerIds, true);
            const compressedOutgoing = laneSideLabel(bootstrap, givePlayerIds, true);
            const acceptanceProbability = lane.acceptanceProbability ?? 50;
            const time = generatedAt(lane.pricedAt);
            const compact = index > 0;
            const laneKey = `lane:${lane.partnerRosterId}-${givePlayerIds.join(',')}-${getPlayerIds.join(',')}`;
            const whyOpen = openLaneWhy === laneKey;
            const rationaleBody = {
              userId: stored.userId,
              partnerRosterId: Number(lane.partnerRosterId),
              give: givePlayerIds,
              get: getPlayerIds,
              traits: NEUTRAL_TRADE_TRAITS,
            };

            return (
              <article
                className={[
                  'trade-cc__lane',
                  compact ? 'trade-cc__lane--compact' : '',
                ].filter(Boolean).join(' ')}
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
                <span className="trade-cc__lane-top">
                  {renderLaneHeadshots(getPlayerIds, givePlayerIds, compact)}
                  <DealLaneTitle
                    compressedIncoming={compressedIncoming}
                    compressedOutgoing={compressedOutgoing}
                    fullIncoming={fullIncoming}
                    fullOutgoing={fullOutgoing}
                    key={`${fullIncoming}|${fullOutgoing}`}
                  />
                </span>

                <span className="trade-cc__lane-mid">
                  <span className="trade-cc__lane-copy">
                    <span className="trade-cc__lane-manager">
                      {bootstrap.teams.find((team) => team.rosterId === lane.partnerRosterId)?.teamName ?? 'Manager'}
                    </span>
                    <span className="trade-cc__lane-numbers">
                      <span className="trade-cc__lane-you">you {signedDelta(lane.valueGain)}</span>
                      <span> · them {signedDelta(lane.partnerGain ?? 0)}</span>
                    </span>
                  </span>
                  <span className="trade-cc__lane-acceptance" style={acceptanceStyle(acceptanceProbability)}>
                    <span className="trade-cc__lane-acceptance-label">
                      <span>{acceptanceProbability}% to accept</span>
                    </span>
                    <span className="trade-cc__lane-acceptance-track">
                      <span
                        className={[
                          'trade-cc__lane-acceptance-fill',
                          acceptanceTone(acceptanceProbability),
                        ].join(' ')}
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
                      toggleRationale(laneKey, rationaleBody);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    Why this trade?
                  </button>
                  {time ? (
                    <span className="trade-cc__lane-generated">generated at {time}</span>
                  ) : null}
                </span>
                {whyOpen ? (
                  <span
                    className="trade-cc__lane-rationale"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <TradeRationalePanel state={rationaleByKey[laneKey]} />
                  </span>
                ) : null}
              </article>
            );
          })}
          </>
        ) : pricing?.available ? (
          <p className="trade-cc__empty-lane">No deal on this board improves both sides this week.</p>
        ) : (
          <p className="trade-cc__empty-lane">Trade lanes need a priced league.</p>
        )}
      </section>

      {/* ── Builder ── */}
      <section className="trade-cc__builder" ref={builderRef}>
        <div className="trade-cc__builder-head">
          <div>
            <p className="trade-cc__kicker">Build a trade</p>
            <h2 className="trade-cc__title">Who is moving?</h2>
          </div>
          <div className="trade-cc__live-read" aria-live="polite">
            <span className="trade-cc__live-label">Live balance</span>
            {!canPrice ? (
              <span className="trade-cc__live-main">Add one player each side</span>
            ) : liveRead.loading ? (
              <span className="trade-cc__live-main">Pricing this package...</span>
            ) : liveResult && liveResult.you && liveResult.them ? (
              <>
                <span
                  className={[
                    'trade-cc__live-main',
                    liveResult.you.valueDelta > 0
                      ? 'trade-cc__live-main--up'
                      : liveResult.you.valueDelta < 0
                        ? 'trade-cc__live-main--down'
                        : '',
                  ].filter(Boolean).join(' ')}
                >
                  {liveResult.verdict ?? 'Fair'} · you {signedDelta(liveResult.you.valueDelta)}
                </span>
                <span className="trade-cc__live-sub">
                  them {signedDelta(liveResult.them.valueDelta)} pts/wk
                  {liveTitleMoved
                    ? ` · title ${formatAmericanOdds(liveResult.you.titleBefore)} to ${formatAmericanOdds(liveResult.you.titleAfter)} ${liveTitleUp ? '▲' : '▼'}`
                    : ' · title unchanged'}
                  {liveResult.acceptance?.probability != null
                    ? ` · ${liveResult.acceptance.probability}% to accept`
                    : ''}
                </span>
              </>
            ) : liveRead.error ? (
              <span className="trade-cc__live-main trade-cc__live-main--down">{liveRead.error}</span>
            ) : (
              <>
                <span className="trade-cc__live-main">
                  Assets {assetDelta >= 0 ? '+' : ''}{assetDelta.toFixed(1)} wk
                </span>
                <span className="trade-cc__live-sub">Starter and title read appears when both sides are set.</span>
              </>
            )}
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
                    onClick={() => {
                      const owner = bootstrap.teams.find((team) => team.rosterId === partnerRosterId);
                      if (owner?.ownerId) openScoutingCard(owner.ownerId);
                    }}
                    type="button"
                  >
                    Open card
                  </button>
                ) : null}
              </div>
            </div>
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
          leagueId={stored.leagueId}
          partnerRosterId={partnerRosterId}
        />
      </section>

      {/* ── Verdict ── */}
      {result && result.available && result.you && result.them ? (
        (() => {
          const verdictKey = `verdict:${partnerRosterId}-${give.join(',')}-${getIds.join(',')}-${analysisDrops?.join(',') ?? ''}`;
          const verdictWhyOpen = openLaneWhy === verdictKey;
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

              {partnerRosterId != null ? (
                <div className="trade-cc__why-block">
                  <button
                    aria-expanded={verdictWhyOpen}
                    className="trade-cc__lane-why trade-cc__verdict-why"
                    onClick={() => toggleRationale(verdictKey, {
                      userId: stored.userId,
                      partnerRosterId,
                      give,
                      get: getIds,
                      traits: NEUTRAL_TRADE_TRAITS,
                      userDrops: analysisDrops,
                    })}
                    type="button"
                  >
                    Why this trade?
                  </button>
                  {verdictWhyOpen ? <TradeRationalePanel state={rationaleByKey[verdictKey]} /> : null}
                </div>
              ) : null}

              {result.fairCounter ? (
                <div className="trade-cc__counter">
                  <p className="trade-cc__counter-title">
                    {result.fairCounter.whoAdds === 'them'
                      ? `You're overpaying by ${result.fairCounter.gapBefore} pts of value`
                      : `You're winning this by ${result.fairCounter.gapBefore} pts of value`}
                  </p>
                  <p className="trade-cc__counter-body">
                    {result.fairCounter.whoAdds === 'them'
                      ? `Even it out: ask ${result.fairCounter.teamName} to add ${result.fairCounter.add
                          .map((a) => a.name)
                          .join(' + ')}`
                      : `Make it fair: add ${result.fairCounter.add
                          .map((a) => a.name)
                          .join(' + ')}`}
                    {result.fairCounter.allDepth ? '. Bench depth, not starters.' : '.'}
                  </p>
                  <button
                    className="trade-cc__counter-btn"
                    onClick={() => applyCounter(result.fairCounter!)}
                    type="button"
                  >
                    {result.fairCounter.whoAdds === 'them'
                      ? 'Add it to what you get'
                      : 'Add it to what you give'}
                  </button>
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
