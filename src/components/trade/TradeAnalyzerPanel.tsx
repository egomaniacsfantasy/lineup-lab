import { type TradeAnalysis, type TradeSideDelta } from '../../services/leagueApi';

/**
 * Presentational season-simulation impact for the trade being built in the Deals
 * "Build a trade" panel. The parent runs the analysis (as part of "Price this
 * trade") and passes the result in; this renders Δ championship %, playoff %,
 * expected wins, and seed for both sides, plus any forced roster drop. Drop
 * overrides call back to the parent to re-run the sim.
 */
export function TradeAnalyzerPanel({
  analysis,
  analyzing,
  error,
  drops,
  onOverrideDrops,
  userPlayers,
  nameOf,
  posOf,
}: {
  analysis: TradeAnalysis | null;
  analyzing: boolean;
  error: string | null;
  drops: string[] | null;
  onOverrideDrops: (d: string[]) => void;
  userPlayers: string[];
  nameOf: (id: string) => string;
  posOf: (id: string) => string;
}) {
  if (!analyzing && !error && !(analysis?.available && analysis.you && analysis.partner)) {
    return null;
  }
  return (
    <div className="trade-analyzer-panel">
      {analyzing && !analysis ? (
        <p className="trade-analyzer-panel__loading">Simulating rest of season…</p>
      ) : null}

      {error ? <p className="trade-analyzer-panel__error">{error}</p> : null}

      {analysis?.available && analysis.you && analysis.partner ? (
        <Results
          result={analysis}
          userPlayers={userPlayers}
          drops={drops}
          onOverrideDrops={onOverrideDrops}
          nameOf={nameOf}
          posOf={posOf}
        />
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
  const you = result.you!;
  const verdict = you.delta.titleProb > 0.1 ? 'Make this trade' : you.delta.titleProb < -0.1 ? 'Pass' : 'Roughly even';
  const vColor = you.delta.titleProb > 0.1 ? '#22c55e' : you.delta.titleProb < -0.1 ? '#ff6b6b' : 'var(--text-muted, #8a8f98)';
  const needYou = result.dropsNeeded?.you ?? 0;
  const suggested = (drops ?? result.drops?.you.map((d) => d.playerId)) ?? [];

  return (
    <div className="trade-analyzer-panel__results">
      <p className="trade-analyzer-panel__verdict" style={{ color: vColor }}>
        {verdict} — championship <Delta v={you.delta.titleProb} pct />
      </p>

      {result.warnings?.you ? (
        <div className="trade-analyzer-panel__warning">⚠ {result.warnings.you}</div>
      ) : null}

      {needYou > 0 ? (
        <div className="trade-analyzer-panel__drops">
          <p className="trade-analyzer-panel__drops-text">
            Puts you {needYou} over your roster limit — you&apos;d drop {needYou}{' '}
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
        <SideCard side={you} />
        <SideCard side={result.partner!} />
      </div>
    </div>
  );
}
