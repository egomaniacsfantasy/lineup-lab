import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
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

const NFL_TEAMS: [string, string][] = [
  ['ARI', 'Cardinals'], ['ATL', 'Falcons'], ['BAL', 'Ravens'], ['BUF', 'Bills'],
  ['CAR', 'Panthers'], ['CHI', 'Bears'], ['CIN', 'Bengals'], ['CLE', 'Browns'],
  ['DAL', 'Cowboys'], ['DEN', 'Broncos'], ['DET', 'Lions'], ['GB', 'Packers'],
  ['HOU', 'Texans'], ['IND', 'Colts'], ['JAX', 'Jaguars'], ['KC', 'Chiefs'],
  ['LAC', 'Chargers'], ['LAR', 'Rams'], ['LV', 'Raiders'], ['MIA', 'Dolphins'],
  ['MIN', 'Vikings'], ['NE', 'Patriots'], ['NO', 'Saints'], ['NYG', 'Giants'],
  ['NYJ', 'Jets'], ['PHI', 'Eagles'], ['PIT', 'Steelers'], ['SEA', 'Seahawks'],
  ['SF', '49ers'], ['TB', 'Buccaneers'], ['TEN', 'Titans'], ['WAS', 'Commanders'],
];

const TOUGH_TAGS = (v: number) => (v <= 3 ? 'Pushover' : v <= 6 ? 'Fair' : v <= 8 ? 'Tough' : 'Shark');
const APPETITE_TAGS = (v: number) =>
  v <= 3 ? 'Ghosts offers' : v <= 6 ? 'Selective' : v <= 8 ? 'Active' : 'Wheeler-dealer';
const FANDOM_TAGS = (v: number) => (v <= 3 ? 'Casual' : v <= 6 ? 'Fan' : v <= 8 ? 'Diehard' : 'Homer');

/** Draggable 1–10 dial in the ember identity. */
function RangeDial({
  label,
  value,
  onChange,
  tag,
  ends,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  tag: (value: number) => string;
  ends: [string, string];
}) {
  return (
    <div className="trade-cc__dial">
      <div className="trade-cc__dial-head">
        <span className="trade-cc__dial-label">{label}</span>
        <span className="trade-cc__dial-tag">{tag(value)}</span>
      </div>
      <input
        aria-label={label}
        className="trade-cc__range"
        max={10}
        min={1}
        onChange={(event) => onChange(Number(event.target.value))}
        step={1}
        style={{ '--fill': `${((value - 1) / 9) * 100}%` } as CSSProperties}
        type="range"
        value={value}
      />
      <div className="trade-cc__dial-ends">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

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

export function TradePage() {
  const { bootstrap, stored, pricing } = useLeagueConnection();

  const userTeam = bootstrap?.teams.find((t) => t.isUser) ?? null;
  const partners = useMemo(
    () => (bootstrap ? bootstrap.teams.filter((t) => !t.isUser) : []),
    [bootstrap],
  );

  const [partnerRosterId, setPartnerRosterId] = useState<number | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [getIds, setGetIds] = useState<string[]>([]);
  const [traits, setTraits] = useState<TradeTraits>({
    toughness: 5,
    dealAppetite: 5,
    fandomTeam: null,
    fandomLevel: 5,
  });
  const [result, setResult] = useState<TradeResult | null>(null);
  const [isPricing, setIsPricing] = useState(false);
  const [giveSearch, setGiveSearch] = useState('');
  const [getSearch, setGetSearch] = useState('');

  // Live re-price when you adjust the scouting dials, so the acceptance read
  // (and the meter) update as you drag — no need to hit the button again.
  useEffect(() => {
    if (!result || !result.available) return;
    if (!stored || partnerRosterId == null || give.length === 0 || getIds.length === 0) return;
    const timer = setTimeout(async () => {
      const priced = await priceTrade(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give,
        get: getIds,
        traits,
      });
      setResult(priced);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traits.toughness, traits.dealAppetite, traits.fandomTeam, traits.fandomLevel]);

  // Connected leagues get the Trade Command Center; the mock targets are
  // demo-only and never render next to a real roster.
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
        <h1 className="visually-hidden">Trade Command Center</h1>
        <SeasonalNotice>
          The Trade Command Center is built for redraft leagues. Dynasty and
          keeper trades turn on player age and pick value, which we don&apos;t
          price yet. It&apos;s coming.
        </SeasonalNotice>
      </div>
    );
  }

  const lanes = pricing?.available
    ? (pricing.movers ?? []).filter((mover) => mover.kind === 'trade')
    : [];

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setResult(null);
  };

  const loadLane = (givePlayerId?: string, getPlayerId?: string) => {
    if (!getPlayerId) return;
    const ownerRosterId = bootstrap.teams.find((t) =>
      t.players.includes(getPlayerId),
    )?.rosterId;
    if (ownerRosterId == null) return;
    setPartnerRosterId(ownerRosterId);
    setGive(givePlayerId ? [givePlayerId] : []);
    setGetIds([getPlayerId]);
    setResult(null);
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
        traits,
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
        traits,
      });
      setResult(priced);
    } finally {
      setIsPricing(false);
    }
  };

  const canPrice = partnerRosterId != null && give.length > 0 && getIds.length > 0;

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
      <h1 className="visually-hidden">Trade Command Center</h1>

      {/* ── Partner finder ── */}
      {lanes.length > 0 ? (
        <section className="trade-cc__finder">
          <p className="trade-cc__kicker">Deals on the board</p>
          <h2 className="trade-cc__title">Managers you match with</h2>
          <p className="trade-cc__sub">
            Both sides upgrade a starter. Tap one to load it into the builder.
          </p>
          {lanes.map((lane) => (
            <button
              className="trade-cc__lane"
              key={lane.headline + lane.detail}
              onClick={() => loadLane(lane.givePlayerId, lane.getPlayerId)}
              type="button"
            >
              <span>
                <span className="trade-cc__lane-headline">{lane.headline}</span>
                <span className="trade-cc__lane-detail">{lane.detail}</span>
              </span>
              <span className="trade-cc__lane-gain">
                <strong>+{(lane.valueGain ?? 0).toFixed(1)}</strong>
                <span> pts/wk to your starters</span>
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {/* ── Builder ── */}
      <section className="trade-cc__builder">
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
              renderPool(partnerRosterId, getIds, setGetIds, getSearch, setGetSearch)
            ) : (
              <p className="trade-cc__hint">Pick a manager to see their roster.</p>
            )}
          </div>
        </div>

        {/* Per-trade read on the other manager: dials you set, nothing
            fabricated. This is the "scouting report" that makes the
            acceptance call feel like a real league, not a calculator. */}
        <div className="trade-cc__traits">
          <p className="trade-cc__traits-label">Scout the other manager</p>

          <RangeDial
            ends={['Pushover', 'Shark']}
            label="Negotiator"
            onChange={(v) => setTraits({ ...traits, toughness: v })}
            tag={TOUGH_TAGS}
            value={traits.toughness}
          />
          <RangeDial
            ends={['Ghosts offers', 'Wheeler-dealer']}
            label="Deal appetite"
            onChange={(v) => setTraits({ ...traits, dealAppetite: v })}
            tag={APPETITE_TAGS}
            value={traits.dealAppetite}
          />

          <div className="trade-cc__fandom">
            <div className="trade-cc__fandom-row">
              <span className="trade-cc__dial-label">Fandom</span>
              <select
                className="trade-cc__fandom-select"
                onChange={(event) =>
                  setTraits({ ...traits, fandomTeam: event.target.value || null })
                }
                value={traits.fandomTeam ?? ''}
              >
                <option value="">No team bias</option>
                {NFL_TEAMS.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {traits.fandomTeam ? (
              <RangeDial
                ends={['Casual fan', 'Diehard homer']}
                label={`${traits.fandomTeam} bias`}
                onChange={(v) => setTraits({ ...traits, fandomLevel: v })}
                tag={FANDOM_TAGS}
                value={traits.fandomLevel}
              />
            ) : null}
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
                  ? `Even it out: ask for ${result.fairCounter.add
                      .map((a) => a.name)
                      .join(' + ')} from ${result.fairCounter.teamName}.`
                  : `Make it fair: add ${result.fairCounter.add
                      .map((a) => a.name)
                      .join(' + ')} to your side.`}
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
              style={{ left: `${(VERDICT_RAIL[result.verdict ?? 'Fair'] ?? 0.5) * 100}%` }}
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
