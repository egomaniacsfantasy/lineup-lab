import { useMemo, useState } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
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

function rosterRows(bootstrap: LeagueBootstrap, rosterId: number) {
  const team = bootstrap.teams.find((t) => t.rosterId === rosterId);
  if (!team) return [];
  return team.players
    .map((id) => ({ id, player: bootstrap.players[id] }))
    .filter((row) => row.player)
    .sort((a, b) => a.player.position.localeCompare(b.player.position));
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
    stinginess: 50,
    starBias: 0,
    mode: 'balanced',
  });
  const [result, setResult] = useState<TradeResult | null>(null);
  const [isPricing, setIsPricing] = useState(false);

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

  const canPrice = partnerRosterId != null && give.length > 0 && getIds.length > 0;

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
              <span className="trade-cc__lane-price">
                <s>{formatAmericanOdds(lane.titleOddsBefore)}</s>{' '}
                <strong>{formatAmericanOdds(lane.titleOddsAfter)}</strong>
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
            <div className="trade-cc__pool">
              {rosterRows(bootstrap, userTeam.rosterId).map((row) => (
                <button
                  className={[
                    'trade-cc__pill',
                    give.includes(row.id) ? 'trade-cc__pill--on' : '',
                  ].join(' ')}
                  key={row.id}
                  onClick={() => toggle(give, setGive, row.id)}
                  type="button"
                >
                  <span className="trade-cc__pill-pos">{row.player.position}</span>
                  {row.player.name}
                </button>
              ))}
            </div>
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
              <div className="trade-cc__pool">
                {rosterRows(bootstrap, partnerRosterId).map((row) => (
                  <button
                    className={[
                      'trade-cc__pill',
                      getIds.includes(row.id) ? 'trade-cc__pill--on' : '',
                    ].join(' ')}
                    key={row.id}
                    onClick={() => toggle(getIds, setGetIds, row.id)}
                    type="button"
                  >
                    <span className="trade-cc__pill-pos">{row.player.position}</span>
                    {row.player.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="trade-cc__hint">Pick a manager to see their roster.</p>
            )}
          </div>
        </div>

        {/* per-trade partner read; nothing is fabricated, you tell us */}
        <div className="trade-cc__traits">
          <p className="trade-cc__traits-label">
            What&apos;s the other manager like? (shapes the acceptance read)
          </p>
          <div className="trade-cc__trait">
            <span>Negotiator</span>
            <div className="trade-cc__seg">
              {(['easy', 'normal', 'tough'] as const).map((level, i) => (
                <button
                  className={
                    [25, 50, 75][i] === traits.stinginess
                      ? 'trade-cc__seg-on'
                      : ''
                  }
                  key={level}
                  onClick={() => setTraits({ ...traits, stinginess: [25, 50, 75][i] })}
                  type="button"
                >
                  {level === 'easy' ? 'Easygoing' : level === 'tough' ? 'Tough' : 'Normal'}
                </button>
              ))}
            </div>
          </div>
          <div className="trade-cc__trait">
            <span>Star bias</span>
            <div className="trade-cc__seg">
              {(['none', 'some', 'homer'] as const).map((level, i) => (
                <button
                  className={
                    [0, 50, 90][i] === traits.starBias ? 'trade-cc__seg-on' : ''
                  }
                  key={level}
                  onClick={() => setTraits({ ...traits, starBias: [0, 50, 90][i] })}
                  type="button"
                >
                  {level === 'none' ? 'None' : level === 'some' ? 'Some' : 'Homer'}
                </button>
              ))}
            </div>
          </div>
          <div className="trade-cc__trait">
            <span>Mode</span>
            <div className="trade-cc__seg">
              {(['rebuild', 'balanced', 'win-now'] as const).map((mode) => (
                <button
                  className={traits.mode === mode ? 'trade-cc__seg-on' : ''}
                  key={mode}
                  onClick={() => setTraits({ ...traits, mode })}
                  type="button"
                >
                  {mode === 'win-now' ? 'Win now' : mode === 'rebuild' ? 'Rebuild' : 'Balanced'}
                </button>
              ))}
            </div>
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
              {result.acceptance?.band} to accept
            </span>
          </div>

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

          {/* two-sided title odds */}
          <div className="trade-cc__odds">
            <div className="trade-cc__odds-side">
              <p className="trade-cc__odds-name">{result.you.teamName} (you)</p>
              <p className="trade-cc__odds-value">
                title odds <s>{formatAmericanOdds(result.you.titleBefore)}</s>{' '}
                <strong>{formatAmericanOdds(result.you.titleAfter)}</strong>
              </p>
              <p className="trade-cc__odds-meta">
                Starting value {result.you.valueDelta >= 0 ? '+' : ''}
                {result.you.valueDelta} pts
              </p>
            </div>
            <div className="trade-cc__odds-side">
              <p className="trade-cc__odds-name">{result.them.teamName}</p>
              <p className="trade-cc__odds-value">
                title odds <s>{formatAmericanOdds(result.them.titleBefore)}</s>{' '}
                <strong>{formatAmericanOdds(result.them.titleAfter)}</strong>
              </p>
              <p className="trade-cc__odds-meta">
                Starting value {result.them.valueDelta >= 0 ? '+' : ''}
                {result.them.valueDelta} pts
              </p>
            </div>
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
