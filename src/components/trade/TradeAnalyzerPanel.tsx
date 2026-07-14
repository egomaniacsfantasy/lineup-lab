import { useState } from 'react';
import { type TradeAnalysis, type TradeSideDelta } from '../../services/leagueApi';
import { formatAcceptanceSentence, getAcceptanceLingo } from '../../utils/acceptanceLingo';
import { acceptanceProbability } from '../../utils/tradeAcceptance';

/**
 * Season-simulation impact for the trade being built in the Deals "Build a
 * trade" panel. Everything DISPLAYED (Δ championship %, playoff %, exp wins,
 * seed, and the Overpay/Fair/Steal verdict) comes purely from the sim + the
 * players in the trade, independent of the sliders. The per-manager
 * friendliness/relationship read (set on the manager card) feeds ONLY the
 * "Will they accept?" logistic; it never touches the championship numbers.
 */

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function assumedDropLine(subject: string, names: string[]) {
  if (names.length === 0) return null;
  return `Sim assumes ${subject} drop ${joinNames(names)}.`;
}

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
  readSource = 'neutral',
  readSourceLabel = 'neutral file',
  showVerdict = true,
}: {
  analysis: TradeAnalysis | null;
  analyzing: boolean;
  error: string | null;
  friendliness: number;
  relationship: number;
  readSource?: 'neutral' | 'scouted' | 'override';
  readSourceLabel?: string;
  showVerdict?: boolean;
}) {
  const [whyOpen, setWhyOpen] = useState(false);

  if (!analyzing && !error && !(analysis?.available && analysis.you && analysis.partner)) {
    return null;
  }

  const ready = analysis?.available && analysis.you && analysis.partner;
  const v = ready ? verdict(analysis!.you!.delta.titleProb) : null;
  const theirDelta = ready ? analysis!.partner!.delta.titleProb : 0;
  const acceptPct = ready ? acceptanceProbability(theirDelta, friendliness, relationship) : 0;
  const partnerName = ready ? analysis!.partner!.teamName : 'They';
  const acceptance = getAcceptanceLingo(acceptPct);
  const sourceText =
    readSource === 'override'
      ? 'your override'
      : readSource === 'scouted'
        ? `scouted: ${readSourceLabel}`
        : 'neutral file';
  const whyLines = ready
    ? [
        `Your championship ${analysis!.you!.delta.titleProb > 0 ? '+' : ''}${analysis!.you!.delta.titleProb.toFixed(1)}%.`,
        `Their championship ${theirDelta > 0 ? '+' : ''}${theirDelta.toFixed(1)}%.`,
        formatAcceptanceSentence(acceptPct),
        assumedDropLine('you', analysis!.drops?.you.map((drop) => drop.name) ?? []),
        assumedDropLine(partnerName, analysis!.drops?.partner.map((drop) => drop.name) ?? []),
      ].filter((line): line is string => Boolean(line))
    : [];

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
            <p className="trade-analyzer-panel__accept-note">
              Driven by their championship change (<Delta v={theirDelta} pct />), nudged by your read on{' '}
              {partnerName} ({sourceText}; friendliness {friendliness}, relationship {relationship}).
              Set that on their card above. It never changes the championship numbers.
            </p>
            <button
              aria-expanded={whyOpen}
              className="trade-analyzer-panel__why-toggle"
              onClick={() => setWhyOpen((current) => !current)}
              type="button"
            >
              Why this trade?
            </button>
            {whyOpen ? (
              <div className="trade-analyzer-panel__why-details">
                {whyLines.map((line) => (
                  <p className="trade-analyzer-panel__why-line" key={line}>
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <Results
            result={analysis!}
          />
        </>
      ) : null}
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

function displayedMetric(value: number) {
  return Number(value.toFixed(1));
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
        (() => {
          const before = displayedMetric(r.b);
          const after = displayedMetric(r.a);
          const displayedDelta = displayedMetric(after - before);
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
                  <Delta v={displayedDelta} goodUp={r.goodUp} pct={r.pct} />
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
