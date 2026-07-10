import { useEffect, useState } from 'react';
import { type TradeAnalysis, type TradeSideDelta } from '../../services/leagueApi';

/**
 * Season-simulation impact for the trade being built in the Deals "Build a
 * trade" panel. Everything DISPLAYED (Δ championship %, playoff %, exp wins,
 * seed, and the Overpay/Fair/Steal verdict) comes purely from the sim + the
 * players in the trade — independent of the sliders. The two per-manager
 * sliders (Trade-friendliness, Relationship) feed ONLY the "Will they accept?"
 * logistic; they never touch the championship numbers.
 */

// ---- Acceptance + verdict math (all in championship percentage points) -----
const BAR0 = 0.6;      // loss-aversion baseline: Δc=0, neutral sliders -> ~40%
const K_FRIEND = 0.10; // championship-pts per friendliness notch
const K_REL = 0.05;    // championship-pts per relationship notch
const SPREAD = 1.5;    // logistic slope

function acceptanceProbability(theirDeltaTitle: number, friendliness: number, relationship: number) {
  const threshold = BAR0 - K_FRIEND * (friendliness - 5) - K_REL * (relationship - 5);
  const z = (theirDeltaTitle - threshold) / SPREAD;
  const p = 1 / (1 + Math.exp(-z));
  return Math.max(3, Math.min(97, Math.round(p * 100)));
}
function acceptanceBand(pct: number) {
  if (pct >= 80) return 'Very likely';
  if (pct >= 60) return 'Likely';
  if (pct >= 40) return 'Coin flip';
  if (pct >= 20) return 'Unlikely';
  return 'Long shot';
}

// Verdict is purely YOUR championship change — "should I do this?".
function verdict(youDeltaTitle: number) {
  if (youDeltaTitle >= 4) return { label: 'Steal', tone: 'steal' };
  if (youDeltaTitle >= 1.5) return { label: 'Good value', tone: 'good' };
  if (youDeltaTitle > -1.5) return { label: 'Fair', tone: 'fair' };
  if (youDeltaTitle > -4) return { label: 'Overpay', tone: 'overpay' };
  return { label: 'Big overpay', tone: 'overpay' };
}
// 0 = full overpay, 0.5 = fair, 1 = full steal.
const railPosition = (youDeltaTitle: number) => 0.5 + 0.5 * Math.tanh(youDeltaTitle / 6);

// ---- Per-manager slider persistence (user's private subjective read) --------
interface Traits { friendliness: number; relationship: number }
const traitKey = (leagueId: string, rosterId: number) => `og.trade.traits.${leagueId}.${rosterId}`;
function loadTraits(leagueId: string, rosterId: number | null): Traits {
  if (rosterId == null) return { friendliness: 5, relationship: 5 };
  try {
    const raw = localStorage.getItem(traitKey(leagueId, rosterId));
    if (raw) {
      const t = JSON.parse(raw);
      return { friendliness: clamp10(t.friendliness), relationship: clamp10(t.relationship) };
    }
  } catch { /* ignore */ }
  return { friendliness: 5, relationship: 5 };
}
function saveTraits(leagueId: string, rosterId: number | null, t: Traits) {
  if (rosterId == null) return;
  try { localStorage.setItem(traitKey(leagueId, rosterId), JSON.stringify(t)); } catch { /* ignore */ }
}
const clamp10 = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

export function TradeAnalyzerPanel({
  analysis,
  analyzing,
  error,
  drops,
  onOverrideDrops,
  userPlayers,
  nameOf,
  posOf,
  leagueId,
  partnerRosterId,
}: {
  analysis: TradeAnalysis | null;
  analyzing: boolean;
  error: string | null;
  drops: string[] | null;
  onOverrideDrops: (d: string[]) => void;
  userPlayers: string[];
  nameOf: (id: string) => string;
  posOf: (id: string) => string;
  leagueId: string;
  partnerRosterId: number | null;
}) {
  const [friendliness, setFriendliness] = useState(5);
  const [relationship, setRelationship] = useState(5);

  // Load this manager's saved sliders whenever the partner changes.
  useEffect(() => {
    const t = loadTraits(leagueId, partnerRosterId);
    setFriendliness(t.friendliness);
    setRelationship(t.relationship);
  }, [leagueId, partnerRosterId]);

  const update = (next: Partial<Traits>) => {
    const t = { friendliness, relationship, ...next };
    setFriendliness(t.friendliness);
    setRelationship(t.relationship);
    saveTraits(leagueId, partnerRosterId, t);
  };

  if (!analyzing && !error && !(analysis?.available && analysis.you && analysis.partner)) {
    return null;
  }

  const ready = analysis?.available && analysis.you && analysis.partner;
  const v = ready ? verdict(analysis!.you!.delta.titleProb) : null;
  const theirDelta = ready ? analysis!.partner!.delta.titleProb : 0;
  const acceptPct = ready ? acceptanceProbability(theirDelta, friendliness, relationship) : 0;
  const partnerName = ready ? analysis!.partner!.teamName : 'They';

  return (
    <div className="trade-analyzer-panel">
      {analyzing && !ready ? (
        <p className="trade-analyzer-panel__loading">Simulating rest of season…</p>
      ) : null}
      {error ? <p className="trade-analyzer-panel__error">{error}</p> : null}

      {ready ? (
        <>
          {/* Verdict rail — YOUR championship change only. */}
          <div className="trade-analyzer-panel__verdict-block">
            <div className="trade-analyzer-panel__verdict-head">
              <span className={`trade-analyzer-panel__verdict-stamp trade-analyzer-panel__verdict-stamp--${v!.tone}`}>
                {v!.label}
              </span>
              <span className="trade-analyzer-panel__verdict-sub">
                your championship <Delta v={analysis!.you!.delta.titleProb} pct />
              </span>
            </div>
            <div className="trade-analyzer-panel__rail">
              <span className="trade-analyzer-panel__rail-center" />
              <span
                className="trade-analyzer-panel__rail-marker"
                style={{ left: `${railPosition(analysis!.you!.delta.titleProb) * 100}%` }}
              />
            </div>
            <div className="trade-analyzer-panel__rail-labels">
              <span>Overpay</span><span>Fair</span><span>Steal</span>
            </div>
          </div>

          {/* Acceptance — their championship change + your subjective sliders. */}
          <div className="trade-analyzer-panel__accept">
            <div className="trade-analyzer-panel__accept-top">
              <span className="trade-analyzer-panel__accept-label">Will {partnerName} accept?</span>
              <span className="trade-analyzer-panel__accept-pct">{acceptPct}%</span>
              <span className="trade-analyzer-panel__accept-band">{acceptanceBand(acceptPct)}</span>
            </div>
            <p className="trade-analyzer-panel__accept-note">
              Driven by their championship change (<Delta v={theirDelta} pct />). The sliders below are
              your read on this manager and only nudge the odds — they don&apos;t change the numbers above.
            </p>
            <TraitSlider
              label="Trade-friendliness"
              hint="0 = stubborn hoarder · 10 = wheeler-dealer"
              value={friendliness}
              onChange={(n) => update({ friendliness: n })}
            />
            <TraitSlider
              label="Relationship"
              hint="0 = despises you · 10 = great terms"
              value={relationship}
              onChange={(n) => update({ relationship: n })}
            />
          </div>

          <Results
            result={analysis!}
            userPlayers={userPlayers}
            drops={drops}
            onOverrideDrops={onOverrideDrops}
            nameOf={nameOf}
            posOf={posOf}
          />
        </>
      ) : null}
    </div>
  );
}

function TraitSlider({
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
    <div className="trade-analyzer-panel__slider">
      <div className="trade-analyzer-panel__slider-head">
        <span className="trade-analyzer-panel__slider-label">{label}</span>
        <span className="trade-analyzer-panel__slider-value">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="trade-analyzer-panel__slider-hint">{hint}</span>
    </div>
  );
}

function Delta({ v, goodUp = true, pct = false }: { v: number; goodUp?: boolean; pct?: boolean }) {
  const good = goodUp ? v > 0 : v < 0;
  const color = v === 0 ? 'var(--text-muted, #8a8f98)' : good ? '#22c55e' : '#ff6b6b';
  return (
    <span style={{ color, fontWeight: 700 }}>
      {v > 0 ? '+' : ''}{v.toFixed(1)}{pct ? '%' : ''}
    </span>
  );
}

function SideCard({ side }: { side: TradeSideDelta }) {
  const rows = [
    { label: 'Championship', b: side.before.titleProb, a: side.after.titleProb, d: side.delta.titleProb, goodUp: true, pct: true },
    { label: 'Make playoffs', b: side.before.playoffProb, a: side.after.playoffProb, d: side.delta.playoffProb, goodUp: true, pct: true },
    { label: 'Expected wins', b: side.before.expWins, a: side.after.expWins, d: side.delta.expWins, goodUp: true, pct: false },
    { label: 'Avg seed', b: side.before.avgSeed, a: side.after.avgSeed, d: side.delta.avgSeed, goodUp: false, pct: false },
  ];
  return (
    <div className="trade-analyzer-panel__card">
      <p className="trade-analyzer-panel__card-team">
        {side.teamName} {side.isUser ? '(you)' : ''}
      </p>
      {rows.map((r) => (
        <div key={r.label} className="trade-analyzer-panel__row">
          <span className="trade-analyzer-panel__row-label">{r.label}</span>
          <span className="trade-analyzer-panel__row-val">
            {r.b.toFixed(1)}{r.pct ? '%' : ''} → {r.a.toFixed(1)}{r.pct ? '%' : ''}
            &nbsp;<Delta v={r.d} goodUp={r.goodUp} pct={r.pct} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Results({
  result,
  userPlayers,
  drops,
  onOverrideDrops,
  nameOf,
  posOf,
}: {
  result: TradeAnalysis;
  userPlayers: string[];
  drops: string[] | null;
  onOverrideDrops: (d: string[]) => void;
  nameOf: (id: string) => string;
  posOf: (id: string) => string;
}) {
  const needYou = result.dropsNeeded?.you ?? 0;
  const suggested = (drops ?? result.drops?.you.map((d) => d.playerId)) ?? [];

  return (
    <div className="trade-analyzer-panel__results">
      {result.warnings?.you ? (
        <div className="trade-analyzer-panel__warning">⚠ {result.warnings.you}</div>
      ) : null}

      {needYou > 0 ? (
        <div className="trade-analyzer-panel__drops">
          <p className="trade-analyzer-panel__drops-text">
            Puts you {needYou} over your roster limit. You&apos;d drop {needYou}{' '}
            {needYou === 1 ? 'player' : 'players'} (auto-picked; the sim reflects it). Override:
          </p>
          {Array.from({ length: needYou }).map((_, i) => (
            <select
              key={i}
              className="trade-analyzer-panel__drop-select"
              value={suggested[i] ?? ''}
              onChange={(e) => {
                const next = [...suggested];
                next[i] = e.target.value;
                onOverrideDrops(next.filter(Boolean));
              }}
            >
              {userPlayers.map((id) => (
                <option key={id} value={id}>
                  {posOf(id)} {nameOf(id)}
                </option>
              ))}
            </select>
          ))}
        </div>
      ) : null}

      {result.drops && result.drops.partner.length > 0 ? (
        <p className="trade-analyzer-panel__partner-drop">
          {result.partner!.teamName} would drop: {result.drops.partner.map((d) => d.name).join(', ')} (auto).
        </p>
      ) : null}

      <div className="trade-analyzer-panel__cards">
        <SideCard side={result.you!} />
        <SideCard side={result.partner!} />
      </div>
    </div>
  );
}
