import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { ScoutingView } from './market/ScoutingView';
import { useScoutingCard } from '../contexts/ScoutingCardContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { toPlayer } from '../adapters/connectedLeague';
import {
  priceTrade,
  type TradeResult,
  type TradeTraits,
} from '../services/leagueApi';
import type { LeagueBootstrap } from '../services/leagueApi';
import { formatAmericanOdds } from '../utils/formatOdds';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import './TradePage.css';

const VERDICT_TONE: Record<string, string> = {
  'Smash accept': 'good',
  'Good value': 'good',
  Fair: 'neutral',
  'Justifiable overpay': 'warn',
  Overpay: 'bad',
};

const BAND_TONE: Record<string, string> = {
  'Smash accept': 'good',
  Likely: 'good',
  'Coin flip': 'neutral',
  Unlikely: 'warn',
  'Long shot': 'bad',
};

// Where the verdict sits on the fairness rail (0 = you're fleeced, 1 = steal).
const VERDICT_RAIL: Record<string, number> = {
  Overpay: 0.12,
  'Justifiable overpay': 0.32,
  Fair: 0.5,
  'Good value': 0.72,
  'Smash accept': 0.9,
};

function verdictRailPosition(verdict?: string) {
  return VERDICT_RAIL[verdict ?? 'Fair'] ?? 0.5;
}

function signedDelta(value = 0) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
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

function laneHeadlineTone(incoming: string, outgoing: string) {
  const length = incoming.length + outgoing.length;
  if (length > 40) return 'trade-cc__lane-title--tight';
  if (length > 30) return 'trade-cc__lane-title--snug';
  return '';
}

function generatedAt(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function leanStyle(position: number): CSSProperties {
  const left = Math.min(position, 0.5) * 100;
  const width = Math.abs(position - 0.5) * 100;
  return {
    '--lane-lean-pos': `${position * 100}%`,
    '--lane-lean-left': `${left}%`,
    '--lane-lean-width': `${width}%`,
  } as CSSProperties;
}

const NEUTRAL_TRADE_TRAITS: TradeTraits = {
  toughness: 5,
  dealAppetite: 5,
  fandomTeam: null,
  fandomLevel: 5,
};

// Starters first, in their lineup order, then the bench — the way a manager
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

function TradeDealsView() {
  const { bootstrap, stored, pricing, isLoading, error } = useLeagueConnection();
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
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');

  const lanes = useMemo(
    () => (pricing?.available
      ? (pricing.movers ?? []).filter((mover) => mover.kind === 'trade')
      : []),
    [pricing],
  );

  useEffect(() => {
    if (!bootstrap || !stored) return;
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
    setResult(null);
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }, [bootstrap, lanes, params, stored]);

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

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setResult(null);
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
    setResult(null);
    setParams({
      view: 'deals',
      managerRosterId: String(ownerRosterId),
      give: givePlayerIds.join(','),
      get: getPlayerIds.join(','),
    }, { replace: true });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const runPricing = async () => {
    if (partnerRosterId == null || give.length === 0 || getIds.length === 0) return;
    setIsPricing(true);
    try {
      const priced = await priceTrade(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give,
        get: getIds,
        traits: NEUTRAL_TRADE_TRAITS,
      });
      setResult(priced);
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
    try {
      const priced = await priceTrade(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give: nextGive,
        get: nextGet,
        traits: NEUTRAL_TRADE_TRAITS,
      });
      setResult(priced);
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
      ...givePlayerIds.map((id) => ({ id, side: 'send' })),
      ...getPlayerIds.map((id) => ({ id, side: 'get' })),
    ];
    const visibleChips = allChips.slice(0, 3);
    const hiddenCount = allChips.length - visibleChips.length;

    return (
      <span className={['trade-cc__lane-headshots', compact ? 'trade-cc__lane-headshots--compact' : ''].filter(Boolean).join(' ')}>
        {visibleChips.map((chip, index) => (
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
            style={{ '--lane-headshot-index': index } as CSSProperties}
          />
        ))}
        {hiddenCount > 0 ? (
          <span
            className="trade-cc__lane-headshot trade-cc__lane-headshot--more"
            style={{ '--lane-headshot-index': visibleChips.length } as CSSProperties}
          >
            +{hiddenCount}
          </span>
        ) : null}
      </span>
    );
  };

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
        {lanes.length > 0 ? (
          <>
          {lanes.map((lane, index) => {
            const getPlayerIds = laneIds(lane.getPlayerIds, lane.getPlayerId);
            const givePlayerIds = laneIds(lane.givePlayerIds, lane.givePlayerId);
            const fullIncoming = laneSideLabel(bootstrap, getPlayerIds, false);
            const fullOutgoing = laneSideLabel(bootstrap, givePlayerIds, false);
            const shouldCompress =
              getPlayerIds.length > 1 ||
              givePlayerIds.length > 1 ||
              fullIncoming.length + fullOutgoing.length > 34;
            const incoming = laneSideLabel(bootstrap, getPlayerIds, shouldCompress);
            const outgoing = laneSideLabel(bootstrap, givePlayerIds, shouldCompress);
            const marker = verdictRailPosition(lane.verdict);
            const time = generatedAt(lane.pricedAt);
            const compact = index > 0;

            return (
              <button
                className={[
                  'trade-cc__lane',
                  compact ? 'trade-cc__lane--compact' : '',
                ].filter(Boolean).join(' ')}
                key={`${lane.partnerRosterId}-${givePlayerIds.join(',')}-${getPlayerIds.join(',')}`}
                onClick={() => loadLane(lane)}
                type="button"
              >
                <span className="trade-cc__lane-top">
                  {renderLaneHeadshots(getPlayerIds, givePlayerIds, compact)}
                  <span className={['trade-cc__lane-title', laneHeadlineTone(incoming, outgoing)].filter(Boolean).join(' ')}>
                    <span>{incoming}</span>
                    <span className="trade-cc__lane-for">for</span>
                    <span>{outgoing}</span>
                  </span>
                </span>

                <span className="trade-cc__lane-mid">
                  <span className="trade-cc__lane-copy">
                    <span className="trade-cc__lane-manager">
                      {bootstrap.teams.find((team) => team.rosterId === lane.partnerRosterId)?.teamName ?? 'Manager'}
                    </span>
                    <span className="trade-cc__lane-numbers">
                      <span className="trade-cc__lane-you">you {signedDelta(lane.valueGain)}</span>
                      <span> · them {signedDelta(lane.partnerGain ?? 0)}</span>
                      <span> · {lane.acceptanceProbability ?? 50}% to accept</span>
                    </span>
                  </span>
                  <span className="trade-cc__lane-lean" style={leanStyle(marker)}>
                    <span className="trade-cc__lane-lean-labels">
                      <span>Overpay</span>
                      <span>Fair</span>
                      <span>Steal</span>
                    </span>
                    <span className="trade-cc__lane-lean-track">
                      <span
                        className={[
                          'trade-cc__lane-lean-fill',
                          marker >= 0.5
                            ? 'trade-cc__lane-lean-fill--steal'
                            : 'trade-cc__lane-lean-fill--overpay',
                        ].join(' ')}
                      />
                      <span className="trade-cc__lane-lean-notch" />
                      <span className="trade-cc__lane-lean-marker" />
                    </span>
                  </span>
                </span>

                <span className="trade-cc__lane-bottom">
                  <span className="trade-cc__lane-reason">
                    {lane.acceptanceReason ?? lane.detail}
                  </span>
                  {time ? (
                    <span className="trade-cc__lane-generated">generated at {time}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          </>
        ) : (
          <p className="trade-cc__empty-lane">No deal on this board improves both sides this week.</p>
        )}
      </section>

      {/* ── Builder ── */}
      <section className="trade-cc__builder" ref={builderRef}>
        <p className="trade-cc__kicker">Build a trade</p>
        <h2 className="trade-cc__title">Who is moving?</h2>

        <div className="trade-cc__columns">
          <div className="trade-cc__column">
            <p className="trade-cc__column-label">You send</p>
            {renderPool(userTeam.rosterId, give, setGive, giveSearch, setGiveSearch)}
          </div>

          <div className="trade-cc__column">
            <p className="trade-cc__column-label">You get</p>
            <select
              className="trade-cc__partner-select"
              onChange={(event) => {
                setPartnerRosterId(Number(event.target.value) || null);
                setGetIds([]);
                setResult(null);
              }}
              value={partnerRosterId ?? ''}
            >
              <option value="">Pick a manager…</option>
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
            {partnerRosterId != null ? (
              renderPool(partnerRosterId, getIds, setGetIds, getSearch, setGetSearch)
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
      </section>

      {/* ── Verdict ── */}
      {result && result.available && result.you && result.them ? (
        <section className="trade-cc__verdict">
          <div className="trade-cc__verdict-head">
            <span
              className={`trade-cc__verdict-tag trade-cc__verdict-tag--${
                VERDICT_TONE[result.verdict ?? 'Fair'] ?? 'neutral'
              }`}
            >
              {result.verdict}
            </span>
            <span
              className={`trade-cc__band trade-cc__band--${
                BAND_TONE[result.acceptance?.band ?? 'Coin flip'] ?? 'neutral'
              }`}
            >
              {result.acceptance?.probability ?? 50}% to accept · {result.acceptance?.band}
            </span>
          </div>

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
                {result.fairCounter.allDepth ? ' — bench depth, not starters.' : '.'}
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

          {/* fairness rail */}
          <div className="trade-cc__rail" aria-hidden="true">
            <span className="trade-cc__rail-track" />
            <span
              className="trade-cc__rail-marker"
              style={{ left: `${verdictRailPosition(result.verdict) * 100}%` }}
            />
          </div>
          <div className="trade-cc__rail-labels">
            <span>Overpay</span>
            <span>Fair</span>
            <span>Steal</span>
          </div>

          {/* Two-sided value. A single trade barely moves season title odds,
              so we lead with starting-lineup value (the number that actually
              moves) and show the title-odds shift only when it's real. */}
          <div className="trade-cc__odds">
            {[
              { side: result.you, isYou: true },
              { side: result.them, isYou: false },
            ].map(({ side, isYou }) => {
              const titleMoved = side.titleAfter !== side.titleBefore;
              return (
                <div className="trade-cc__odds-side" key={side.teamName}>
                  <p className="trade-cc__odds-name">
                    {side.teamName}
                    {isYou ? ' (you)' : ''}
                  </p>
                  <p
                    className={`trade-cc__odds-value ${
                      side.valueDelta > 0
                        ? 'trade-cc__odds-value--up'
                        : side.valueDelta < 0
                          ? 'trade-cc__odds-value--down'
                          : ''
                    }`}
                  >
                    {side.valueDelta >= 0 ? '+' : ''}
                    {side.valueDelta}
                    <span> pts/wk to starters</span>
                  </p>
                  {titleMoved ? (
                    <p className="trade-cc__odds-meta">
                      Title odds {formatAmericanOdds(side.titleBefore)} →{' '}
                      {formatAmericanOdds(side.titleAfter)}
                    </p>
                  ) : (
                    <p className="trade-cc__odds-meta">
                      Title odds unchanged (one trade rarely moves the season line)
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* why they would / wouldn't say yes */}
          <div className="trade-cc__reasons">
            <p className="trade-cc__reasons-title">Will they accept?</p>
            <ul>
              {(result.acceptance?.reasons ?? []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          {/* roster fit */}
          <div className="trade-cc__fit">
            <p className="trade-cc__reasons-title">Your depth after</p>
            <div className="trade-cc__fit-rows">
              {['QB', 'RB', 'WR', 'TE'].map((pos) => {
                const before = result.you!.depthBefore[pos] ?? 0;
                const after = result.you!.depthAfter[pos] ?? 0;
                const thin = after <= 1 && ['QB', 'TE'].includes(pos)
                  ? after < 1
                  : after <= 2 && ['RB', 'WR'].includes(pos);
                return (
                  <div className="trade-cc__fit-row" key={pos}>
                    <span className="trade-cc__fit-pos">{pos}</span>
                    <span
                      className={`trade-cc__fit-count ${
                        thin ? 'trade-cc__fit-count--thin' : ''
                      }`}
                    >
                      {before}
                      {after !== before ? ` → ${after}` : ''}
                      {thin ? ' · thin' : ''}
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
  const view = params.get('view') === 'scouting' ? 'scouting' : 'deals';

  const setView = (next: 'deals' | 'scouting') => {
    setParams({ view: next }, { replace: true });
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
