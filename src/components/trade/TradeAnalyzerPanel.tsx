import { type TradeAnalysis, type TradeSideDelta } from '../../services/leagueApi';
import { getAcceptanceLingo } from '../../utils/acceptanceLingo';
import { acceptanceProbability } from '../../utils/tradeAcceptance';
import { displayedDelta, displayedValue } from '../../utils/displayDelta';

/**
 * Season-simulation impact for the trade being built in the Deals "Build a
 * trade" panel. Everything DISPLAYED (Δ championship %, playoff %, exp wins,
 * seed, and the Overpay/Fair/Steal verdict) comes purely from the sim + the
 * players in the trade, independent of the sliders. The per-manager
 * friendliness/relationship read (set on the manager card) feeds ONLY the
 * "Will they accept?" logistic; it never touches the championship numbers.
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
  friendliness,
  relationship,
  showVerdict = true,
}: {
  analysis: TradeAnalysis | null;
  analyzing: boolean;
  error: string | null;
  friendliness: number;
  relationship: number;
  /** Retained for when the manager personas come back. */
  onEditRead?: () => void;
  showVerdict?: boolean;
}) {

  if (!analyzing && !error && !(analysis?.available && analysis.you && analysis.partner)) {
    return null;
  }

  const ready = analysis?.available && analysis.you && analysis.partner;
  const v = ready ? verdict(analysis!.you!.delta.titleProb) : null;
  const theirDelta = ready ? analysis!.partner!.delta.titleProb : 0;
  const acceptPct = ready ? acceptanceProbability(theirDelta, friendliness, relationship) : 0;
  const partnerName = ready ? analysis!.partner!.teamName : 'They';
  const acceptance = getAcceptanceLingo(acceptPct);
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

          <div className="trade-analyzer-panel__accept">
            <div className="trade-analyzer-panel__accept-top">
              <span className="trade-analyzer-panel__accept-label">Will {partnerName} accept?</span>
              <span className="trade-analyzer-panel__accept-pct">{acceptPct}%</span>
              <span className="trade-analyzer-panel__accept-band">{acceptance?.label ?? ''}</span>
            </div>
            {/* The manager personas are hidden for now. Friendliness and
                relationship still feed acceptance at their neutral defaults;
                what is gone is asking a first-time user to hand-tune two dials
                they have no way to have an opinion about yet. */}
          </div>

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

function SideCard({ side }: { side: TradeSideDelta }) {
  const rows = [
    { label: 'Championship', b: side.before.titleProb, a: side.after.titleProb, d: side.delta.titleProb, pct: true, lowerIsBetter: false },
    { label: 'Make playoffs', b: side.before.playoffProb, a: side.after.playoffProb, d: side.delta.playoffProb, pct: true, lowerIsBetter: false },
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
    { label: 'Expected wins', b: side.before.expWins, a: side.after.expWins, d: side.delta.expWins, pct: false, lowerIsBetter: false },
    // Avg seed: LOWER is better (the #1 seed beats the #6), so a drop is an
    // improvement — invert the chip so it reads green/+ when the seed goes down.
    { label: 'Avg seed', b: side.before.avgSeed, a: side.after.avgSeed, d: side.delta.avgSeed, pct: false, lowerIsBetter: true },
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
                <span>{before.toFixed(1)}{r.pct ? '%' : ''}</span>
                <span aria-hidden="true">→</span>
                <span>{after.toFixed(1)}{r.pct ? '%' : ''}</span>
                <span className="trade-analyzer-panel__delta-chip">
                  <Delta v={r.lowerIsBetter ? -rowDelta : rowDelta} pct={r.pct} />
                </span>
              </span>
            </div>
          );
        })()
      ))}
    </div>
  );
}

function Results({
  result,
}: {
  result: TradeAnalysis;
}) {
  return (
    <div className="trade-analyzer-panel__results">
      <div className="trade-analyzer-panel__cards">
        <SideCard side={result.you!} />
        <SideCard side={result.partner!} />
      </div>
    </div>
  );
}
