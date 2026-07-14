import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { SimulationLoader } from '../components/ui/SimulationLoader';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { ScoutingView } from './market/ScoutingView';
import '../components/trade/TradeAnalyzerPanel.css';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
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

function isSamePositionOneForOneLane(lane: MarketMover, bootstrap: LeagueBootstrap) {
  const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
  const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
  if (givePlayerIds.length !== 1 || getPlayerIds.length !== 1) return false;
  const givePosition = bootstrap.players[givePlayerIds[0]]?.position;
  const getPosition = bootstrap.players[getPlayerIds[0]]?.position;
  return Boolean(givePosition && getPosition && givePosition === getPosition);
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
        Only nudges the acceptance odds, never the championship numbers. Saved for this manager.
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
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');
  const [friendliness, setFriendliness] = useState(5);
  const [relationship, setRelationship] = useState(5);
  const [showRead, setShowRead] = useState(false);
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false);
  const [isEditingTrade, setIsEditingTrade] = useState(true);
  const [openLaneWhy, setOpenLaneWhy] = useState<string | null>(null);
  const refreshKeyRef = useRef<string | null>(null);
  const verdictRef = useRef<HTMLElement | null>(null);
  const selectedPartner = useMemo(
    () => partners.find((team) => team.rosterId === partnerRosterId) ?? null,
    [partnerRosterId, partners],
  );

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
      const tradeLanes = (pricing.movers ?? []).filter((mover) =>
        mover.kind === 'trade' && laneBelongsToLeague(mover, bootstrap, stored.leagueId),
      );
      const filteredCount = tradeLanes.filter((lane) => isSamePositionOneForOneLane(lane, bootstrap)).length;
      if (import.meta.env.DEV && filteredCount > 0) {
        console.info('[market] filtered same-position trade suggestions', filteredCount);
      }
      return tradeLanes.filter((lane) => !isSamePositionOneForOneLane(lane, bootstrap));
    },
    [bootstrap, pricing, stored],
  );

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
    const analysisPromise = runAnalysis(nextGive, nextGet, null);
    void Promise.allSettled([pricePromise, analysisPromise]).finally(() => {
      setIsPricing(false);
      setIsEditingTrade(false);
    });
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
    if (isPricing || counterLoading) return;
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    resetOutputs();
  };

  const loadLane = (lane: MarketMover) => {
    const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
    const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
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
      parts.push(`${lane.acceptanceProbability}% to accept.`);
    }
    if (lane.acceptanceReason) {
      parts.push(lane.acceptanceReason);
    }
    return parts.join(' ');
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
    const analysisPromise = runAnalysis(give, getIds, null);
    try {
      await Promise.allSettled([pricePromise, analysisPromise]);
    } finally {
      setIsPricing(false);
      setIsEditingTrade(false);
    }
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

  const renderPlayerUnit = (ids: string[], label: string, tone: 'send' | 'get' = 'send') => (
    <span className={`trade-cc__deal-unit trade-cc__deal-unit--${tone}`}>
      <span className="trade-cc__deal-unit-label">{label}</span>
      <span className="trade-cc__deal-unit-body">
        <span className="trade-cc__deal-unit-headshots" aria-hidden="true">
          {ids.slice(0, 3).map((id) => (
            <PlayerHeadshot
              className="trade-cc__deal-unit-headshot"
              fallbackClassName="trade-cc__deal-unit-headshot-fallback"
              imageClassName="trade-cc__deal-unit-headshot-image"
              key={id}
              player={toPlayer(id, bootstrap.players)}
            />
          ))}
          {ids.length > 3 ? <span className="trade-cc__deal-unit-more">+{ids.length - 3}</span> : null}
        </span>
        <span className="trade-cc__deal-unit-names">
          {ids.map((id) => playerName(bootstrap, id)).join(' + ') || 'No players'}
        </span>
      </span>
    </span>
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
        <h2 className="trade-cc__section-label">Managers you match with</h2>
        {lanes.length > 0 ? (
          <>
          {lanes.map((lane, index) => {
            const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
            const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
            const compact = index > 0;
            const partner = partners.find((team) => team.rosterId === lane.partnerRosterId);
            const acceptance = lane.acceptanceProbability ?? 50;
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
                    <span className="trade-cc__lane-manager">{partner?.teamName ?? 'Manager'}</span>
                    <span className="trade-cc__lane-numbers">
                      <span className="trade-cc__lane-you">you {lane.valueGain != null ? signedPct(lane.valueGain).replace('%', '') : '+0.0'} pts/wk</span>
                      <span> · them {lane.partnerGain != null ? signedPct(lane.partnerGain).replace('%', '') : '+0.0'} pts/wk</span>
                    </span>
                  </span>
                  <span className="trade-cc__lane-acceptance" style={acceptanceStyle(acceptance)}>
                    <span className="trade-cc__lane-acceptance-label">
                      <span>{acceptance}% to accept</span>
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
                  <p className="trade-cc__lane-rationale" onClick={(event) => event.stopPropagation()}>
                    {laneWhy(lane)}
                  </p>
                ) : null}
              </article>
            );
          })}
          </>
        ) : (
          <p className="trade-cc__empty-lane">
            No suggested deals priced yet. Build your own below.
          </p>
        )}
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
            {renderPlayerUnit(give, 'You send', 'send')}
            <span className="trade-cc__deal-strip-arrow" aria-hidden="true">⇄</span>
            {renderPlayerUnit(getIds, 'You get', 'get')}
            <span className="trade-cc__deal-strip-partner">
              {selectedPartner?.teamName ?? 'Manager'}
            </span>
            {isPricing ? (
              <SimulationLoader label="Pricing this trade" />
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
                    {renderPlayerUnit(counter.add.map((add) => add.id), 'Add', counter.whoAdds === 'you' ? 'send' : 'get')}
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
