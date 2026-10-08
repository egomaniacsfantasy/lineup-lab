import { type TradeAnalysis, type TradeSideDelta, type TradeValueLine } from '../../services/leagueApi';
import { displayedDelta, displayedValue } from '../../utils/displayDelta';

/**
 * Season-simulation impact for the trade being built in the Deals "Build a
 * trade" panel. Everything DISPLAYED (Δ championship %, playoff %, exp wins,
 * seed, the value line and the Overpay/Fair/Steal verdict) comes purely from
 * the sim + the players in the trade. No acceptance estimate is shown.
 */



// Verdict is purely YOUR championship change: "should I do this?".
function verdict(youDeltaTitle: number) {
  if (youDeltaTitle >= 4) return { label: 'Steal', tone: 'steal' };
  if (youDeltaTitle >= 1.5) return { label: 'Good value', tone: 'good' };
  if (youDeltaTitle > -1.5) return { label: 'Fair', tone: 'fair' };
  if (youDeltaTitle > -4) return { label: 'Overpay', tone: 'overpay' };
  return { label: 'Big overpay', tone: 'overpay' };
}
// 0 = full overpay, 0.5 = fair, 1 = full steal.
const railPosition = (youDeltaTitle: number) => 0.5 + 0.5 * Math.tanh(youDeltaTitle / 6);

export function TradeAnalyzerPanel({
  analysis,
  analyzing,
  error,
  showVerdict = true,
}: {
  analysis: TradeAnalysis | null;
  analyzing: boolean;
  error: string | null;
  /** Unused since acceptance was removed; callers may still pass them. */
  friendliness?: number;
  relationship?: number;
  /** Retained for when the manager personas come back. */
  onEditRead?: () => void;
  showVerdict?: boolean;
}) {

  if (!analyzing && !error && !(analysis?.available && analysis.you && analysis.partner)) {
    return null;
  }

  const ready = analysis?.available && analysis.you && analysis.partner;
  const v = ready ? verdict(analysis!.you!.delta.titleProb) : null;
  return (
    <div className="trade-analyzer-panel">
      {analyzing && !ready ? (
        <p className="trade-analyzer-panel__loading">Simulating rest of season…</p>
      ) : null}
      {error ? <p className="trade-analyzer-panel__error">{error}</p> : null}

      {ready ? (
        <>
          {showVerdict ? (
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
          ) : null}

          <Results
            result={analysis!}
          />
        </>
      ) : null}
    </div>
  );
}

function Delta({ v, pct = false }: { v: number; pct?: boolean }) {
  const color = v === 0 ? 'var(--text-muted, #8a8f98)' : v > 0 ? '#22c55e' : '#ff6b6b';
  return (
    <span style={{ color, fontWeight: 700 }}>
      {v > 0 ? '+' : ''}{v.toFixed(1)}{pct ? '%' : ''}
    </span>
  );
}

function displayedMetric(value: number) {
  return displayedValue(value);
}

type CiKey = 'titleProb' | 'playoffProb' | 'expWins' | 'avgSeed';

/** "+/- 1.2" in the row's own units (pp for percentages). */
function Plus({ v, pct }: { v: number | null | undefined; pct: boolean }) {
  if (v == null || !Number.isFinite(v)) return null;
  return <span className="trade-analyzer-panel__ci">±{v.toFixed(pct ? 1 : 2)}</span>;
}

function SideCard({ side }: { side: TradeSideDelta }) {
  const ci = side.ci ?? null;
  const rows: { label: string; b: number; a: number; d: number; pct: boolean; lowerIsBetter: boolean; ciKey?: CiKey }[] = [
    { label: 'Championship', b: side.before.titleProb, a: side.after.titleProb, d: side.delta.titleProb, pct: true, lowerIsBetter: false, ciKey: 'titleProb' },
    { label: 'Make playoffs', b: side.before.playoffProb, a: side.after.playoffProb, d: side.delta.playoffProb, pct: true, lowerIsBetter: false, ciKey: 'playoffProb' },
    // Current-week matchup win % — only in-season (null off-season).
    ...(side.before.weekWinProb != null
      ? [{
          label: 'Win this week',
          b: side.before.weekWinProb,
          a: side.after.weekWinProb ?? 0,
          d: side.delta.weekWinProb ?? 0,
          pct: true,
          lowerIsBetter: false,
        }]
      : []),
    { label: 'Expected wins', b: side.before.expWins, a: side.after.expWins, d: side.delta.expWins, pct: false, lowerIsBetter: false, ciKey: 'expWins' },
    // Avg seed: LOWER is better (the #1 seed beats the #6), so a drop is an
    // improvement — invert the chip so it reads green/+ when the seed goes down.
    { label: 'Avg seed', b: side.before.avgSeed, a: side.after.avgSeed, d: side.delta.avgSeed, pct: false, lowerIsBetter: true, ciKey: 'avgSeed' },
  ];
  return (
    <div className="trade-analyzer-panel__card">
      <p className="trade-analyzer-panel__card-team">
        {side.teamName} {side.isUser ? '(you)' : ''}
      </p>
      {rows.map((r) => (
        (() => {
          const before = displayedMetric(r.b);
          const after = displayedMetric(r.a);
          const rowDelta = displayedDelta(r.b, r.a);
          const dCi = ci && r.ciKey ? ci.delta[r.ciKey] : null;
          // The change's own interval includes zero: the sim cannot tell it from no change.
          const noise = dCi != null && Math.abs(r.d) <= dCi;
          return (
            <div
              key={r.label}
              className={[
                'trade-analyzer-panel__row',
                r.label === 'Championship' ? 'trade-analyzer-panel__row--primary' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="trade-analyzer-panel__row-label">{r.label}</span>
              <span className="trade-analyzer-panel__row-val">
                <span>{before.toFixed(1)}{r.pct ? '%' : ''}{ci && r.ciKey ? <Plus v={ci.before[r.ciKey]} pct={r.pct} /> : null}</span>
                <span aria-hidden="true">→</span>
                <span>{after.toFixed(1)}{r.pct ? '%' : ''}{ci && r.ciKey ? <Plus v={ci.after[r.ciKey]} pct={r.pct} /> : null}</span>
                <span
                  className={['trade-analyzer-panel__delta-chip', noise ? 'trade-analyzer-panel__delta-chip--noise' : ''].filter(Boolean).join(' ')}
                  title={noise ? 'Too small to trust: the ± range includes zero.' : undefined}
                >
                  <Delta v={r.lowerIsBetter ? -rowDelta : rowDelta} pct={r.pct} />
                  {dCi != null ? <Plus v={dCi} pct={r.pct} /> : null}
                </span>
                {noise ? <span className="trade-analyzer-panel__noise">noise</span> : null}
              </span>
            </div>
          );
        })()
      ))}
    </div>
  );
}

function DropsNote({ drops }: { drops: TradeAnalysis['drops'] }) {
  const you = drops?.you ?? [];
  if (you.length === 0) return null;
  return (
    <div className="trade-analyzer-panel__drops">
      {you.map((d) => (
        <p key={d.playerId} className="trade-analyzer-panel__drop">
          {d.week != null && d.whenReturns ? (
            <>Drop <strong>{d.name}</strong>{d.bye ? ` (BYE ${d.bye})` : ''} when <strong>{d.whenReturns}</strong> returns (wk {d.week}). Your IR slot holds the spot open until then.</>
          ) : (
            <>Drop <strong>{d.name}</strong>{d.bye ? ` (BYE ${d.bye})` : ''} to fit this trade.</>
          )}
        </p>
      ))}
    </div>
  );
}

function pts(v: number) {
  return Math.round(v).toLocaleString();
}

/** Rest-of-season projected points each side sends and receives (every player in the
 *  deal, IR included, through the last playoff week), with 95% ranges. */
function ValueLines({ result }: { result: TradeAnalysis }) {
  const v = result.value;
  if (!v || !result.you || !result.partner) return null;
  const line = (name: string, x: TradeValueLine) => (
    <p className="trade-analyzer-panel__value-row">
      <span className="trade-analyzer-panel__value-team">{name}</span>
      <span>sends <strong>{pts(x.sent)}</strong> <span className="trade-analyzer-panel__ci">±{pts(x.sentRange)}</span></span>
      <span>gets <strong>{pts(x.received)}</strong> <span className="trade-analyzer-panel__ci">±{pts(x.receivedRange)}</span></span>
      <span className={x.net >= 0 ? 'trade-analyzer-panel__value-net--up' : 'trade-analyzer-panel__value-net--down'}>
        net <strong>{x.net > 0 ? '+' : ''}{pts(x.net)}</strong> <span className="trade-analyzer-panel__ci">±{pts(x.netRange)}</span>
      </span>
    </p>
  );
  return (
    <div className="trade-analyzer-panel__value">
      <p className="trade-analyzer-panel__value-heading">Projected points, rest of season</p>
      {line(result.you.teamName, v.you)}
      {line(result.partner.teamName, v.partner)}
    </div>
  );
}

function Results({
  result,
}: {
  result: TradeAnalysis;
}) {
  const league = result.league ?? [];
  return (
    <div className="trade-analyzer-panel__results">
      <ValueLines result={result} />
      <div className="trade-analyzer-panel__cards">
        <SideCard side={result.you!} />
        <SideCard side={result.partner!} />
      </div>
      <DropsNote drops={result.drops} />
      {league.length > 0 ? (
        <div className="trade-analyzer-panel__league">
          <p className="trade-analyzer-panel__league-heading">
            Rest of the league <span className="trade-analyzer-panel__league-sub">(how this deal moves everyone else)</span>
          </p>
          <div className="trade-analyzer-panel__cards">
            {league.map((side) => (
              <SideCard key={side.rosterId} side={side} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
